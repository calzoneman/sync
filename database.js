/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var mysql = require("mysql-libmysqlclient");
var Config = require("./config.js");
var Logger = require("./logger.js");

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
        Logger.errlog.log("database.init: channel table init failed!");
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
        Logger.errlog.log("database.init: registration table init failed!");
        return false;
    }

    initialized = true;
    db.closeSync();
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
        Logger.errlog.log("database.listChannels: query failed");
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
        Logger.errlog.log("database.listUsers: query failed");
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
        Logger.errlog.log("database.listChannelRanks: query failed");
        return false;
    }

    if(results) {
        var rows = results.fetchAllSync();
        db.closeSync();
        return rows;
    }
};
