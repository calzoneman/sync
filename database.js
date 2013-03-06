var mysql = require('mysql-libmysqlclient');
var Config = require('./config.js');

var initialized = false;

exports.init = function() {
    if(initialized)
        return;

    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    var query = "CREATE TABLE IF NOT EXISTS `channels` \
                    (`id` INT NOT NULL, \
                     `name` VARCHAR(255) NOT NULL, \
                     PRIMARY KEY (`id`)) \
                     ENGINE = MyISAM;";
    var results = db.querySync(query);
    if(!results) {
        console.log("Database initialization failed! Could not create channel table");
        return false;
    }

    var query = "CREATE TABLE IF NOT EXISTS `registrations` \
                    (`id` INT NOT NULL, \
                     `uname` VARCHAR(20) NOT NULL, \
                     `pw` VARCHAR(64) NOT NULL, \
                     `global_rank` INT NOT NULL, \
                     PRIMARY KEY (`id`)) \
                     ENGINE = MyISAM;";
    var results = db.querySync(query);
    if(!results) {
        console.log("Database initialization failed! Could not create registration table");
        return false;
    }

    initialized = true;
    return true;
}

exports.listChannels = function() {
    if(!initialized)
        return false;
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    var query = "SELECT * FROM `channels`";
    var results = db.querySync(query);
    if(!results) {
        console.log("Database channel listing failed!");
        return false;
    }

    if(results) {
        var rows = results.fetchAllSync();
        db.closeSync();
        return rows;
    }
};

exports.listUsers = function() {
    if(!initialized)
        return false;
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    var query = "SELECT * FROM `registrations`";
    var results = db.querySync(query);
    if(!results) {
        console.log("Database user listing failed!");
        return false;
    }

    if(results) {
        var rows = results.fetchAllSync();
        db.closeSync();
        return rows;
    }
};

exports.listChannelRanks = function(chan) {
    if(!initialized)
        return false;
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    var query = "SELECT * FROM `chan_{}_ranks`"
        .replace(/\{\}/, chan);
    console.log(query);
    var results = db.querySync(query);
    if(!results) {
        console.log("Database channel listing failed!");
        return false;
    }

    if(results) {
        var rows = results.fetchAllSync();
        db.closeSync();
        return rows;
    }
};
