var mysql = require('mysql-libmysqlclient');
var Config = require('./config.js');

// Check if a name is taken
exports.isRegistered = function(name) {
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        throw "[](/abchaos) MySQL Connection Failed";
    }
    var query = 'SELECT * FROM registrations WHERE uname="{}"'
        .replace(/\{\}/, name);
    var results = db.querySync(query);
    var rows = results.fetchAllSync();
    db.closeSync();
    return rows.length > 0;
}

// Check if a name is valid
// Valid names are 1-20 characters, alphanumeric and underscores
exports.validateName = function(name) {
    if(name.length > 20)
        return false;
    const VALID_REGEX = /^[a-zA-Z0-9_]+$/;
    return name.match(VALID_REGEX) != null;
}

// Try to register a new account
exports.register = function(name, sha256) {
    if(!exports.validateName(name))
        return false;
    if(exports.isRegistered(name))
        return false;
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        throw "[](/abchaos) MySQL Connection Failed";
    }
    var query = 'INSERT INTO registrations VALUES (NULL, "{1}", "{2}", 0)'
        .replace(/\{1\}/, name)
        .replace(/\{2\}/, sha256);
    var results = db.querySync(query);
    db.closeSync();
    return results;
}

// Try to login
exports.login = function(name, sha256) {
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        throw "[](/abchaos) MySQL Connection Failed";
    }
    var query = 'SELECT * FROM registrations WHERE uname="{1}" AND pw="{2}"'
        .replace(/\{1\}/, name)
        .replace(/\{2\}/, sha256);
    var results = db.querySync(query);
    var rows = results.fetchAllSync();
    db.closeSync();
    if(rows.length > 0) {
        return rows[0];
    }
    return false;
}
