/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Logger = require("./logger");

const STAT_INTERVAL = 60 * 60 * 1000;
const STAT_EXPIRE = 24 * STAT_INTERVAL;

module.exports = function (Server) {
    var db = Server.db;

    setInterval(function () {
        var chancount = Server.channels.length;
        var usercount = 0;
        Server.channels.forEach(function (chan) {
            usercount += chan.users.length;
        });

        var mem = process.memoryUsage().rss;

        db.addStatPoint(Date.now(), usercount, chancount, mem, function () {
            db.pruneStats(Date.now() - STAT_EXPIRE);
        });
    }, STAT_INTERVAL);

    return {
        stores: {
            "http": {},
            "socketio": {},
            "api": {}
        },
        record: function (type, key) {
            var store;
            if(!(type in this.stores))
                return;

            store = this.stores[type];

            if(key in store) {
                store[key].push(Date.now());
                if(store[key].length > 100)
                    store[key].shift();
            } else {
                store[key] = [Date.now()];
            }
        },
        readAverages: function (type) {
            if(!(type in this.stores))
                return;
            var avg = {};
            var store = this.stores[type];
            for(var k in store) {
                var time = Date.now() - store[k][0];
                avg[k] = store[k].length / time;
                avg[k] = parseInt(avg[k] * 1000);
            }
            return avg;
        }
    };

}
