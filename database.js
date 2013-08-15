var mysql = require("mysql");
var $util = require("./utilities");

var Logger = {
    errlog: {
        log: function () {
            console.log(arguments[0]);
        }
    }
};

var Database = function (cfg) {
    this.cfg = cfg;
    this.pool = mysql.createPool({
        host: cfg["mysql-server"],
        user: cfg["mysql-user"],
        password: cfg["mysql-pw"],
        database: cfg["mysql-db"]
    });

    // Test the connection
    this.pool.getConnection(function (err, conn) {
        if(err) {
            Logger.errlog.log("! DB connection failed");
        }
        conn.end();
    });

    this.global_ipbans = {};
};

Database.prototype.query = function (query, sub, callback) {
    // 2nd argument is optional
    if(typeof sub === "function") {
        callback = sub;
        sub = false;
    }

    var self = this;
    self.pool.getConnection(function (err, conn) {
        if(err) {
            callback("Database failure", null);
            conn.end();
        } else {
            function cback(err, res) {
                if(err) {
                    if(self.cfg["debug"]) {
                        console.log(err);
                    }
                    callback("Database failure", null);
                } else {
                    callback(null, res);
                }
                conn.end();
            }

            if(sub)
                conn.query(query, sub, cback);
            else {
                conn.query(query, cback);
            }
        }
    });
}

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
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create channels table");
        } else {
            console.log("Created channels table");
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
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create registration table");
        } else if(self.cfg["debug"]) {
            console.log("Created registrations table");
        }
    });

    // Create global bans table
    query = ["CREATE TABLE IF NOT EXISTS `global_bans` (",
                "`ip` VARCHAR(15) NOT NULL,",
                "`note` VARCHAR(255) NOT NULL,",
                "PRIMARY KEY (`ip`))",
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create global ban table");
        } else if(self.cfg["debug"]) {
            console.log("Created global ban table");
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
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create password reset table");
        } else if(self.cfg["debug"]) {
            console.log("Created password reset table");
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
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create user playlist table");
        } else if(self.cfg["debug"]) {
            console.log("Created user playlist table");
        }
    });

    // Create user aliases table
    query = ["CREATE TABLE IF NOT EXISTS `aliases` (",
                "`visit_id` INT NOT NULL AUTO_INCREMENT,",
                "`ip` VARCHAR(15) NOT NULL,",
                "`name` VARCHAR(20) NOT NULL,",
                "`time` BIGINT NOT NULL,",
                "PRIMARY KEY (`visit_id`), INDEX (`ip`))",
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create user aliases table");
        } else if(self.cfg["debug"]) {
            console.log("Created user aliases table");
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
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create action log table");
        } else if(self.cfg["debug"]) {
            console.log("Created action log table");
        }
    });

    // Create stats table
    query = ["CREATE TABLE IF NOT EXISTS `stats` (",
                "`time` BIGINT NOT NULL,",
                "`usercount` INT NOT NULL,",
                "`chancount` INT NOT NULL,",
                "`mem` INT NOT NULL,",
                "PRIMARY KEY (`time`))",
             "ENGINE = MyISAM;"].join("");

    self.query(query, function (err, res) {
        if(err) {
            Logger.errlog.log("! Failed to create stats table");
        } else if(self.cfg["debug"]) {
            console.log("Created stats table");
        }
    });

    // Refresh global IP bans
    self.getGlobalIPBans();
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

Database.prototype.getGlobalIPBans = function (callback) {
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

        self.getGlobalIPBans();
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
                     "ENGINE = MyISAM;"].join("");
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
                         "ENGINE = MyISAM;"].join("");

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
                            "PRIMARY KEY (`ip`))",
                         "ENGINE = MyISAM;"].join("");

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
            callback("Channel is unregistered", null);
            return;
        }

        if(res[0].name != chan.name)
            chan.name = rows[0].name;
        chan.registered = true;
        
        // Load bans
        query = "SELECT * FROM `chan_" + chan.name + "_bans`";
        self.query(query, function (err, res) {
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

Database.prototype.getChannelRank = function (channame, names, callback) {
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
            if(names.length == 1)
                callback(err, 0);
            else
                callback(err, []);
            return;
        }

        if(names.length == 1) {
            if(res.length == 0)
                callback(null, 0);
            else
                callback(null, res[0].rank);
            return;
        }
        
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

    var query = "INSERT INTO `chan_" + channame + "_ranks`" +
                "(id, title, seconds, type) " + 
                "VALUES (?, ?, ?, ?)";
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

Database.prototype.addChannelBan = function (channame, ip, name, banBy,
                                             callback) {
    var self = this;
    if(typeof callback !== "function")
        callback = blackHole;

    if(!$util.isValidChannelName(channame))) {
        callback("Invalid channel name", null);
        return;
    }

    var query = "INSERT INTO `chan_" + channame + "_bans`" + 
                "(ip, name, banner) VALUES (?, ?, ?)";

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

/* REGION users */

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
module.exports = Database;
