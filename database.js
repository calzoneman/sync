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
};

module.exports = Database;
