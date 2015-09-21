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
    initChannelDumper(Server);
    initPasswordResetCleanup(Server);
};
