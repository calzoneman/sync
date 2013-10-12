/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Logger = require("./logger");
var Server = require("./server");

module.exports = {
    record: function (ip, name, action, args) {
        var db = Server.getServer().db;
        if(!args)
            args = "";
        else {
            try {
                args = JSON.stringify(args);
            } catch(e) {
                args = "";
            }
        }
        
        db.recordAction(ip, name, action, args);
    },

    clear: function (actions) {
        var db = Server.getServer().db;
        db.clearActions(actions);
    },

    clearOne: function (item) {
        var db = Server.getServer().db;
        db.clearSingleAction(item);
    },

    throttleRegistrations: function (ip, callback) {
        var db = Server.getServer().db;
        db.recentRegistrationCount(ip, function (err, count) {
            if(err) {
                callback(err, null);
                return;
            }

            callback(null, count > 4);
        });
    },

    listActionTypes: function (callback) {
        var db = Server.getServer().db;
        db.listActionTypes(callback);
    },

    listActions: function (types, callback) {
        var db = Server.getServer().db;
        db.listActions(types, callback);
    }
};
