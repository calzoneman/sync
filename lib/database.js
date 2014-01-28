var mysql = require("mysql");
var bcrypt = require("bcrypt");
var $util = require("./utilities");
var Logger = require("./logger");
var Config = require("./config");

var pool = null;
var global_ipbans = {};

module.exports.init = function () {
    pool = mysql.createPool({
        host: Config.get("mysql.server"),
        user: Config.get("mysql.user"),
        password: Config.get("mysql.password"),
        database: Config.get("mysql.database"),
        multipleStatements: true
    });

    // Test the connection
    pool.getConnection(function (err, conn) {
        if(err) {
            Logger.errlog.log("! DB connection failed");
            return;
        } else {
            module.exports.initGlobalTables();
            // Refresh global IP bans
            module.exports.listGlobalBans();
        }
    });

    global_ipbans = {};
    module.exports.users = require("./database/accounts");
    module.exports.users.init();
    module.exports.channels = require("./database/channels");
    module.exports.channels.init();
};

/**
 * Execute a database query
 */
module.exports.query = function (query, sub, callback) {
    // 2nd argument is optional
    if (typeof sub === "function") {
        callback = sub;
        sub = false;
    }

    if (typeof callback !== "function") {
        callback = blackHole;
    }

    pool.getConnection(function (err, conn) {
        if (err) {
            Logger.errlog.log("! DB connection failed: " + err);
            callback("Database failure", null);
        } else {
            function cback(err, res) {
                if (err) {
                    Logger.errlog.log("! DB query failed: " + query);
                    if (sub) {
                        Logger.errlog.log("Substitutions: " + sub);
                    }
                    Logger.errlog.log(err);
                    callback("Database failure", null);
                } else {
                    callback(null, res);
                }
                conn.release();
            }

            if (sub) {
                conn.query(query, sub, cback);
            } else {
                conn.query(query, cback);
            }
        }
    });
};

/**
 * Dummy function to be used as a callback when none is provided
 */
function blackHole() {

}

module.exports.initGlobalTables = function () {
    var fail = function (table) {
        return function (err) {
            if (err) {
                Logger.errlog.log("Failed to initialize " + table);
            }
        };
    };
    var query = module.exports.query;
    query("CREATE TABLE IF NOT EXISTS `global_bans` (" +
            "`ip` VARCHAR(39) NOT NULL," +
            "`reason` VARCHAR(255) NOT NULL," +
          "PRIMARY KEY (`ip`)) " +
          "CHARACTER SET utf8",
          fail("global_bans"));

    query("CREATE TABLE IF NOT EXISTS `password_reset` (" +
            "`ip` VARCHAR(39) NOT NULL," +
            "`name` VARCHAR(20) NOT NULL," +
            "`hash` VARCHAR(64) NOT NULL," +
            "`email` VARCHAR(255) NOT NULL," +
            "`expire` BIGINT NOT NULL," +
          "PRIMARY KEY (`name`))" +
          "CHARACTER SET utf8",
          fail("password_reset"));

    query("CREATE TABLE IF NOT EXISTS `user_playlists` (" +
            "`user` VARCHAR(20) NOT NULL," +
            "`name` VARCHAR(255) NOT NULL," +
            "`contents` MEDIUMTEXT NOT NULL," +
            "`count` INT NOT NULL," +
            "`duration` INT NOT NULL," +
          "PRIMARY KEY (`user`, `name`))" +
          "CHARACTER SET utf8",
          fail("user_playlists"));

    query("CREATE TABLE IF NOT EXISTS `aliases` (" +
            "`visit_id` INT NOT NULL AUTO_INCREMENT," +
            "`ip` VARCHAR(39) NOT NULL," +
            "`name` VARCHAR(20) NOT NULL," +
            "`time` BIGINT NOT NULL," +
          "PRIMARY KEY (`visit_id`), INDEX (`ip`))",
          fail("aliases"));

    query("CREATE TABLE IF NOT EXISTS `stats` (" +
            "`time` BIGINT NOT NULL," +
            "`usercount` INT NOT NULL," +
            "`chancount` INT NOT NULL," +
            "`mem` INT NOT NULL," +
          "PRIMARY KEY (`time`))" +
          "CHARACTER SET utf8",
          fail("stats"));

    query("CREATE TABLE IF NOT EXISTS `meta` (" +
            "`key` VARCHAR(255) NOT NULL," +
            "`value` TEXT NOT NULL," +
          "PRIMARY KEY (`key`))" +
          "CHARACTER SET utf8",
          function (err, res) {
        if (err) {
            fail("meta")(err);
            return;
        }

        require("./dbupdate").checkVersion();
    });
};

/* REGION global bans */

/**
 * Check if an IP address is globally banned
 */
module.exports.isGlobalIPBanned = function (ip, callback) {
    if (typeof callback !== "function") {
        return;
    }

    // TODO account for IPv6
    // Also possibly just change this to allow arbitrary
    // ranges instead of only /32, /24, /16
    const re = /(\d+)\.(\d+)\.(\d+)\.(\d+)/;
    // Account for range banning
    var s16 = ip.replace(re, "$1.$2");
    var s24 = ip.replace(re, "$1.$2.$3");

    var banned = ip in global_ipbans ||
                 s16 in global_ipbans ||
                 s24 in global_ipbans;

    callback(null, banned);
};

/**
 * Retrieve all global bans from the database.
 * Cache locally in global_bans
 */
module.exports.listGlobalBans = function (callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    module.exports.query("SELECT * FROM global_bans WHERE 1", function (err, res) {
        if (err) {
            callback(err, null);
            return;
        }

        global_ipbans = {};
        for (var i = 0; i < res.length; i++) {
            global_ipbans[res[i].ip] = res[i];
        }

        callback(null, global_ipbans);
    });
};

/**
 * Globally ban by IP
 */
module.exports.globalBanIP = function (ip, reason, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var query = "INSERT INTO global_bans (ip, reason) VALUES (?, ?)" +
                " ON DUPLICATE KEY UPDATE reason=?";
    module.exports.query(query, [ip, reason, reason], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        module.exports.listGlobalBans();
        callback(null, res);
    });
};

/**
 * Remove a global IP ban
 */
module.exports.globalUnbanIP = function (ip, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }


    var query = "DELETE FROM global_bans WHERE ip=?";
    module.exports.query(query, [ip], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        module.exports.listGlobalBans();
        callback(null, res);
    });
};

/* END REGION */

/* password recovery */

module.exports.addPasswordReset = function (data, cb) {
    if (typeof cb !== "function") {
        cb = blackHole;
    }

    var ip = data.ip || "";
    var name = data.name;
    var email = data.email;
    var hash = data.hash;
    var expire = data.expire;

    if (!name || !hash) {
        cb("Internal error: Must provide name and hash to insert a new password reset", null);
        return;
    }

    module.exports.query("INSERT INTO `password_reset` (`ip`, `name`, `email`, `hash`, `expire`) " +
                         "VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip=?, hash=?, email=?, expire=?",
                         [ip, name, email, hash, expire, ip, hash, email, expire], cb);
};

module.exports.deletePasswordReset = function (hash) {
    module.exports.query("DELETE FROM `password_reset` WHERE hash=?", [hash]);
};

/*
module.exports.genPasswordReset = function (ip, name, email, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT email FROM registrations WHERE uname=?";
    module.exports.query(query, [name], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback("Provided username does not exist", null);
            return;
        }

        if(res[0].email != email) {
            callback("Provided email does not match user's email", null);
            return;
        }

        var hash = hashlib.sha256($util.randomSalt(32) + name);
        var expire = Date.now() + 24*60*60*1000;
        query = "INSERT INTO password_reset " +
                "(ip, name, hash, email, expire) VALUES (?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE hash=?, expire=?";
        module.exports.query(query, [ip, name, hash, email, expire, hash, expire],
                   function (err, res) {
            if(err) {
                callback(err, null);
                return;
            }

            callback(null, hash);
        });
    });
};

module.exports.recoverUserPassword = function (hash, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT * FROM password_reset WHERE hash=?";
    module.exports.query(query, [hash], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback("Invalid password reset link", null);
            return;
        }

        if(Date.now() > res[0].expire) {
            module.exports.query("DELETE FROM password_reset WHERE hash=?", [hash]);
            callback("Link expired.  Password resets are valid for 24hr",
                     null);
            return;
        }

        var name = res[0].name;

        resetUserPassword(res[0].name, function (err, pw) {
            if(err) {
                callback(err, null);
                return;
            }

            module.exports.query("DELETE FROM password_reset WHERE hash=?", [hash]);
            callback(null, {
                name: name,
                pw: pw
            });
        });
    });
};

module.exports.resetUserPassword = function (name, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var pwChars = "abcdefghijkmnopqrstuvwxyz023456789";
    var pw = "";
    for(var i = 0; i < 10; i++)
        pw += pwChars[parseInt(Math.random() * 33)];

    bcrypt.hash(pw, 10, function (err, data) {
        if(err) {
            Logger.errlog.log("bcrypt error: " + err);
            callback("Password reset failure", null);
            return;
        }

        var query = "UPDATE registrations SET pw=? WHERE uname=?";
        module.exports.query(query, [data, name], function (err, res) {
            if(err) {
                callback(err, null);
                return;
            }

            callback(null, pw);
        });
    });
};
*/

/* user playlists */

/**
 * Retrieve all of a user's playlists
 */
module.exports.listUserPlaylists = function (name, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT name, count, duration FROM user_playlists WHERE user=?";
    module.exports.query(query, [name], callback);
};

/**
 * Retrieve a user playlist by (user, name) pair
 */
module.exports.getUserPlaylist = function (username, plname, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT contents FROM user_playlists WHERE " +
                "user=? AND name=?";

    module.exports.query(query, [username, plname], function (err, res) {
        if (err) {
            callback(err, null);
            return;
        }

        if (res.length == 0) {
            callback("Playlist does not exist", null);
            return;
        }

        var pl = null;
        try {
            pl = JSON.parse(res[0].contents);
        } catch(e) {
            callback("Malformed playlist JSON", null);
            return;
        }
        callback(null, pl);
    });
};

/**
 * Saves a user playlist.  Overwrites if the playlist keyed by
 * (user, name) already exists
 */
module.exports.saveUserPlaylist = function (pl, username, plname, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var tmp = [], time = 0;
    for(var i in pl) {
        var e = {
            id: pl[i].media.id,
            title: pl[i].media.title,
            seconds: pl[i].media.seconds,
            type: pl[i].media.type
        };
        time += pl[i].media.seconds;
        tmp.push(e);
    }
    var count = tmp.length;
    var plText = JSON.stringify(tmp);

    var query = "INSERT INTO user_playlists VALUES (?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE contents=?, count=?, duration=?";

    var params = [username, plname, plText, count, time,
                  plText, count, time];

    module.exports.query(query, params, callback);
};

/**
 * Deletes a user playlist
 */
module.exports.deleteUserPlaylist = function (username, plname, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var query = "DELETE FROM user_playlists WHERE user=? AND name=?";
    module.exports.query(query, [username, plname], callback);
};

/* aliases */

/**
 * Records a user or guest login in the aliases table
 */
module.exports.recordVisit = function (ip, name, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var time = Date.now();
    var query = "DELETE FROM aliases WHERE ip=? AND name=?;" +
                "INSERT INTO aliases VALUES (NULL, ?, ?, ?)";

    module.exports.query(query, [ip, name, ip, name, time], callback);
};

/**
 * Deletes alias rows older than the given time
 */
module.exports.cleanOldAliases = function (expiration, callback) {
    if (typeof callback === "undefined") {
        callback = blackHole;
    }

    var query = "DELETE FROM aliases WHERE time < ?";
    module.exports.query(query, [Date.now() - expiration], callback);
};

/**
 * Retrieves a list of aliases for an IP address
 */
module.exports.getAliases = function (ip, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT name,time FROM aliases WHERE ip";
    // if the ip parameter is a /24 range, we want to match accordingly
    if(ip.match(/^\d+\.\d+\.\d+$/)) {
        query += " LIKE ?";
        ip += ".%";
    } else {
        query += "=?";
    }

    query += " ORDER BY time DESC LIMIT 5";

    module.exports.query(query, [ip], function (err, res) {
        var names = null;
        if(!err) {
            names = res.map(function (row) { return row.name; });
        }

        callback(err, names);
    });
};

/**
 * Retrieves a list of IPs that a name as logged in from
 */
module.exports.getIPs = function (name, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT ip FROM aliases WHERE name=?";
    module.exports.query(query, [name], function (err, res) {
        var ips = null;
        if(!err) {
            ips = res.map(function (row) { return row.ip; });
        }

        callback(err, ips);
    });
};

/* END REGION */

/* REGION action log */

/*
module.exports.recordAction = function (ip, name, action, args,
                                            callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "INSERT INTO actionlog (ip, name, action, args, time) " +
                "VALUES (?, ?, ?, ?, ?)";

    module.exports.query(query, [ip, name, action, args, Date.now()], callback);
};

module.exports.clearActions = function (actions, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var list = [];
    for(var i in actions)
        list.push("?");

    var actionlist = "(" + list.join(",") + ")";

    var query = "DELETE FROM actionlog WHERE action IN " + actionlist;
    module.exports.query(query, actions, callback);
};

module.exports.clearSingleAction = function (item, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "DELETE FROM actionlog WHERE ip=? AND time=?";
    module.exports.query(query, [item.ip, item.time], callback);
};


module.exports.recentRegistrationCount = function (ip, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT * FROM actionlog WHERE ip=? " +
                "AND action='register-success' AND time > ?";

    module.exports.query(query, [ip, Date.now() - 48 * 3600 * 1000],
               function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res.length);
    });
};

module.exports.listActionTypes = function (callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT DISTINCT action FROM actionlog";
    module.exports.query(query, function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        var types = [];
        res.forEach(function (row) {
            types.push(row.action);
        });
        callback(null, types);
    });
};

module.exports.listActions = function (types, callback) {
    if(typeof callback !== "function")
        return;

    var list = [];
    for(var i in types)
        list.push("?");

    var actionlist = "(" + list.join(",") + ")";
    var query = "SELECT * FROM actionlog WHERE action IN " + actionlist;
    module.exports.query(query, types, callback);
};
*/

/* END REGION */

/* REGION stats */

module.exports.addStatPoint = function (time, ucount, ccount, mem, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var query = "INSERT INTO stats VALUES (?, ?, ?, ?)";
    module.exports.query(query, [time, ucount, ccount, mem], callback);
};

module.exports.pruneStats = function (before, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var query = "DELETE FROM stats WHERE time < ?";
    module.exports.query(query, [before], callback);
};

module.exports.listStats = function (callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT * FROM stats ORDER BY time ASC";
    module.exports.query(query, callback);
};

/* END REGION */
