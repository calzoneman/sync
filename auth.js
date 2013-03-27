/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var mysql = require("mysql-libmysqlclient");
var Config = require("./config.js");
var bcrypt = require("bcrypt");
var hashlib = require("node_hash");
var Logger = require("./logger.js");

// Check if a name is taken
exports.isRegistered = function(name) {
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        Logger.errlog.log("Auth.isRegistered: DB connection failed");
        return true;
    }
    var query = "SELECT * FROM registrations WHERE uname='{}'"
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
exports.register = function(name, pw) {
    if(!exports.validateName(name))
        return false;
    if(exports.isRegistered(name))
        return false;
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        Logger.errlog.log("Auth.register: DB connection failed");
        return false;
    }
    var hash = bcrypt.hashSync(pw, 10);
    var query = "INSERT INTO registrations VALUES (NULL, '{1}', '{2}', 0)"
        .replace(/\{1\}/, name)
        .replace(/\{2\}/, hash);
    var results = db.querySync(query);
    db.closeSync();
    return results;
}

// Try to login
exports.login = function(name, pw) {
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        Logger.errlog.log("Auth.login: DB connection failed");
        return false;
    }
    var query = "SELECT * FROM registrations WHERE uname='{1}'"
        .replace(/\{1\}/, name)
    var results = db.querySync(query);
    var rows = results.fetchAllSync();
    if(rows.length > 0) {
        if(bcrypt.compareSync(pw, rows[0].pw)) {
            db.closeSync();
            return rows[0];
        }
        else {
            // Check if the sha256 is in the database
            // If so, migrate to bcrypt
            var sha256 = hashlib.sha256(pw);
            if(sha256 == rows[0].pw) {
                var newhash = bcrypt.hashSync(pw, 10);
                var query = "UPDATE registrations SET pw='{1}' WHERE uname='{2}'"
                    .replace(/\{1\}/, newhash)
                    .replace(/\{2\}/, name);
                var results = db.querySync(query);
                db.closeSync();
                if(!results) {
                    Logger.errlog.log("Failed to migrate password! user=" + name);
                    return false;
                }
                return rows[0];
            }
            return false;
        }
    }
    return false;
}
