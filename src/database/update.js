var db = require("../database");
var Logger = require("../logger");
var Q = require("q");

const DB_VERSION = 7;
var hasUpdates = [];

module.exports.checkVersion = function () {
    db.query("SELECT `key`,`value` FROM `meta` WHERE `key`=?", ["db_version"], function (err, rows) {
        if (err) {
            return;
        }

        if (rows.length === 0) {
            Logger.errlog.log("[Warning] db_version key missing from database.  Setting " +
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
                Logger.syslog.log("Updated database to version " + v);
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
    if (version < 3 && hasUpdates.indexOf(2) < 0) {
        addMetaColumnToLibraries(cb);
    } else if (version < 4) {
        Q.allSettled([
            Q.nfcall(mergeChannelLibraries),
            Q.nfcall(mergeChannelRanks),
            Q.nfcall(mergeChannelBans)
        ]).done(function () {
            Logger.syslog.log("Merged channel tables.  Please verify that everything " +
                              "is working correctly, and then type '/delete_old_tables'" +
                              " into the CyTube process to remove the unused tables.");
            cb();
        })
    } else if (version < 5) {
        fixUtf8mb4(cb);
    } else if (version < 6) {
        fixCustomEmbeds(cb);
    } else if (version < 7) {
        fixCustomEmbedsInUserPlaylists(cb);
    }
}

function addMetaColumnToLibraries(cb) {
    Logger.syslog.log("[database] db version indicates channel libraries don't have " +
                      "meta column.  Updating...");
    Q.nfcall(db.query, "SHOW TABLES")
    .then(function (rows) {
        rows = rows.map(function (r) {
            return r[Object.keys(r)[0]];
        }).filter(function (r) {
            return r.match(/_library$/);
        });

        var queue = [];
        rows.forEach(function (table) {
            queue.push(Q.nfcall(db.query, "ALTER TABLE `" + table + "` ADD meta TEXT")
                .then(function () {
                    Logger.syslog.log("Added meta column to " + table);
                })
            );
        });

        return Q.all(queue);
    }).catch(function (err) {
        Logger.errlog.log("Adding meta column to library tables failed: " + err);
    }).done(cb);
}

function mergeChannelLibraries(cb) {
    Q.nfcall(db.query, "SHOW TABLES")
    .then(function (rows) {
        rows = rows.map(function (r) {
            return r[Object.keys(r)[0]];
        }).filter(function (r) {
            return r.match(/chan_(.*)?_library$/);
        });

        var queue = [];
        rows.forEach(function (table) {
            var name = table.match(/chan_(.*?)_library$/)[1];
            queue.push(Q.nfcall(db.query,
                "INSERT INTO `channel_libraries` SELECT id, title, seconds, type, meta, ?" +
                " AS channel FROM `" + table + "`", [name])
                .then(function () {
                    Logger.syslog.log("Copied " + table + " to channel_libraries");
                }).catch(function (err) {
                    Logger.errlog.log("Copying " + table + " to channel_libraries failed: " +
                        err);
                    if (err.stack) {
                        Logger.errlog.log(err.stack);
                    }
                })
            );
        });

        return Q.all(queue);
    }).catch(function (err) {
        Logger.errlog.log("Copying libraries to channel_libraries failed: " + err);
        if (err.stack) {
            Logger.errlog.log(err.stack);
        }
    }).done(function () { cb(null); });
}

function mergeChannelRanks(cb) {
    Q.nfcall(db.query, "SHOW TABLES")
    .then(function (rows) {
        rows = rows.map(function (r) {
            return r[Object.keys(r)[0]];
        }).filter(function (r) {
            return r.match(/chan_(.*?)_ranks$/);
        });

        var queue = [];
        rows.forEach(function (table) {
            var name = table.match(/chan_(.*?)_ranks$/)[1];
            queue.push(Q.nfcall(db.query,
                "INSERT INTO `channel_ranks` SELECT name, rank, ?" +
                " AS channel FROM `" + table + "`", [name])
                .then(function () {
                    Logger.syslog.log("Copied " + table + " to channel_ranks");
                }).catch(function (err) {
                    Logger.errlog.log("Copying " + table + " to channel_ranks failed: " +
                        err);
                    if (err.stack) {
                        Logger.errlog.log(err.stack);
                    }
                })
            );
        });

        return Q.all(queue);
    }).catch(function (err) {
        Logger.errlog.log("Copying ranks to channel_ranks failed: " + err);
        if (err.stack) {
            Logger.errlog.log(err.stack);
        }
    }).done(function () { cb(null); });
}

function mergeChannelBans(cb) {
    Q.nfcall(db.query, "SHOW TABLES")
    .then(function (rows) {
        rows = rows.map(function (r) {
            return r[Object.keys(r)[0]];
        }).filter(function (r) {
            return r.match(/chan_(.*?)_bans$/);
        });

        var queue = [];
        rows.forEach(function (table) {
            var name = table.match(/chan_(.*?)_bans$/)[1];
            queue.push(Q.nfcall(db.query,
                "INSERT INTO `channel_bans` SELECT id, ip, name, bannedby, reason, ?" +
                " AS channel FROM `" + table + "`", [name])
                .then(function () {
                    Logger.syslog.log("Copied " + table + " to channel_bans");
                }).catch(function (err) {
                    Logger.errlog.log("Copying " + table + " to channel_bans failed: " +
                        err);
                    if (err.stack) {
                        Logger.errlog.log(err.stack);
                    }
                })
            );
        });

        return Q.all(queue);
    }).catch(function (err) {
        Logger.errlog.log("Copying ranks to channel_bans failed: " + err);
        if (err.stack) {
            Logger.errlog.log(err.stack);
        }
    }).done(function () { cb(null); });
}

module.exports.deleteOldChannelTables = function (cb) {
    Q.nfcall(db.query, "SHOW TABLES")
    .then(function (rows) {
        rows = rows.map(function (r) {
            return r[Object.keys(r)[0]];
        }).filter(function (r) {
            return r.match(/chan_(.*?)_(library|ranks|bans)$/);
        });

        var queue = [];
        rows.forEach(function (table) {
            queue.push(Q.nfcall(db.query, "DROP TABLE `" + table + "`")
                .then(function () {
                    Logger.syslog.log("Deleted " + table);
                }).catch(function (err) {
                    Logger.errlog.log("Deleting " + table + " failed: " + err);
                    if (err.stack) {
                        Logger.errlog.log(err.stack);
                    }
                })
            );
        });

        return Q.all(queue);
    }).catch(function (err) {
        Logger.errlog.log("Deleting old tables failed: " + err);
        if (err.stack) {
            Logger.errlog.log(err.stack);
        }
    }).done(cb);
};

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
        Logger.syslog.log("Fixed utf8mb4");
        cb();
    }).catch(function (e) {
        Logger.errlog.log("Failed to fix utf8mb4: " + e);
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
            Logger.syslog.log("Converted custom embeds.");
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
                        Logger.syslog.log("WARNING: Unable to convert " + item.id);
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
                Logger.syslog.log('Fixed custom embeds in user_playlists');
                cb();
            });
        }).catch(function (err) {
            Logger.errlog.log(err.stack);
        });
}
