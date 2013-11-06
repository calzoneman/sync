var mysql = require("mysql");
var hashlib = require("node_hash");
var bcrypt = require("bcrypt");
var $util = require("./utilities");
var Logger = require("./logger");

var Database = function (cfg) {
    var self = this;
    self.cfg = cfg;
    self.pool = mysql.createPool({
        host: cfg["mysql-server"],
        user: cfg["mysql-user"],
        password: cfg["mysql-pw"],
        database: cfg["mysql-db"],
        multipleStatements: true
    });

    // Test the connection
    self.pool.getConnection(function (err, conn) {
        if(err) {
            Logger.errlog.log("! DB connection failed");
            return;
        } else {
            self.init();
        }
    });

    self.global_ipbans = {};
};

Database.prototype.query = function (query, sub, callback) {
    // 2nd argument is optional
    if(typeof sub === "function") {
        callback = sub;
        sub = false;
    }

    if(typeof callback !== "function")
        callback = blackHole;

    var self = this;
    self.pool.getConnection(function (err, conn) {
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

Database.prototype.init = function () {
    var self = this;
    var query;
    // Create channel table
    query = ["CREATE TABLE IF NOT EXISTS `channels` (",
                "`id` INT NOT NULL AUTO_INCREMENT,",
                "`name` VARCHAR(255) NOT NULL,",
                "`owner` VARCHAR(20) NOT NULL,",
                "PRIMARY KEY(`id`))",
             "ENGINE = MyISAM ",
             "CHARACTER SET utf8;"].join("");

    self.query(query, function (err, res) {
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

    self.query(query, function (err, res) {
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

    self.query(query, function (err, res) {
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

    self.query(query, function (err, res) {
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

    self.query(query, function (err, res) {
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

    self.query(query, function (err, res) {
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

    self.query(query, function (err, res) {
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

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create stats table");
        }
    });

    // Refresh global IP bans
    self.listGlobalIPBans();
};

/* REGION global bans */

Database.prototype.isGlobalIPBanned = function (ip, callback) {
    if(typeof callback !== "function")
        return;
    const re = /(\d+)\.(\d+)\.(\d+)\.(\d+)/;
    // Account for range banning
    var s16 = ip.replace(re, "$1.$2");
    var s24 = ip.replace(re, "$1.$2.$3");

    var banned = ip in this.global_ipbans ||
                 s16 in this.global_ipbans ||
                 s24 in this.global_ipbans;

    callback(null, banned);
};

Database.prototype.listGlobalIPBans = function (callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    self.query("SELECT * FROM global_bans WHERE 1", function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        self.global_ipbans = {};
        for(var i in res) {
            self.global_ipbans[res[i].ip] = res[i].note;
        }

        callback(null, self.global_ipbans);
    });
};

Database.prototype.setGlobalIPBan = function (ip, reason, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "INSERT INTO global_bans VALUES (?, ?)" +
                " ON DUPLICATE KEY UPDATE note=?";
    self.query(query, [ip, reason, reason], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        self.listGlobalIPBans();
        callback(null, res);
    });
};

Database.prototype.clearGlobalIPBan = function (ip, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;


    var query = "DELETE FROM global_bans WHERE ip=?";
    self.query(query, [ip], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res);
    });
};

/* END REGION */

/* REGION channels */

Database.prototype.searchChannel = function (field, value, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT * FROM channels WHERE ";
    if(field === "owner")
        query += "owner LIKE ?";
    else if(field === "name")
        query += "name LIKE ?";

    self.query(query, ["%" + value + "%"], callback);
};

Database.prototype.channelExists = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;
    if(!$util.isValidChannelName(name)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT name FROM channels WHERE name=?";
    self.query(query, [name], function (err, res) {
        callback(err, res.length > 0);
    });
};

Database.prototype.registerChannel = function (name, owner, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(name)) {
        callback("Invalid channel name", null);
        return;
    }

    // Messy, but I can't think of a better async solution atm
    var query = "SELECT * FROM channels WHERE name=?";
    self.query(query, [name], function (err, res) {
        if(!err && res.length > 0) {
            callback("Channel already exists", null);
            return;
        }

        // Library table
        query = ["CREATE TABLE `chan_" + name + "_library` (",
                        "`id` VARCHAR(255) NOT NULL,",
                        "`title` VARCHAR(255) NOT NULL,",
                        "`seconds` INT NOT NULL,",
                        "`type` VARCHAR(2) NOT NULL,",
                        "PRIMARY KEY (`id`))",
                     "ENGINE = MyISAM ",
                     "CHARACTER SET utf8;"].join("");
        self.query(query, function (err, res) {
            if(err) {
                callback(err, null);
                return;
            }

            // Rank table
            query = ["CREATE TABLE `chan_" + name + "_ranks` (",
                            "`name` VARCHAR(32) NOT NULL,",
                            "`rank` INT NOT NULL,",
                            "UNIQUE (`name`))",
                         "ENGINE = MyISAM ",
                         "CHARACTER SET utf8;"].join("");

            self.query(query, function (err, res) {
                if(err) {
                    callback(err, null);
                    return;
                }

                // Ban table
                query = ["CREATE TABLE `chan_" + name + "_bans` (",
                            "`ip` VARCHAR(15) NOT NULL,",
                            "`name` VARCHAR(32) NOT NULL,",
                            "`banner` VARCHAR(32) NOT NULL,",
                            "PRIMARY KEY (`ip`, `name`))",
                         "ENGINE = MyISAM ",
                         "CHARACTER SET utf8;"].join("");

                self.query(query, function (err, res) {
                    if(err) {
                        callback(err, null);
                        return;
                    }

                    query = "INSERT INTO channels VALUES (NULL, ?, ?)";
                    self.query(query, [name, owner], function (err, res) {
                        callback(err, res);
                    });
                });
            });
        });
    });
};

Database.prototype.loadChannelData = function (chan, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(chan.name)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT * FROM channels WHERE name=?";

    self.query(query, [chan.name], function (err, res) {
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
        self.query(query, function (err, res) {
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

Database.prototype.dropChannel = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(name)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "DROP TABLE `chan_?_bans`,`chan_?_ranks`,`chan_?_library`"
        .replace(/\?/g, name);

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to drop channel tables for "+name);
            callback(err, null);
            return;
        }

        query = "DELETE FROM channels WHERE name=?";
        self.query(query, [name], function (err, res) {
            callback(err, res);
            if(err) {
                Logger.errlog.log("! Failed to delete channel "+name);
            }
        });
    });
};

Database.prototype.getChannelRank = function (channame, name, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT name, rank FROM `chan_" + channame + "_ranks`" +
                "WHERE name=?";

    self.query(query, [name], function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to lookup " + channame + " ranks");
            callback(err, null);
            return;
        }

        if(res.length == 0)
            callback(null, 0);
        else
            callback(null, res[0].rank);
    });
};

Database.prototype.listChannelUserRanks = function (channame, names, 
                                                    callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    if(typeof names === "string")
        names = [names];

    // Build the query template (?, ?, ?, ?, ...)
    var nlist = [];
    for(var i in names)
        nlist.push("?");
    nlist = "(" + nlist.join(",") + ")";

    var query = "SELECT name, rank FROM `chan_" + channame + "_ranks`" +
                "WHERE name IN " + nlist;

    self.query(query, names, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to lookup " + channame + " ranks");
            callback(err, null);
            return;
        }

        for(var i in res)
            res[i] = res[i].rank;

        callback(null, res);
    });
};

Database.prototype.setChannelRank = function (channame, name, rank, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_ranks` " +
                "(name, rank) VALUES (?, ?) " +
                "ON DUPLICATE KEY UPDATE rank=?";

    self.query(query, [name, rank, rank], callback);
};

Database.prototype.insertChannelRank = function (channame, name, rank, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_ranks` " +
                "(name, rank) VALUES (?, ?) " +
                "ON DUPLICATE KEY UPDATE rank=rank";

    self.query(query, [name, rank], callback);
};

Database.prototype.listChannelRanks = function (channame, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT * FROM `chan_" + channame + "_ranks` WHERE 1";
    self.query(query, callback);
};

Database.prototype.addToLibrary = function (channame, media, callback) {
    var self = this;
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
    self.query(query, params, callback);
};

Database.prototype.removeFromLibrary = function (channame, id, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "DELETE FROM `chan_" + channame + "_library` WHERE id=?";
    self.query(query, [id], callback);
};

Database.prototype.getLibraryItem = function (channame, id, callback) {
    var self = this;
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

    self.query(query, [id], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res.length > 0 ? res[0] : null);
    });
};

Database.prototype.searchLibrary = function (channame, term, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "SELECT id, title, seconds, type FROM " +
                "`chan_" + channame + "_library` WHERE title LIKE ?";

    self.query(query, ["%" + term + "%"], callback);
};

Database.prototype.addChannelBan = function (channame, ip, name, banBy,
                                             callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_bans`" +
                "(ip, name, banner) VALUES (?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE ip=ip";

    self.query(query, [ip, name, banBy], callback);
};

Database.prototype.clearChannelIPBan = function (channame, ip, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame)) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "DELETE FROM `chan_" + channame + "_bans` WHERE ip=?";
    self.query(query, [ip], callback);
};

Database.prototype.clearChannelNameBan = function (channame, name,
                                                   callback) {
    var self = this;
    if(typeof callback !== "function") {
        callback = blackHole;
        return;
    }

    var query = "DELETE FROM `chan_" + channame + "_bans` WHERE ip='*'" +
                "AND name=?";

    self.query(query, [name], callback);
};

/* END REGION */

/* REGION Auth */

Database.prototype.isUsernameTaken = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT id FROM registrations WHERE uname=?";
    self.query(query, [name], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res.length > 0);
    });
};

var regInProgress = {};
Database.prototype.registerUser = function (name, pw, callback) {
    var self = this;
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

        self.createLoginSession(name, function (err, hash) {
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

    self.isUsernameTaken(name, function (err, taken) {
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

            self.query(query, [name, hash], postRegister);
        });
    });
};

Database.prototype.userLogin = function (name, pw, session, callback) {
    var self = this;
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

        self.createLoginSession(name, function (err, hash) {
            if(err) {
                callback(err, null);
                return;
            }

            row.session_hash = hash;
            callback(null, row);
        });
    };

    if(session) {
        self.userLoginSession(name, session, postLogin);
    } else if(pw) {
        self.userLoginPassword(name, pw, postLogin);
    } else {
        callback("Invalid login", null);
    }
};

Database.prototype.userLoginPassword = function (name, pw, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT * FROM registrations WHERE uname=?";
    self.query(query, [name], function (err, res) {
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
                        self.query("UPDATE registrations SET pw=? "+
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

Database.prototype.userLoginSession = function (name, session, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT * FROM registrations WHERE uname=? AND " +
                "session_hash=?";

    self.query(query, [name, session], function (err, res) {
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

Database.prototype.createLoginSession = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var salt = $util.randomSalt(32);
    var hash = hashlib.sha256(salt + name);

    var query = "UPDATE registrations SET session_hash=?, expire=? " +
                "WHERE uname=?";

    self.query(query, [hash, Date.now() + 604800000, name],
               function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, hash);
    });
};

Database.prototype.setUserPassword = function (name, pw, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    bcrypt.hash(pw, 10, function (err, hash) {
        if(err) {
            callback(err, null);
            return;
        }

        var query = "UPDATE registrations SET pw=? WHERE uname=?";
        self.query(query, [hash, name], callback);
    });
};

Database.prototype.getGlobalRank = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT global_rank FROM registrations WHERE uname=?";

    self.query(query, [name], function (err, res) {
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

Database.prototype.listGlobalRanks = function (names, callback) {
    var self = this;
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
    self.query(query, names, function (err, res) {
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

Database.prototype.searchUser = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    // NOTE: No SELECT * here because I don't want to risk exposing
    // the user's password hash
    var query = "SELECT id, uname, global_rank, profile_image, " +
                "profile_text, email FROM registrations WHERE " +
                "uname LIKE ?";

    self.query(query, ["%" + name + "%"], callback);
};

/* rank */

Database.prototype.setGlobalRank = function (name, rank, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "UPDATE registrations SET global_rank=? WHERE uname=?";
    self.query(query, [rank, name], callback);
};

/* email and profile */

Database.prototype.getUserProfile = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT profile_image, profile_text FROM registrations " +
                "WHERE uname=?";

    self.query(query, [name], function (err, res) {
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

Database.prototype.setUserProfile = function (name, data, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "UPDATE registrations SET profile_image=?, profile_text=?" +
                "WHERE uname=?";

    self.query(query, [data.image, data.text, name], callback);
};

Database.prototype.setUserEmail = function (name, email, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "UPDATE registrations SET email=? WHERE uname=?";

    self.query(query, [email, name], callback);
};

/* password recovery */

Database.prototype.genPasswordReset = function (ip, name, email, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT email FROM registrations WHERE uname=?";
    self.query(query, [name], function (err, res) {
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
        self.query(query, [ip, name, hash, email, expire, hash, expire],
                   function (err, res) {
            if(err) {
                callback(err, null);
                return;
            }

            callback(null, hash);
        });
    });
};

Database.prototype.recoverUserPassword = function (hash, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "SELECT * FROM password_reset WHERE hash=?";
    self.query(query, [hash], function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        if(res.length == 0) {
            callback("Invalid password reset link", null);
            return;
        }

        if(Date.now() > res[0].expire) {
            self.query("DELETE FROM password_reset WHERE hash=?", [hash]);
            callback("Link expired.  Password resets are valid for 24hr",
                     null);
            return;
        }

        var name = res[0].name;

        self.resetUserPassword(res[0].name, function (err, pw) {
            if(err) {
                callback(err, null);
                return;
            }

            self.query("DELETE FROM password_reset WHERE hash=?", [hash]);
            callback(null, {
                name: name,
                pw: pw
            });
        });
    });
};

Database.prototype.resetUserPassword = function (name, callback) {
    var self = this;
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
        self.query(query, [data, name], function (err, res) {
            if(err) {
                callback(err, null);
                return;
            }

            callback(null, pw);
        });
    });
};

/* user playlists */

Database.prototype.listUserPlaylists = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT name, count, time FROM user_playlists WHERE user=?";
    self.query(query, [name], callback);
};

Database.prototype.getUserPlaylist = function (username, plname, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT contents FROM user_playlists WHERE " +
                "user=? AND name=?";

    self.query(query, [username, plname], function (err, res) {
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

Database.prototype.saveUserPlaylist = function (pl, username, plname,
                                                callback) {
    var self = this;
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

    self.query(query, params, callback);
};

Database.prototype.deleteUserPlaylist = function (username, plname,
                                                  callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "DELETE FROM user_playlists WHERE user=? AND name=?";
    self.query(query, [username, plname], callback);
};

/* user channels */

Database.prototype.listUserChannels = function (username, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT * FROM channels WHERE owner=? ORDER BY id ASC";
    self.query(query, [username], callback);
};

/* aliases */

Database.prototype.recordVisit = function (ip, name, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var time = Date.now();
    var query = "DELETE FROM aliases WHERE ip=? AND name=?;" +
                "INSERT INTO aliases VALUES (NULL, ?, ?, ?)";

    self.query(query, [ip, name, ip, name, time], callback);
};

Database.prototype.cleanOldAliases = function (expiration, callback) {
    var self = this;
    if (typeof callback === "undefined")
        callback = blackHole;

    var query = "DELETE FROM aliases WHERE time < ?";
    self.query(query, [Date.now() - expiration], callback);
};

Database.prototype.listAliases = function (ip, callback) {
    var self = this;
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

    self.query(query, [ip], function (err, res) {
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

Database.prototype.listIPsForName = function (name, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT ip FROM aliases WHERE name=?";
    self.query(query, [name], function (err, res) {
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

Database.prototype.recordAction = function (ip, name, action, args,
                                            callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "INSERT INTO actionlog (ip, name, action, args, time) " +
                "VALUES (?, ?, ?, ?, ?)";

    self.query(query, [ip, name, action, args, Date.now()], callback);
};

Database.prototype.clearActions = function (actions, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var list = [];
    for(var i in actions)
        list.push("?");

    var actionlist = "(" + list.join(",") + ")";

    var query = "DELETE FROM actionlog WHERE action IN " + actionlist;
    self.query(query, actions, callback);
};

Database.prototype.clearSingleAction = function (item, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "DELETE FROM actionlog WHERE ip=? AND time=?";
    self.query(query, [item.ip, item.time], callback);
};


Database.prototype.recentRegistrationCount = function (ip, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT * FROM actionlog WHERE ip=? " +
                "AND action='register-success' AND time > ?";

    self.query(query, [ip, Date.now() - 48 * 3600 * 1000],
               function (err, res) {
        if(err) {
            callback(err, null);
            return;
        }

        callback(null, res.length);
    });
};

Database.prototype.listActionTypes = function (callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT DISTINCT action FROM actionlog";
    self.query(query, function (err, res) {
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

Database.prototype.listActions = function (types, callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var list = [];
    for(var i in types)
        list.push("?");

    var actionlist = "(" + list.join(",") + ")";
    var query = "SELECT * FROM actionlog WHERE action IN " + actionlist;
    self.query(query, types, callback);
};

/* END REGION */

/* REGION stats */

Database.prototype.addStatPoint = function (time, ucount, ccount, mem,
                                            callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "INSERT INTO stats VALUES (?, ?, ?, ?)";
    self.query(query, [time, ucount, ccount, mem], callback);
};

Database.prototype.pruneStats = function (before, callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    var query = "DELETE FROM stats WHERE time < ?";
    self.query(query, [before], callback);
};

Database.prototype.listStats = function (callback) {
    var self = this;
    if(typeof callback !== "function")
        return;

    var query = "SELECT * FROM stats ORDER BY time ASC";
    self.query(query, callback);
};

/* END REGION */
module.exports = Database;
