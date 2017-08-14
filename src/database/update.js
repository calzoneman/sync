var db = require("../database");
var Q = require("q");
import Promise from 'bluebird';

const LOGGER = require('@calzoneman/jsli')('database/update');

const DB_VERSION = 11;
var hasUpdates = [];

module.exports.checkVersion = function () {
    db.query("SELECT `key`,`value` FROM `meta` WHERE `key`=?", ["db_version"], function (err, rows) {
        if (err) {
            return;
        }

        if (rows.length === 0) {
            LOGGER.warn("db_version key missing from database.  Setting " +
                              "db_version=" + DB_VERSION);
            db.query("INSERT INTO `meta` (`key`, `value`) VALUES ('db_version', ?)",
                     [DB_VERSION],
                     function (err) {
            });
        } else {
            var v = parseInt(rows[0].value);
            if (v >= DB_VERSION) {
                return;
            }
            var next = function () {
                hasUpdates.push(v);
                LOGGER.info("Updated database to version " + v);
                if (v < DB_VERSION) {
                    update(v++, next);
                } else {
                    db.query("UPDATE `meta` SET `value`=? WHERE `key`='db_version'",
                             [DB_VERSION]);
                }
            };
            update(v++, next);
        }
    });
};

function update(version, cb) {
    if (version < 4) {
        LOGGER.error('Cannot auto-upgrade: db_version 4 is too old!');
        process.exit(1);
    } else if (version < 5) {
        fixUtf8mb4(cb);
    } else if (version < 6) {
        fixCustomEmbeds(cb);
    } else if (version < 7) {
        fixCustomEmbedsInUserPlaylists(cb);
    } else if (version < 8) {
        addUsernameDedupeColumn(cb);
    } else if (version < 9) {
        populateUsernameDedupeColumn(cb);
    } else if (version < 10) {
        addChannelLastLoadedColumn(cb);
    } else if (version < 11) {
        addChannelOwnerLastSeenColumn(cb);
    }
}

function fixUtf8mb4(cb) {
    var queries = [
        "ALTER TABLE `users` MODIFY `profile` TEXT CHARACTER SET utf8mb4 NOT NULL",
        "ALTER TABLE `global_bans` MODIFY `reason` VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL",
        "ALTER TABLE `channel_libraries` MODIFY `title` VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL",
        "ALTER TABLE `channel_bans` MODIFY `reason` VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL"
    ];

    Q.allSettled(queries.map(function (query) {
        return Q.nfcall(db.query, query);
    })).then(function () {
        LOGGER.info("Fixed utf8mb4");
        cb();
    }).catch(function (e) {
        LOGGER.error("Failed to fix utf8mb4: " + e);
    });
};

function fixCustomEmbeds(cb) {
    var CustomEmbedFilter = require("../customembed").filter;

    Q.nfcall(db.query, "SELECT * FROM `channel_libraries` WHERE type='cu'")
        .then(function (rows) {
        var all = [];
        rows.forEach(function (row) {
            if (row.id.indexOf("cu:") === 0) return;

            all.push(Q.nfcall(db.query, "DELETE FROM `channel_libraries` WHERE `id`=? AND `channel`=?",
                    [row.id, row.channel]));

            try {
                var media = CustomEmbedFilter(row.id);

                all.push(Q.nfcall(db.channels.addToLibrary, row.channel, media));
            } catch(e) {
                console.error("WARNING: Unable to convert " + row.id);
            }
        });

        Q.allSettled(all).then(function () {
            LOGGER.info("Converted custom embeds.");
            cb();
        });
    });
}

function fixCustomEmbedsInUserPlaylists(cb) {
    var CustomEmbedFilter = require("../customembed").filter;
    Q.nfcall(db.query, "SELECT * FROM `user_playlists` WHERE `contents` LIKE '%\"type\":\"cu\"%'")
        .then(function (rows) {
            var all = [];
            rows.forEach(function (row) {
                var data;
                try {
                    data = JSON.parse(row.contents);
                } catch (e) {
                    return;
                }

                var updated = [];
                var item;
                while ((item = data.shift()) !== undefined) {
                    if (item.type !== "cu") {
                        updated.push(item);
                        continue;
                    }

                    if (/^cu:/.test(item.id)) {
                        updated.push(item);
                        continue;
                    }

                    var media;
                    try {
                        media = CustomEmbedFilter(item.id);
                    } catch (e) {
                        LOGGER.info("WARNING: Unable to convert " + item.id);
                        continue;
                    }

                    updated.push({
                        id: media.id,
                        title: item.title,
                        seconds: media.seconds,
                        type: media.type,
                        meta: {
                            embed: media.meta.embed
                        }
                    });

                    all.push(Q.nfcall(db.query, "UPDATE `user_playlists` SET `contents`=?, `count`=? WHERE `user`=? AND `name`=?",
                            [JSON.stringify(updated), updated.length, row.user, row.name]));
                }
            });

            Q.allSettled(all).then(function () {
                LOGGER.info('Fixed custom embeds in user_playlists');
                cb();
            });
        }).catch(function (err) {
            LOGGER.error(err.stack);
        });
}

function addUsernameDedupeColumn(cb) {
    LOGGER.info("Adding name_dedupe column on the users table");
    db.query("ALTER TABLE users ADD COLUMN name_dedupe VARCHAR(20) UNIQUE DEFAULT NULL", (error) => {
        if (error) {
            LOGGER.error(`Unable to add name_dedupe column: ${error}`);
        } else {
            cb();
        }
    });
}

function populateUsernameDedupeColumn(cb) {
    const dbUsers = require("./accounts");
    LOGGER.info("Populating name_dedupe column on the users table");
    db.query("SELECT id, name FROM users WHERE name_dedupe IS NULL", (err, rows) => {
        if (err) {
            LOGGER.error("Unable to perform database upgrade to add dedupe column: " + err);
            return;
        }

        Promise.map(rows, row => {
            const dedupedName = dbUsers.dedupeUsername(row.name);
            LOGGER.info(`Deduping [${row.name}] as [${dedupedName}]`);
            return db.getDB().knex.raw("UPDATE users SET name_dedupe = ? WHERE id = ?", [dedupedName, row.id])
                    .catch(error => {
                if (error.errno === 1062) {
                    LOGGER.info(`WARNING: could not set name_dedupe for [${row.name}] due to an existing row for [${dedupedName}]`);
                } else {
                    throw error;
                }
            });
        }, { concurrency: 10 }).then(() => {
            cb();
        }).catch(error => {
            LOGGER.error("Unable to perform database upgrade to add dedupe column: " + (error.stack ? error.stack : error));
        })
    });
}

function addChannelLastLoadedColumn(cb) {
    db.query("ALTER TABLE channels ADD COLUMN last_loaded TIMESTAMP NOT NULL DEFAULT 0", error => {
        if (error) {
            LOGGER.error(`Failed to add last_loaded column: ${error}`);
            return;
        }

        db.query("ALTER TABLE channels ADD INDEX i_last_loaded (last_loaded)", error => {
            if (error) {
                LOGGER.error(`Failed to add index on last_loaded column: ${error}`);
                return;
            }

            cb();
        });
    });
}

function addChannelOwnerLastSeenColumn(cb) {
    db.query("ALTER TABLE channels ADD COLUMN owner_last_seen TIMESTAMP NOT NULL DEFAULT 0", error => {
        if (error) {
            LOGGER.error(`Failed to add owner_last_seen column: ${error}`);
            return;
        }

        db.query("ALTER TABLE channels ADD INDEX i_owner_last_seen (owner_last_seen)", error => {
            if (error) {
                LOGGER.error(`Failed to add index on owner_last_seen column: ${error}`);
                return;
            }

            cb();
        });
    });
}
