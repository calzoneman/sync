var mysql = require("mysql");

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
    if(typeof callback !== "function")
        callback = function () { }
    var self = this;
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
    if(typeof callback !== "function")
        callback = function () { }
    var query = "INSERT INTO global_bans VALUES (?, ?)" + 
                " ON DUPLICATE KEY UPDATE note=?";
    var self = this;
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
    if(typeof callback !== "function")
        callback = function () { }
    var self = this;

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

module.exports = Database;
