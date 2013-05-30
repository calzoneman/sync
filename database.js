var mysql = require("mysql-libmysqlclient");
var Logger = require("./logger");
var Media = require("./media").Media;
var bcrypt = require("bcrypt");
var hashlib = require("node_hash");

var db = false;
var SERVER = "";
var USER = "";
var DATABASE = "";
var PASSWORD = "";
var CONFIG = {};
var global_bans = {};

function setup(cfg) {
    SERVER = cfg.MYSQL_SERVER;
    USER = cfg.MYSQL_USER;
    DATABASE = cfg.MYSQL_DB;
    PASSWORD = cfg.MYSQL_PASSWORD;
    CONFIG = cfg;
}

function getConnection() {
    if(db && db.connectedSync()) {
        return db;
    }
    db = mysql.createConnectionSync();
    db.connectSync(SERVER, USER, PASSWORD, DATABASE);
    if(!db.connectedSync()) {
        //Logger.errlog.log("DB connection failed");
        return false;
    }
    if(CONFIG.DEBUG) {
        db._querySync = db.querySync;
        db.querySync = function(q) {
            Logger.syslog.log("DEBUG: " + q);
            return this._querySync(q);
        }
    }
    return db;
}

function createQuery(template, args) {
    var last = -1;
    while(template.indexOf("?", last) >= 0) {
        var idx = template.indexOf("?", last);
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
        var first = template.substring(0, idx);
        template = first + template.substring(idx).replace("?", arg);
        last = idx + (arg+"").length;
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

    // Create password reset table
    query = ["CREATE TABLE IF NOT EXISTS `password_reset` (",
                "`ip` VARCHAR(15) NOT NULL,",
                "`name` VARCHAR(20) NOT NULL,",
                "`hash` VARCHAR(64) NOT NULL,",
                "`email` VARCHAR(255) NOT NULL,",
                "`expire` BIGINT NOT NULL,",
                "PRIMARY KEY (`name`))",
             "ENGINE = MyISAM;"].join("");

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to create password reset table");
    }
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
    else {
        var rows = results.fetchAllSync();
        global_bans = {};
        for(var i = 0; i < rows.length; i++) {
            global_bans[rows[i].ip] = rows[i].note;
        }
    }
    return global_bans;
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
    if(!name.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
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
    if(!chan.name.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
    var db = getConnection();
    if(!db) {
        return false;
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
                chan.namebans[r.name] = r.banner;
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
    if(!name.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }

    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = "DROP TABLE `chan_?_bans`, `chan_?_ranks`, `chan_?_library`"
        .replace(/\?/g, name);

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
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
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
    if(typeof name == "object") {
        var ranks = [];
        for(var i = 0; i < rows.length; i++) {
            ranks.push(rows[i].rank);
        }
        while(ranks.length < rows.length) {
            ranks.push(0);
        }
        return ranks;
    }
    if(rows.length == 0) {
        return 0;
    }

    return rows[0].rank;
}

function setChannelRank(chan, name, rank) {
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        ["INSERT INTO `?` ",
            "(`name`, `rank`) ",
         "VALUES ",
            "(?, ?) ",
         "ON DUPLICATE KEY UPDATE ",
            "`rank`=?"].join(""),
        ["chan_"+chan+"_ranks", name, rank, rank]
    );

    return db.querySync(query);
}

function listChannelRanks(chan) {
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return [];
    }
    var db = getConnection();
    if(!db) {
        return [];
    }

    var query = createQuery(
        "SELECT * FROM `?` WHERE 1",
        ["chan_"+chan+"_ranks"]
    );

    var results = db.querySync(query);
    if(!results) {
        return [];
    }

    return results.fetchAllSync();
}

function addToLibrary(chan, media) {
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        ["INSERT INTO `?` ",
            "(`id`, `title`, `seconds`, `type`) ",
         "VALUES ",
            "(?, ?, ?, ?)"].join(""),
        ["chan_"+chan+"_library", media.id, media.title, media.seconds, media.type]
    );

    return db.querySync(query);
}

function removeFromLibrary(chan, id) {
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        "DELETE FROM `?` WHERE id=?",
        ["chan_"+chan+"_library", id]
    );

    return db.querySync(query);
}

function channelBan(chan, ip, name, banby) {
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        ["INSERT INTO `?` ",
            "(`ip`, `name`, `banner`) ",
         "VALUES ",
            "(?, ?, ?)"].join(""),
        ["chan_"+chan+"_bans", ip, name, banby]
    );

    return db.querySync(query);
}

function channelUnbanIP(chan, ip) {
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        "DELETE FROM `?` WHERE `ip`=?",
        ["chan_"+chan+"_bans", ip]
    );

    return db.querySync(query);
}

function channelUnbanName(chan, name) {
    if(!chan.match(/^[a-zA-Z0-9-_]+$/)) {
        return false;
    }
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        "DELETE FROM `?` WHERE `ip`='*' AND `name`=?",
        ["chan_"+chan+"_bans", name]
    );

    return db.querySync(query);
}

/* REGION Users */

function getProfile(name) {
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        "SELECT profile_image,profile_text FROM registrations WHERE uname=?",
        [name]
    );

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to retrieve user profile");
        throw "Database failure.  Contact an administrator.";
    }

    var rows = results.fetchAllSync();
    if(rows.length == 0) {
        throw "User not found";
    }

    return {
        profile_image: rows[0].profile_image,
        profile_text: rows[0].profile_text
    };
}

function setProfile(name, data) {
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        ["UPDATE `registrations` SET ",
            "`profile_image`=?,",
            "`profile_text`=? ",
         "WHERE uname=?"].join(""),
        [data.image, data.text, name]
    );

    return db.querySync(query);
}

function setUserEmail(name, email) {
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        "UPDATE `registrations` SET `email`=? WHERE `uname`=?",
        [email, name]
    );

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to set user email");
        return false;
    }
    return true;
}

function generatePasswordReset(ip, name, email) {
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        "SELECT `email` FROM `registrations` WHERE `uname`=?",
        [name]
    );

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to retrieve user email");
        return false;
    }

    var rows = results.fetchAllSync();
    if(rows.length == 0) {
        throw "Provided username does not exist";
    }
    if(rows[0].email != email) {
        throw "Provided email does not match user's email";
    }

    // Validation complete, now time to reset it
    var hash = hashlib.sha256(Date.now() + name);
    var exp = Date.now() + 24*60*60*1000;
    query = createQuery(
        ["INSERT INTO `password_reset` (",
            "`ip`, `name`, `hash`, `email`, `expire`",
         ") VALUES (",
            "?, ?, ?, ?, ?",
         ") ON DUPLICATE KEY UPDATE `hash`=?,`expire`=?"].join(""),
        [ip, name, hash, email, exp, hash, exp]
    );

    results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to insert password reset");
        return false;
    }

    return hash;
}

function recoverPassword(hash) {
    var db = getConnection();
    if(!db) {
        return false;
    }

    var query = createQuery(
        "SELECT * FROM password_reset WHERE hash=?",
        [hash]
    );

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to retrieve from password_reset");
        throw "Database error.  Contact an administrator";
    }

    var rows = results.fetchAllSync();
    if(rows.length == 0) {
        throw "Invalid password reset link";
    }

    db.querySync(createQuery(
        "DELETE FROM password_reset WHERE hash=?",
        [hash]
    ));

    if(Date.now() > rows[0].expire) {
        throw "Link expired.  Password resets are valid for 24 hours";
    }

    var pw;
    if(!(pw = resetPassword(rows[0].name))) {
        throw "Operation failed.  Contact an administrator.";
    }

    return [rows[0].name, pw];
}

function resetPassword(name) {
    var db = getConnection();
    if(!db) {
        return false;
    }

    var pw = "";
    for(var i = 0; i < 10; i++) {
        pw += "abcdefghijklmnopqrstuvwxyz"[parseInt(Math.random() * 25)];
    }
    var hash = bcrypt.hashSync(pw, 10);
    var query = createQuery(
        "UPDATE `registrations` SET `pw`=? WHERE `uname`=?",
        [hash, name]
    );

    var results = db.querySync(query);
    if(!results) {
        return false;
    }

    return pw;
}

exports.setup = setup;
exports.getConnection = getConnection;
exports.createQuery = createQuery;
exports.init = init;
exports.checkGlobalBan = checkGlobalBan;
exports.refreshGlobalBans = refreshGlobalBans;
exports.globalBanIP = globalBanIP;
exports.globalUnbanIP = globalUnbanIP;
exports.registerChannel = registerChannel;
exports.loadChannel = loadChannel;
exports.deleteChannel = deleteChannel;
exports.getChannelRank = getChannelRank;
exports.setChannelRank = setChannelRank;
exports.listChannelRanks = listChannelRanks;
exports.addToLibrary = addToLibrary;
exports.removeFromLibrary = removeFromLibrary;
exports.channelBan = channelBan;
exports.channelUnbanIP = channelUnbanIP;
exports.channelUnbanName = channelUnbanName;
exports.setProfile = setProfile;
exports.getProfile = getProfile;
exports.setUserEmail = setUserEmail;
exports.generatePasswordReset = generatePasswordReset;
exports.recoverPassword = recoverPassword;
exports.resetPassword = resetPassword;
