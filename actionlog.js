/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Database = require("./database");
var Logger = require("./logger");

exports.record = function(ip, name, action, args) {
    if(typeof args === "undefined" || args === null) {
        args = "";
    } else {
        try {
            args = JSON.stringify(args);
        } catch(e) {
            args = "";
        }
    }

    var db = Database.getConnection();
    if(!db)
        return false;

    var query = Database.createQuery(
        "INSERT INTO actionlog (ip, name, action, args, time) "+
        "VALUES (?, ?, ?, ?, ?)",
        [ip, name, action, args, Date.now()]
    );

    var result = db.querySync(query);
    if(!result) {
        Logger.errlog.log("! Failed to record action");
    }

    return result;
}

exports.clear = function(actions) {
    var db = Database.getConnection();
    if(!db)
        return false;

    var list = new Array(actions.length);
    for(var i = 0; i < actions.length; i++)
        list[i] = "?";

    var query = Database.createQuery(
        "DELETE FROM actionlog WHERE action IN ("+
        list.join(",")+
        ")",
        actions
    );

    var result = db.querySync(query);
    if(!result) {
        Logger.errlog.log("! Failed to clear action log");
    }

    return result;
}

exports.tooManyRegistrations = function (ip) {
    var db = Database.getConnection();
    if(!db)
        return true;

    var query = Database.createQuery(
        "SELECT * FROM actionlog WHERE ip=? AND action='register-success'"+
        "AND time > ?",
        [ip, Date.now() - 48 * 3600 * 1000]
    );

    var results = db.querySync(query);
    if(!results) {
        Logger.errlog.log("! Failed to check tooManyRegistrations");
        return true;
    }

    var rows = results.fetchAllSync();
    // TODO Config value for this
    return rows.length > 4;
}

exports.readLog = function () {
    var db = Database.getConnection();
    if(!db)
        return false;

    var query = "SELECT * FROM actionlog";
    var result = db.querySync(query);
    if(!result) {
        Logger.errlog.log("! Failed to read action log");
        return [];
    }

    return result.fetchAllSync();
}
