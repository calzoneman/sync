var mysql = require("mysql-libmysqlclient");
var Config = require("./config");
var Logger = require("./logger");
var db = false;

function getConnection() {
    if(db && db.connectedSync()) {
        return db;
    }
    db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        //Logger.errlog.log("DB connection failed");
        return false;
    }
    if(Config.DEBUG) {
        db._querySync = db.querySync;
        db.querySync = function(q) {
            Logger.syslog.log("DEBUG: " + q);
            this._querySync(q);
        }
    }
    return db;
}

function createQuery(template, args) {
    while(template.indexOf("?") >= 0) {
        var idx = template.indexOf("?");
        var arg = args.shift();
        if(typeof arg == "string") {
            arg = arg.replace(/([\'])/g, "\\$1");
            if(idx == 0 || template[idx-1] != "`") {
                arg = "'" + arg + "'";
            }
        }
        if(arg === null || arg === undefined) {
            arg = "NULL";
        }
        template = template.replace("?", arg)
    }
    return template;
}

function init() {
    var db = getConnection();
    if(!db) {
        return false;
    }

    // Create channel table
    var query = ["CREATE TABLE IF NOT EXISTS `channels` (",
                    "`id` INT NOT NULL AUTO_INCREMENT,",
                    "`name` VARCHAR(255) NOT NULL,",
                    "PRIMARY KEY(`id`))",
                 "ENGINE = MyISAM;"].join("");
    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to create channels table");
    }

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
                "PRIMARY KEY (`id`))",
             "ENGINE = MyISAM;"].join("");

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to create registrations table");
    }

    // Create global bans table
    query = ["CREATE TABLE IF NOT EXISTS `global_bans` (",
                "`ip` VARCHAR(15) NOT NULL,",
                "`note` VARCHAR(255) NOT NULL,",
                "PRIMARY KEY (`ip`))",
             "ENGINE = MyISAM;"].join("");

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to create global ban table");
    }

    refreshGlobalBans();
}

/* REGION Global Bans */

function checkGlobalBan(ip) {
    const re = /(\d+)\.(\d+)\.(\d+)\.(\d+)/;
    var s16 = ip.replace(re, "$1.$2");
    var s24 = ip.replace(re, "$1.$2.$3");
    return (ip in global_bans ||
            s16 in global_bans ||
            s24 in global_bans);
}

function refreshGlobalBans() {
    var db = getConnection();
    if(!db) {
        return;
    }

    var query = "SELECT * FROM `global_bans` WHERE 1";
    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to load global bans");
    }

    var rows = results.fetchAllSync();
    global_bans = {};
    for(var i = 0; i < rows.length; i++) {
        global_bans[rows[i].ip] = rows[i].note;
    }
}

function globalBanIP(ip, reason) {
    var db = getConnection();
    if(!db) {
        return;
    }

    var query = createQuery(
        "INSERT INTO `global_bans` VALUES (?, ?)",
        [ip, reason]
    );
    return db.querySync(query);
}

function globalUnbanIP(ip) {
    var db = getConnection();
    if(!db) {
        return;
    }

    var query = createQuery(
        "DELETE FROM `global_bans` WHERE ip=?",
        [ip]
    );

    return db.querySync(query);
}

/* REGION Channel Registration/Loading */

function registerChannel(name) {
    var db = getConnection();
    if(!db) {
        return false;
    }

    // Library table
    var query = ["CREATE TABLE `?` (",
                    "`id` VARCHAR(255) NOT NULL,",
                    "`title` VARCHAR(255) NOT NULL,",
                    "`seconds` INT NOT NULL,",
                    "`type` VARCHAR(2) NOT NULL,",
                    "PRIMARY KEY (`id`))",
                 "ENGINE = MyISAM;"].join("");
    query = createQuery(query, ["chan_" + name + "_library"]);

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to create table: chan_"+name+"_library");
        return false;
    }

    // Rank table
    query = ["CREATE TABLE `?` (",
                    "`name` VARCHAR(32) NOT NULL,",
                    "`rank` INT NOT NULL,",
                    "UNIQUE (`name`))",
                 "ENGINE = MyISAM;"].join("");
    query = createQuery(query, ["chan_" + name + "_ranks"]);

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to create table: chan_"+name+"_ranks");
        return false;
    }

    // Ban table
    query = ["CREATE TABLE `?` (",
                    "`ip` VARCHAR(15) NOT NULL,",
                    "`name` VARCHAR(32) NOT NULL,",
                    "`banner` VARCHAR(32) NOT NULL,",
                    "PRIMARY KEY (`ip`))",
                 "ENGINE = MyISAM;"].join("");
    query = createQuery(query, ["chan_" + name + "_bans"]);

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to create table: chan_"+name+"_bans");
        return false;
    }

    // Insert into channel table
    query = createQuery(
        "INSERT INTO `channels` VALUES (NULL, ?)",
        [name]
    );

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to insert into channel table: " + name);
        return false;
    }

    return true;
}

function loadChannel(chan) {
    var db = getConnection();
    if(!db) {
        return;
    }

    var query = createQuery(
        "SELECT * FROM `channels` WHERE name=?",
        [chan.name]
    );

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to query channel table");
    }
    else {
        var rows = results.fetchAllSync();
        if(rows.length == 0) {
            // Unregistered
            Logger.syslog.log("Channel " + chan.name + " is unregistered");
            return;
        }
        // Database is case insensitive
        else if(rows[0].name != chan.name) {
            chan.name = rows[0].name;
        }
        chan.registered = true;
    }

    // Load channel library
    query = createQuery(
        "SELECT * FROM `?`",
        ["chan_" + chan.name + "_library"]
    );

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to load channel library: " + chan.name);
    }
    else {
        var rows = results.fetchAllSync();
        for(var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var m = new Media(r.id, r.title, r.seconds, r.type);
            chan.library[r.id] = m;
        }
    }

    // Load channel bans
    query = createQuery(
        "SELECT * FROM `?`",
        ["chan_" + chan.name + "_bans"]
    );

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to load channel bans: " + chan.name);
    }
    else {
        var rows = results.fetchAllSync();
        for(var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if(r.ip == "*") {
                chan.nameban[r.name] = r.banner;
            }
            else {
                chan.ipbans[r.ip] = [r.name, r.banner];
            }
        }
    }

    chan.logger.log("*** Loaded channel from database");
    Logger.syslog.log("Loaded channel " + chan.name + " from database");
}

function deleteChannel(name) {
    if(!name.test(/[a-zA-Z0-9-_]+/)) {
        return false;
    }

    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = "DROP TABLE `chan_?_bans`, `chan_?_ranks`, `chan_?_library`"
        .replace("?", name);

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to delete channel tables for " + name);
        return false;
    }

    query = createQuery(
        "DELETE FROM `channels` WHERE name=?",
        [name]
    );

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to delete row from channel table: " + name);
        return false;
    }

    return true;
}

/* REGION Channel data */

function getChannelRank(chan, name) {
    var db = getConnection();
    if(!db) {
        return 0;
    }

    var query;
    if(typeof name == "object") {
        var n = "(?";
        for(var i = 1; i < name.length; i++) {
            n += ",?";
        }
        n += ")"
        name.unshift("chan_" + chan + "_ranks");
        query = createQuery(
            "SELECT * FROM `?` WHERE name IN " + n,
            name
        );
    }
    else {
        query = createQuery(
            "SELECT * FROM `?` WHERE name=?",
            ["chan_"+chan+"_ranks", name]
        );
    }

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to lookup chan_"+chan+"_ranks");
        return 0;
    }

    var rows = results.fetchAllSync();
    if(rows.length == 0) {
        return 0;
    }

    return rows[0].rank;
}

function test() {
    var db = getConnection();
    var q = createQuery("INSERT INTO `?` VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ["registrations", null, "bob2", "asdf", 1, "",  0, "", ""]);
    console.log(q);
    //console.log(db.querySync(q));
}

test();
