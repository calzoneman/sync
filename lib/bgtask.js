
/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*
    bgtask.js

    Registers background jobs to run periodically while the server is
    running.
*/

var Logger = require("./logger");
var Config = require("./config");
var db = require("./database");

var init = null;

/* Stats */
function initStats(Server) {
    var STAT_INTERVAL = parseInt(Config.get("stats.interval"));
    var STAT_EXPIRE = parseInt(Config.get("stats.max-age"));

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
}

/* Alias cleanup */
function initAliasCleanup(Server) {
    var CLEAN_INTERVAL = parseInt(Config.get("aliases.purge-interval"));
    var CLEAN_EXPIRE = parseInt(Config.get("aliases.max-age"));

    setInterval(function () {
        db.cleanOldAliases(CLEAN_EXPIRE, function (err) {
            Logger.syslog.log("Cleaned old aliases");
            if (err)
                Logger.errlog.log(err);
        });
    }, CLEAN_INTERVAL);
}

/* Password reset cleanup */
function initPasswordResetCleanup(Server) {
    var CLEAN_INTERVAL = 8*60*60*1000;

    setInterval(function () {
        db.cleanOldPasswordResets(function (err) {
            if (err)
                Logger.errlog.log(err);
        });
    }, CLEAN_INTERVAL);
}

/* Clean out old rate limiters */
function initIpThrottleCleanup(Server) {
    setInterval(function () {
        for (var ip in Server.ipThrottle) {
            if (Server.ipThrottle[ip].lastTime < Date.now() - 60 * 1000) {
                delete Server.ipThrottle[ip];
            }
        }
    }, 5 * 60 * 1000);
}

function initChannelDumper(Server) {
    var CHANNEL_SAVE_INTERVAL = parseInt(Config.get("channel-save-interval"))
                                * 60000;
    setInterval(function () {
        for (var i = 0; i < Server.channels.length; i++) {
            var chan = Server.channels[i];
            if (!chan.dead && chan.users && chan.users.length > 0) {
                chan.saveState();
            }
        }
    }, CHANNEL_SAVE_INTERVAL);
}

module.exports = function (Server) {
    if (init === Server) {
        Logger.errlog.log("WARNING: Attempted to re-init background tasks");
        return;
    }

    init = Server;
    initStats(Server);
    initAliasCleanup(Server);
    initIpThrottleCleanup(Server);
    initChannelDumper(Server);
    initPasswordResetCleanup(Server);
};
