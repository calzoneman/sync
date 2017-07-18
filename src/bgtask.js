/*
    bgtask.js

    Registers background jobs to run periodically while the server is
    running.
*/

var Config = require("./config");
var db = require("./database");
var Promise = require("bluebird");

const LOGGER = require('@calzoneman/jsli')('bgtask');

var init = null;

/* Alias cleanup */
function initAliasCleanup(Server) {
    var CLEAN_INTERVAL = parseInt(Config.get("aliases.purge-interval"));
    var CLEAN_EXPIRE = parseInt(Config.get("aliases.max-age"));

    setInterval(function () {
        db.cleanOldAliases(CLEAN_EXPIRE, function (err) {
            LOGGER.info("Cleaned old aliases");
            if (err)
                LOGGER.error(err);
        });
    }, CLEAN_INTERVAL);
}

/* Password reset cleanup */
function initPasswordResetCleanup(Server) {
    var CLEAN_INTERVAL = 8*60*60*1000;

    setInterval(function () {
        db.cleanOldPasswordResets(function (err) {
            if (err)
                LOGGER.error(err);
        });
    }, CLEAN_INTERVAL);
}

function initChannelDumper(Server) {
    const chanPath = Config.get('channel-path');
    var CHANNEL_SAVE_INTERVAL = parseInt(Config.get("channel-save-interval"))
                                * 60000;
    setInterval(function () {
        var wait = CHANNEL_SAVE_INTERVAL / Server.channels.length;
        LOGGER.info(`Saving channels with delay ${wait}`);
        Promise.reduce(Server.channels, (_, chan) => {
            return Promise.delay(wait).then(() => {
                if (!chan.dead && chan.users && chan.users.length > 0) {
                    return chan.saveState().tap(() => {
                        LOGGER.info(`Saved /${chanPath}/${chan.name}`);
                    }).catch(err => {
                        LOGGER.error(`Failed to save /${chanPath}/${chan.name}: ${err.stack}`);
                    });
                }
            }).catch(error => {
                LOGGER.error(`Failed to save channel: ${error.stack}`);
            });
        }, 0).catch(error => {
            LOGGER.error(`Failed to save channels: ${error.stack}`);
        });
    }, CHANNEL_SAVE_INTERVAL);
}

module.exports = function (Server) {
    if (init === Server) {
        LOGGER.warn("Attempted to re-init background tasks");
        return;
    }

    init = Server;
    initAliasCleanup(Server);
    initChannelDumper(Server);
    initPasswordResetCleanup(Server);
};
