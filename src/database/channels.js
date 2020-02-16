var db = require("../database");
var valid = require("../utilities").isValidChannelName;
var Flags = require("../flags");
var util = require("../utilities");
import { createMySQLDuplicateKeyUpdate } from '../util/on-duplicate-key-update';
import Config from '../config';

const LOGGER = require('@calzoneman/jsli')('database/channels');

var blackHole = function () { };

module.exports = {
    init: function () {
    },

    /**
     * Checks if the given channel name is registered
     */
    isChannelTaken: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(name)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT name FROM `channels` WHERE name=?",
                     [name],
                     function (err, rows) {
            if (err) {
                callback(err, true);
                return;
            }
            callback(null, rows.length > 0);
        });
    },

    /**
     * Looks up a channel
     */
    lookup: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(name)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT * FROM `channels` WHERE name=?",
                     [name],
                     function (err, rows) {
            if (err) {
                callback(err, null);
                return;
            }

            if (rows.length === 0) {
                callback("No such channel", null);
            } else {
                callback(null, rows[0]);
            }
        });
    },

    /**
     * Searches for a channel
     */
    search: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        db.query("SELECT * FROM `channels` WHERE name LIKE ?",
                     ["%" + name + "%"],
                     function (err, rows) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, rows);
        });
    },

    /**
     * Searches for a channel by owner
     */
    searchOwner: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        db.query("SELECT * FROM `channels` WHERE owner LIKE ?",
                     ["%" + name + "%"],
                     function (err, rows) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, rows);
        });
    },

    /**
     * Validates and registers a new channel
     */
    register: function (name, owner, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (typeof name !== "string" || typeof owner !== "string") {
            callback("Name and owner are required for channel registration", null);
            return;
        }

        if (!valid(name)) {
            callback("Invalid channel name.  Channel names may consist of 1-30 " +
                     "characters a-z, A-Z, 0-9, -, and _", null);
            return;
        }

        module.exports.isChannelTaken(name, function (err, taken) {
            if (err) {
                callback(err, null);
                return;
            }

            if (taken) {
                callback("Channel name " + name + " is already taken", null);
                return;
            }

            db.query("INSERT INTO `channels` " +
                     "(`name`, `owner`, `time`, `last_loaded`) VALUES (?, ?, ?, ?)",
                     [name, owner, Date.now(), new Date()],
                     function (err, _res) {
                if (err) {
                    callback(err, null);
                    return;
                }

                db.users.getGlobalRank(owner, function (err, rank) {
                    if (err) {
                        callback(err, null);
                        return;
                    }

                    rank = Math.max(rank, 5);

                    module.exports.setRank(name, owner, rank, function (err) {
                        if (err) {
                            callback(err, null);
                            return;
                        }

                        callback(null, { name: name });
                    });
                });
            });
        });
    },

    /**
     * Unregisters a channel
     */
    drop: function (name, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(name)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("DELETE FROM `channels` WHERE name=?", [name], function (err) {

            module.exports.deleteBans(name, function (err) {
                if (err) {
                    LOGGER.error("Failed to delete bans for " + name + ": " + err);
                }
            });

            module.exports.deleteLibrary(name, function (err) {
                if (err) {
                    LOGGER.error("Failed to delete library for " + name + ": " + err);
                }
            });

            module.exports.deleteAllRanks(name, function (err) {
                if (err) {
                    LOGGER.error("Failed to delete ranks for " + name + ": " + err);
                }
            });

            callback(err, !err);
        });
    },

    /**
     * Looks up channels registered by a given user
     */
    listUserChannels: function (owner, callback) {
        if (typeof callback !== "function") {
            return;
        }

        db.query("SELECT * FROM `channels` WHERE owner=?", [owner],
        function (err, res) {
            if (err) {
                callback(err, []);
                return;
            }

            callback(err, res);
        });
    },

    listUserChannelsAsync: owner => {
        return new Promise((resolve, reject) => {
            module.exports.listUserChannels(owner, (error, rows) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(rows);
                }
            });
        });
    },

    /**
     * Loads the channel from the database
     */
    load: function (chan, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan.name)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT * FROM `channels` WHERE name=?", chan.name, function (err, res) {
            if (err) {
                callback(err, null);
                return;
            }

            if (res.length === 0) {
                callback("Channel is not registered", null);
                return;
            }

            if (chan.dead) {
                callback("Channel is dead", null);
                return;
            }

            // Note that before this line, chan.name might have a different capitalization
            // than the database has stored.  Update accordingly.
            chan.name = res[0].name;
            chan.uniqueName = chan.name.toLowerCase();
            chan.id = res[0].id;
            chan.ownerName = typeof res[0].owner === 'string' ? res[0].owner.toLowerCase() : null;
            chan.setFlag(Flags.C_REGISTERED);
            chan.logger.log("[init] Loaded channel from database");
            callback(null, true);
        });
    },

    /**
     * Looks up a user's rank
     */
    getRank: function (chan, name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT * FROM `channel_ranks` WHERE name=? AND channel=?",
                 [name, chan],
        function (err, rows) {
            if (err) {
                callback(err, -1);
                return;
            }

            if (rows.length === 0) {
                callback(null, 1);
                return;
            }

            callback(null, rows[0].rank);
        });
    },

    /**
     * Looks up multiple users' ranks at once
     */
    getRanks: function (chan, names, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        var replace = "(" + names.map(function () { return "?"; }).join(",") + ")";

        /* Last substitution is the channel to select ranks for */
        const sub = names.concat([chan]);

        db.query("SELECT * FROM `channel_ranks` WHERE name IN " +
                 replace + " AND channel=?", sub,
        function (err, rows) {
            if (err) {
                callback(err, []);
                return;
            }

            callback(null, rows.map(function (r) { return r.rank; }));
        });
    },

    /**
     * Query all user ranks at once
     */
    allRanks: function (chan, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT * FROM `channel_ranks` WHERE channel=?", [chan], callback);
    },

    /**
     * Updates a user's rank
     */
    setRank: function (chan, name, rank, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (rank < 2) {
            module.exports.deleteRank(chan, name, callback);
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("INSERT INTO `channel_ranks` VALUES (?, ?, ?) " +
                 "ON DUPLICATE KEY UPDATE `rank`=?",
                 [name, rank, chan, rank], callback);
    },

    /**
     * Removes a user's rank entry
     */
    deleteRank: function (chan, name, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("DELETE FROM `channel_ranks` WHERE name=? AND channel=?", [name, chan],
            callback);
    },

    /**
     * Removes all ranks for a channel
     */
    deleteAllRanks: function (chan, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("DELETE FROM `channel_ranks` WHERE channel=?", [chan], callback);
    },

    /**
     * Adds a media item to the library
     */
    addToLibrary: function (chan, media, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        var meta = JSON.stringify({
            bitrate: media.meta.bitrate,
            codec: media.meta.codec,
            scuri: media.meta.scuri,
            embed: media.meta.embed,
            direct: media.meta.direct
        });

        db.query("INSERT INTO `channel_libraries` " +
                 "(id, title, seconds, type, meta, channel) " +
                 "VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=id",
                 [media.id, media.title, media.seconds, media.type, meta, chan], callback);
    },

    /**
     * Adds a list of media items to the library
     */
    addListToLibrary: async function addListToLibrary(chan, list) {
        if (!valid(chan)) {
            throw new Error("Invalid channel name");
        }

        if (list.length > Config.get("playlist.max-items")) {
            throw new Error("Cannot save list to library: exceeds max-items");
        }

        const items = list.map(item => ({
            id: item.id,
            title: item.title,
            seconds: item.seconds,
            type: item.type,
            meta: JSON.stringify({
                bitrate: item.meta.bitrate,
                codec: item.meta.codec,
                scuri: item.meta.scuri,
                embed: item.meta.embed,
                direct: item.meta.direct
            }),
            channel: chan
        }));

        await db.getDB().runTransaction(tx => {
            const insert = tx.table('channel_libraries')
                    .insert(items);

            const update = tx.raw(createMySQLDuplicateKeyUpdate(
                    ['title', 'seconds', 'meta']
            ));

            return tx.raw(insert.toString() + update.toString());
        });
    },

    /**
     * Retrieves a media item from the library by id
     */
    getLibraryItem: function (chan, id, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT * FROM `channel_libraries` WHERE id=? AND channel=?", [id, chan],
        function (err, rows) {
            if (err) {
                callback(err, null);
                return;
            }

            if (rows.length === 0) {
                callback("Item not in library", null);
            } else {
                callback(null, rows[0]);
            }
        });
    },

    /**
     * Search the library by title
     */
    searchLibrary: function (chan, search, callback) {
        if (typeof callback !== "function") {
            return;
        }

        db.query("SELECT * FROM `channel_libraries` WHERE title LIKE ? AND channel=?",
                 ["%" + search + "%", chan], callback);
    },

    /**
     * Deletes a media item from the library
     */
    deleteFromLibrary: function (chan, id, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("DELETE FROM `channel_libraries` WHERE id=? AND channel=?",
            [id, chan], callback);
    },

    /**
     * Deletes all library entries for a channel
     */
    deleteLibrary: function (chan, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("DELETE FROM `channel_libraries` WHERE channel=?", [chan], callback);
    },

    /**
     * Add a ban to the banlist
     */
    ban: function (chan, ip, name, note, bannedby, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("INSERT INTO `channel_bans` (ip, name, reason, bannedby, channel) " +
                 "VALUES (?, ?, ?, ?, ?)",
            [ip, name, note, bannedby, chan], callback);
    },

    /**
     * Check if an IP address or range is banned
     */
    isIPBanned: function (chan, ip, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        var range = util.getIPRange(ip);
        var wrange = util.getWideIPRange(ip);

        db.query("SELECT * FROM `channel_bans` WHERE ip IN (?, ?, ?) AND channel=?",
        [ip, range, wrange, chan],
        function (err, rows) {
            callback(err, err ? false : rows.length > 0);
        });
    },

    /**
     * Check if a username is banned
     */
    isNameBanned: function (chan, name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT * FROM `channel_bans` WHERE name=? AND channel=?", [name, chan],
        function (err, rows) {
            callback(err, err ? false : rows.length > 0);
        });
    },

    /**
     * Check if a user's name or IP is banned
     */
    isBanned: function (chan, ip, name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        var range = util.getIPRange(ip);
        var wrange = util.getWideIPRange(ip);

        db.query("SELECT COUNT(1) AS count FROM `channel_bans` WHERE (ip IN (?, ?, ?) OR name=?) AND channel=?",
        [ip, range, wrange, name, chan],
        function (err, rows) {
            callback(err, err ? false : rows.length > 0 && rows[0].count > 0);
        });
    },

    /**
     * Lists all bans
     */
    listBans: function (chan, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("SELECT * FROM `channel_bans` WHERE channel=?", [chan], callback);
    },

    /**
     * Removes a ban from the banlist
     */
    unbanId: function (chan, id, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("DELETE FROM `channel_bans` WHERE id=? AND channel=?",
                 [id, chan], callback);
    },

    /**
     * Removes all bans from a channel
     */
    deleteBans: function (chan, id, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (!valid(chan)) {
            callback("Invalid channel name", null);
            return;
        }

        db.query("DELETE FROM `channel_bans` WHERE channel=?", [chan], callback);
    },

    /**
     * Updates the `last_loaded` column to be the current timestamp
     */
    updateLastLoaded: function updateLastLoaded(channelId) {
        if (channelId <= 0) {
            return;
        }

        db.query("UPDATE channels SET last_loaded = ? WHERE id = ?", [new Date(), channelId], error => {
            if (error) {
                LOGGER.error(`Failed to update last_loaded column for channel ID ${channelId}: ${error}`);
            }
        });
    },

    /**
     * Updates the `owner_last_seen` column to be the current timestamp
     */
    updateOwnerLastSeen: function updateOwnerLastSeen(channelId) {
        if (channelId <= 0) {
            return;
        }

        db.query("UPDATE channels SET owner_last_seen = ? WHERE id = ?", [new Date(), channelId], error => {
            if (error) {
                LOGGER.error(`Failed to update owner_last_seen column for channel ID ${channelId}: ${error}`);
            }
        });
    }
};
