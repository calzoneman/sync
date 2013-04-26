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
    var query = "INSERT INTO registrations VALUES (NULL, '{1}', '{2}', 1, '', 0)"
        .replace(/\{1\}/, name)
        .replace(/\{2\}/, hash);
    var results = db.querySync(query);
    db.closeSync();
    if(results) {
        return exports.createSession(name);
    }
    return false;
}

exports.login = function(name, pw, session) {
    if(session) {
        var res = exports.loginSession(name, session);
        if(res) {
            return res;
        }
        else if(!pw) {
            return false;
        }
    }
    var row = exports.loginPassword(name, pw);
    if(row) {
        var hash = exports.createSession(name);
        row.session_hash = hash;
        return row;
    }
}
// Try to login
exports.loginPassword = function(name, pw) {
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
        try {
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
        catch(e) {
            Logger.errlog.log("Auth.login fail");
            Logger.errlog.log(e);
        }
    }
    return false;
}

exports.createSession = function(name) {
    var salt = sessionSalt();
    var hash = hashlib.sha256(salt + name);
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        return false;
    }
    var query = ["UPDATE registrations SET ",
                 "session_hash='{1}',",
                 "expire={2} ",
                 "WHERE uname='{3}'"].join("")
        .replace(/\{1\}/, hash)
        .replace(/\{2\}/, new Date().getTime() + 604800000)
        .replace(/\{3\}/, name)
    var results = db.querySync(query);
    return results ? hash : false;
}

exports.loginSession = function(name, hash) {
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        return false;
    }
    var query = "SELECT * FROM registrations WHERE uname='{1}'"
        .replace(/\{1\}/, name)
    var results = db.querySync(query);
    var rows = results.fetchAllSync();
    if(rows.length != 1) {
        return false;
    }

    var dbhash = rows[0].session_hash;
    if(hash != dbhash) {
        return false;
    }
    var timeout = rows[0].expire;
    if(timeout < new Date().getTime()) {
        return false;
    }
    return rows[0];
}

function sessionSalt() {
    var chars = "abcdefgihjklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
              + "0123456789!@#$%^&*_+=~";
    var salt = [];
    for(var i = 0; i < 32; i++) {
        salt.push(chars[parseInt(Math.random()*chars.length)]);
    }
    return salt.join('');
}

exports.getGlobalRank = function(name) {
    var db = mysql.createConnectionSync();
    db.connectSync(Config.MYSQL_SERVER, Config.MYSQL_USER,
                   Config.MYSQL_PASSWORD, Config.MYSQL_DB);
    if(!db.connectedSync()) {
        Logger.errlog.log("Auth.getGlobalRank: DB connection failed");
        return false;
    }
    var query = "SELECT * FROM registrations WHERE uname='{1}'"
        .replace(/\{1\}/, name)
    var results = db.querySync(query);
    var rows = results.fetchAllSync();
    if(rows.length > 0) {
        return rows[0].global_rank;
    }
    return 0;
}
