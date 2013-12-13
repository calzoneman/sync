var mysql = require("mysql");
var hashlib = require("node_hash");
var bcrypt = require("bcrypt");
var $util = require("./utilities");
var Logger = require("./logger");

var cfg = {};
var pool = null;
var global_ipbans = {};

module.exports.init = function (cfg) {
    cfg = cfg;
    pool = mysql.createPool({
        host: cfg["mysql-server"],
        user: cfg["mysql-user"],
        password: cfg["mysql-pw"],
        database: cfg["mysql-db"],
        multipleStatements: true
    });

    // Test the connection
    pool.getConnection(function (err, conn) {
        if(err) {
            Logger.errlog.log("! DB connection failed");
            return;
        } else {
            // Refresh global IP bans
            module.exports.listGlobalIPBans();
        }
    });

    global_ipbans = {};
    module.exports.users = require("./database/accounts");
    module.exports.users.init();
};

module.exports.query = function (query, sub, callback) {
    // 2nd argument is optional
    if(typeof sub === "function") {
        callback = sub;
        sub = false;
    }

    if(typeof callback !== "function")
        callback = blackHole;

    pool.getConnection(function (err, conn) {
        if(err) {
            Logger.errlog.log("! DB connection failed: " + err);
            callback("Database failure", null);
        } else {
            function cback(err, res) {
                if(err) {
                    Logger.errlog.log("! DB query failed: " + query);
                    if(sub)
                        Logger.errlog.log("Substitutions: " + sub);
                    Logger.errlog.log(err);
                    callback("Database failure", null);
                } else {
                    callback(null, res);
                }
                conn.end();
            }

            if(sub) {
                conn.query(query, sub, cback);
            } else {
                conn.query(query, cback);
            }
        }
    });
}; 

function blackHole() {

}

module.exports.oldinit = function () {
    var query;
    // Create channel table
    query = ["CREATE TABLE IF NOT EXISTS `channels` (",
                "`id` INT NOT NULL AUTO_INCREMENT,",
                "`name` VARCHAR(255) NOT NULL,",
                "`owner` VARCHAR(20) NOT NULL,",
                "PRIMARY KEY(`id`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create channels table");
        }
    });

    // Create registration table
    query = ["CREATE TABLE IF NOT EXISTS `registrations` (",
                "`id` INT NOT NULL AUTO_INCREMENT,",
                "`uname` VARCHAR(20) NOT NULL,",
                "`pw` VARCHAR(64) NOT NULL,",
                "`global_rank` INT NOT NULL,",
                "`session_hash` VARCHAR(64) NOT NULL,",
                "`expire` BIGINT NOT NULL,",
                "`profile_image` VARCHAR(255) NOT NULL,",
                "`profile_text` TEXT NOT NULL,",
                "`email` VARCHAR(255) NOT NULL,",
                "PRIMARY KEY (`id`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create registration table");
        }
    });

    // Create global bans table
    query = ["CREATE TABLE IF NOT EXISTS `global_bans` (",
                "`ip` VARCHAR(15) NOT NULL,",
                "`note` VARCHAR(255) NOT NULL,",
                "PRIMARY KEY (`ip`))",
             "ENGINE = MyISAM ", 
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create global ban table");
        }
    });

    // Create password reset table
    query = ["CREATE TABLE IF NOT EXISTS `password_reset` (",
                "`ip` VARCHAR(15) NOT NULL,",
                "`name` VARCHAR(20) NOT NULL,",
                "`hash` VARCHAR(64) NOT NULL,",
                "`email` VARCHAR(255) NOT NULL,",
                "`expire` BIGINT NOT NULL,",
                "PRIMARY KEY (`name`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create password reset table");
        }
    });

    // Create user playlist table
    query = ["CREATE TABLE IF NOT EXISTS `user_playlists` (",
                "`user` VARCHAR(20) NOT NULL,",
                "`name` VARCHAR(255) NOT NULL,",
                "`contents` MEDIUMTEXT NOT NULL,",
                "`count` INT NOT NULL,",
                "`time` INT NOT NULL,",
                "PRIMARY KEY (`user`, `name`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create user playlist table");
        }
    });

    // Create user aliases table
    query = ["CREATE TABLE IF NOT EXISTS `aliases` (",
                "`visit_id` INT NOT NULL AUTO_INCREMENT,",
                "`ip` VARCHAR(15) NOT NULL,",
                "`name` VARCHAR(20) NOT NULL,",
                "`time` BIGINT NOT NULL,",
                "PRIMARY KEY (`visit_id`), INDEX (`ip`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create user aliases table");
        }
    });

    // Create action log table
    query = ["CREATE TABLE IF NOT EXISTS `actionlog` (",
                "`ip` VARCHAR(15) NOT NULL,",
                "`name` VARCHAR(20) NOT NULL,",
                "`action` VARCHAR(255) NOT NULL,",
                "`args` TEXT NOT NULL,",
                "`time` BIGINT NOT NULL,",
                "PRIMARY KEY (`ip`, `time`), INDEX (`action`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create action log table");
        }
    });

    // Create stats table
    query = ["CREATE TABLE IF NOT EXISTS `stats` (",
                "`time` BIGINT NOT NULL,",
                "`usercount` INT NOT NULL,",
                "`chancount` INT NOT NULL,",
                "`mem` INT NOT NULL,",
                "PRIMARY KEY (`time`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    module.exports.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create stats table");
        }
    });

    // Refresh global IP bans
    module.exports.listGlobalIPBans();
};

/* REGION global bans */

module.exports.isGlobalIPBanned = function (ip, callback) {
    if(typeof callback !== "function")
        return;
    const re = /(\d+)\.(\d+)\.(\d+)\.(\d+)/;
    // Account for range banning
    var s16 = ip.replace(re, "$1.$2");
    var s24 = ip.replace(re, "$1.$2.$3");

    var banned = ip in global_ipbans ||
                 s16 in global_ipbans ||
                 s24 in global_ipbans;

    callback(null, banned);
};

module.exports.listGlobalIPBans = function (callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    module.exports.query("SELECT * FROM global_bans WHERE 1", function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        global_ipbans = {};
        for(var i in res) {
            global_ipbans[res[i].ip] = res[i].note;
        }

        callback(null, global_ipbans);
    });
};

module.exports.setGlobalIPBan = function (ip, reason, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "INSERT INTO global_bans VALUES (?, ?)" +
                " ON DUPLICATE KEY UPDATE note=?";
    module.exports.query(query, [ip, reason, reason], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        module.exports.listGlobalIPBans();
        callback(null, res);
    });
};

module.exports.clearGlobalIPBan = function (ip, callback) {
    if(typeof callback !== "function")
        callback = blackHole;


    var query = "DELETE FROM global_bans WHERE ip=?";
    module.exports.query(query, [ip], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res);
    });
};

/* END REGION */

/* REGION channels */

module.exports.loadChannelData = function (chan, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(chan.name)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT * FROM channels WHERE name=?";

    module.exports.query(query, [chan.name], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback("channel_unregistered", null);
            return;
        }

        if (chan.dead) {
            callback("channel_dead", null);
            return;
        }

        if(res[0].name != chan.name)
            chan.name = res[0].name;
        chan.registered = true;

        // Load bans
        query = "SELECT * FROM `chan_" + chan.name + "_bans`";
        module.exports.query(query, function (err, res) {
            if (chan.dead) {
                callback("channel_dead", null);
                return;
            }

            if(err) {
                callback(err, null);
                return;
            }

            for(var i in res) {
                var r = res[i];
                if(r.ip === "*")
                    chan.namebans[r.name] = r.banner;
                else
                    chan.ipbans[r.ip] = [r.name, r.banner];
            }

            chan.logger.log("*** Loaded channel from database");
            callback(null, true);
        });
    });
};

module.exports.setChannelRank = function (channame, name, rank, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_ranks` " +
                "(name, rank) VALUES (?, ?) " +
                "ON DUPLICATE KEY UPDATE rank=?";

    module.exports.query(query, [name, rank, rank], callback);
};

module.exports.insertChannelRank = function (channame, name, rank, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_ranks` " +
                "(name, rank) VALUES (?, ?) " +
                "ON DUPLICATE KEY UPDATE rank=rank";

    module.exports.query(query, [name, rank], callback);
};

module.exports.listChannelRanks = function (channame, callback) {
    if(typeof callback !== "function")
        return;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT * FROM `chan_" + channame + "_ranks` WHERE 1";
    module.exports.query(query, callback);
};

module.exports.addToLibrary = function (channame, media, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name");
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_library` " +
                "(id, title, seconds, type) " +
                "VALUES (?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE id=id";
    var params = [
        media.id,
        media.title,
        media.seconds,
        media.type
    ];
    module.exports.query(query, params, callback);
};

module.exports.removeFromLibrary = function (channame, id, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "DELETE FROM `chan_" + channame + "_library` WHERE id=?";
    module.exports.query(query, [id], callback);
};

module.exports.getLibraryItem = function (channame, id, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var m = id.match(/([\w-\/\.:]+)/);
    if (m) {
        id = m[1];
    } else {
        callback("Invalid ID", null);
        return;
    }

    var query = "SELECT id, title, seconds, type FROM " +
                "`chan_" + channame + "_library` WHERE id=?";

    module.exports.query(query, [id], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res.length > 0 ? res[0] : null);
    });
};

module.exports.searchLibrary = function (channame, term, callback) {
    if(typeof callback !== "function")
        return;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT id, title, seconds, type FROM " +
                "`chan_" + channame + "_library` WHERE title LIKE ?";

    module.exports.query(query, ["%" + term + "%"], callback);
};

module.exports.addChannelBan = function (channame, ip, name, banBy,
                                             callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_bans`" +
                "(ip, name, banner) VALUES (?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE ip=ip";

    module.exports.query(query, [ip, name, banBy], callback);
};

module.exports.clearChannelIPBan = function (channame, ip, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "DELETE FROM `chan_" + channame + "_bans` WHERE ip=?";
    module.exports.query(query, [ip], callback);
};

module.exports.clearChannelNameBan = function (channame, name,
                                                   callback) {
    if(typeof callback !== "function") {
        callback = blackHole;
        return;
    }

    var query = "DELETE FROM `chan_" + channame + "_bans` WHERE ip='*'" +
                "AND name=?";

    module.exports.query(query, [name], callback);
};

/* END REGION */

/* REGION Auth */

module.exports.isUsernameTaken = function (name, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT id FROM registrations WHERE uname=?";
    module.exports.query(query, [name], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res.length > 0);
    });
};

var regInProgress = {};
module.exports.registerUser = function (name, pw, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidUserName(name)) {
        callback("Invalid username", null);
        return;
    }

    if (regInProgress[name]) {
        callback("Registration is already in progress", null);
        return;
    }

    regInProgress[name] = true;

    var postRegister = function (err, res) {
        if(err) {
            delete regInProgress[name];
            callback(err, null);
            return;
        }

        createLoginSession(name, function (err, hash) {
            if(err) {
                delete regInProgress[name];
                // Don't confuse people into thinking the registration
                // failed when it was the session that failed
                callback(null, "");
                return;
            }

            delete regInProgress[name];
            callback(null, hash);
        });
    };

    isUsernameTaken(name, function (err, taken) {
        if(err) {
            delete regInProgress[name];
            callback(err, null);
            return;
        }

        if(taken) {
            delete regInProgress[name];
            callback("Username already taken", null);
            return;
        }

        bcrypt.hash(pw, 10, function (err, hash) {
            if(err) {
                delete regInProgress[name];
                callback(err, null);
                return;
            }

            var query = "INSERT INTO registrations VALUES " +
                        "(NULL, ?, ?, 1, '', 0, '', '', '')";

            module.exports.query(query, [name, hash], postRegister);
        });
    });
};

module.exports.userLogin = function (name, pw, session, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var postLogin = function (err, row) {
        if(err) {
            callback(err, null);
            return;
        }

        if(row.session_hash) {
            callback(null, row);
            return;
        }

        createLoginSession(name, function (err, hash) {
            if(err) {
                callback(err, null);
                return;
            }

            row.session_hash = hash;
            callback(null, row);
        });
    };

    if(session) {
        module.exports.userLoginSession(name, session, postLogin);
    } else if(pw) {
        module.exports.userLoginPassword(name, pw, postLogin);
    } else {
        callback("Invalid login", null);
    }
};

module.exports.userLoginPassword = function (name, pw, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT * FROM registrations WHERE uname=?";
    module.exports.query(query, [name], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback("User does not exist", null);
            return;
        }

        var row = res[0];

        bcrypt.compare(pw, row.pw, function (err, valid) {
            if(valid) {
                // For security, erase the password field before returning
                delete row["pw"];
                row.session_hash = "";
                callback(null, row);
                return;
            }

            // Possibly could be a SHA256 hash from an *ancient* version
            // of CyTube

            var sha = hashlib.sha256(pw);
            if(sha == row.pw) {
                // Replace it
                bcrypt.hash(pw, 10, function (err, hash) {
                    if(!err) {
                        module.exports.query("UPDATE registrations SET pw=? "+
                                   "WHERE uname=?", [hash, name]);
                    }
                });

                // Remove password field before returning
                delete row["pw"];
                row.session_hash = "";
                callback(null, row);
            } else {
                callback("Invalid username/password combination", null);
            }
        });
    });
};

module.exports.userLoginSession = function (name, session, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT * FROM registrations WHERE uname=? AND " +
                "session_hash=?";

    module.exports.query(query, [name, session], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback("Session expired", null);
            return;
        }

        var row = res[0];

        if(row.expire < Date.now()) {
            callback("Session expired", null);
            return;
        }

        callback(null, row);
    });
};

module.exports.createLoginSession = function (name, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var salt = $util.randomSalt(32);
    var hash = hashlib.sha256(salt + name);

    var query = "UPDATE registrations SET session_hash=?, expire=? " +
                "WHERE uname=?";

    module.exports.query(query, [hash, Date.now() + 604800000, name],
               function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, hash);
    });
};

module.exports.setUserPassword = function (name, pw, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    bcrypt.hash(pw, 10, function (err, hash) {
        if(err) {
            callback(err, null);
            return;
        }

        var query = "UPDATE registrations SET pw=? WHERE uname=?";
        module.exports.query(query, [hash, name], callback);
    });
};

module.exports.getGlobalRank = function (name, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT global_rank FROM registrations WHERE uname=?";

    module.exports.query(query, [name], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback(null, 0);
            return;
        }

        callback(null, res[0].global_rank);
    });
};

module.exports.listGlobalRanks = function (names, callback) {
    if(typeof callback !== "function")
        return;

    if(typeof names === "string")
        names = [names];

    // Build the query template (?, ?, ?, ?, ...)
    var nlist = [];
    for(var i in names)
        nlist.push("?");
    nlist = "(" + nlist.join(",") + ")";

    var query = "SELECT global_rank FROM registrations WHERE uname IN " +
                nlist;
    module.exports.query(query, names, function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback(null, 0);
            return;
        }

        for(var i in res)
            res[i] = res[i].global_rank;

        callback(null, res);
    });
};

/* END REGION */

/* REGION users */

module.exports.searchUser = function (name, callback) {
    if(typeof callback !== "function")
        return;

    // NOTE: No SELECT * here because I don't want to risk exposing
    // the user's password hash
    var query = "SELECT id, uname, global_rank, profile_image, " +
                "profile_text, email FROM registrations WHERE " +
                "uname LIKE ?";

    module.exports.query(query, ["%" + name + "%"], callback);
};

/* rank */

module.exports.setGlobalRank = function (name, rank, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "UPDATE registrations SET global_rank=? WHERE uname=?";
    module.exports.query(query, [rank, name], callback);
};

/* email and profile */

module.exports.getUserProfile = function (name, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT profile_image, profile_text FROM registrations " +
                "WHERE uname=?";

    module.exports.query(query, [name], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        var def = {
            profile_image: "",
            profile_text: ""
        };

        callback(null, res.length > 0 ? res[0] : def);
    });
};

module.exports.setUserProfile = function (name, data, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "UPDATE registrations SET profile_image=?, profile_text=?" +
                "WHERE uname=?";

    module.exports.query(query, [data.image, data.text, name], callback);
};

module.exports.setUserEmail = function (name, email, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "UPDATE registrations SET email=? WHERE uname=?";

    module.exports.query(query, [email, name], callback);
};

/* password recovery */

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

/* user playlists */

module.exports.listUserPlaylists = function (name, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT name, count, time FROM user_playlists WHERE user=?";
    module.exports.query(query, [name], callback);
};

module.exports.getUserPlaylist = function (username, plname, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT contents FROM user_playlists WHERE " +
                "user=? AND name=?";

    module.exports.query(query, [username, plname], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
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

module.exports.saveUserPlaylist = function (pl, username, plname,
                                                callback) {
    if(typeof callback !== "function")
        callback = blackHole;

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
                "ON DUPLICATE KEY UPDATE contents=?, count=?, time=?";

    var params = [username, plname, plText, count, time,
                  plText, count, time];

    module.exports.query(query, params, callback);
};

module.exports.deleteUserPlaylist = function (username, plname,
                                                  callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "DELETE FROM user_playlists WHERE user=? AND name=?";
    module.exports.query(query, [username, plname], callback);
};

/* user channels */

module.exports.listUserChannels = function (username, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT * FROM channels WHERE owner=? ORDER BY id ASC";
    module.exports.query(query, [username], callback);
};

/* aliases */

module.exports.recordVisit = function (ip, name, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var time = Date.now();
    var query = "DELETE FROM aliases WHERE ip=? AND name=?;" +
                "INSERT INTO aliases VALUES (NULL, ?, ?, ?)";

    module.exports.query(query, [ip, name, ip, name, time], callback);
};

module.exports.cleanOldAliases = function (expiration, callback) {
    if (typeof callback === "undefined")
        callback = blackHole;

    var query = "DELETE FROM aliases WHERE time < ?";
    module.exports.query(query, [Date.now() - expiration], callback);
};

module.exports.listAliases = function (ip, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT name,time FROM aliases WHERE ip";
    // Range
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
            names = [];
            res.forEach(function (row) {
                names.push(row.name);
            });
        }

        callback(err, names);
    });
};

module.exports.listIPsForName = function (name, callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT ip FROM aliases WHERE name=?";
    module.exports.query(query, [name], function (err, res) {
        var ips = null;
        if(!err) {
            ips = [];
            res.forEach(function (row) {
                ips.push(row.ip);
            });
        }
        
        callback(err, ips);
    });
};

/* END REGION */

/* REGION action log */

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

/* END REGION */

/* REGION stats */

module.exports.addStatPoint = function (time, ucount, ccount, mem,
                                            callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "INSERT INTO stats VALUES (?, ?, ?, ?)";
    module.exports.query(query, [time, ucount, ccount, mem], callback);
};

module.exports.pruneStats = function (before, callback) {
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "DELETE FROM stats WHERE time < ?";
    module.exports.query(query, [before], callback);
};

module.exports.listStats = function (callback) {
    if(typeof callback !== "function")
        return;

    var query = "SELECT * FROM stats ORDER BY time ASC";
    module.exports.query(query, callback);
};

/* END REGION */
