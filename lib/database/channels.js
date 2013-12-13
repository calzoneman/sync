var db = require("../database");
var $util = require("../utilities");

var blackHole = function () { };

function dropTable(name, callback) {
    db.query("DROP TABLE `" + name + "`");
}

function createRanksTable(name, callback) {
    db.query("CREATE TABLE `chan_" + name + "_ranks` (" +
                "`name` VARCHAR(20) NOT NULL," +
                "`rank` INT NOT NULL," +
             "PRIMARY KEY (`name`)) " +
             "CHARACTER SET utf8", callback);
}

function createLibraryTable(name, callback) {
    db.query("CREATE TABLE `chan_" + name + "_library` (" +
                "`id` VARCHAR(255) NOT NULL," +
                "`title` VARCHAR(255) NOT NULL," +
                "`seconds` INT NOT NULL,"
                "`type` VARCHAR(2) NOT NULL," +
             "PRIMARY KEY (`id`))" +
             "CHARACTER SET utf8", callback);
}

function createBansTable(name, callback) {
    db.query("CREATE TABLE `chan_" + name + "_bans` (" +
                "`ip` VARCHAR(39) NOT NULL," +
                "`name` VARCHAR(20) NOT NULL," +
                "`bannedby` VARCHAR(20) NOT NULL," +
                "`reason` VARCHAR(255) NOT NULL," +
             "PRIMARY KEY (`ip`, `name`))" +
             "CHARACTER SET utf8", callback);
}

function initTables(name, owner, callback) {
    createRanksTable(name, function (err) {
        if (err) {
            callback(err, null);
            return;
        }

        // TODO add owner to ranks table

        createLibraryTable(name, function (err) {
            if (err) {
                dropTable("chan_" + name + "_ranks");
                callback(err, null);
                return;
            }

            createBansTable(name, function (err) {
                if (err) {
                    dropTable("chan_" + name + "_ranks");
                    dropTable("chan_" + name + "_library");
                    callback(err, null);
                    return;
                }
                
                callback(null, true);
            });
        });
    });
}

module.exports = {
    /**
     * Initialize the channels table
     */
    init: function () {
        db.query("CREATE TABLE IF NOT EXISTS `channels` (" +
                    "`id` INT NOT NULL AUTO_INCREMENT," +
                    "`name` VARCHAR(30) NOT NULL," +
                    "`owner` VARCHAR(20) NOT NULL," +
                    "`time` BIGINT NOT NULL," +
                 "PRIMARY KEY (`id`), INDEX(`name`), INDEX(`owner`))" +
                 "CHARACTER SET utf8");
    },

    /**
     * Checks if the given channel name is registered
     */
    isChannelTaken: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        dbutil.query("SELECT name FROM `channels` WHERE name=?",
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

        dbutil.query("SELECT * FROM `channels` WHERE name=?",
                     [name],
                     function (err, rows) {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, rows);
        });
    },

    /**
     * Searches for a channel
     */
    search: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        dbutil.query("SELECT * FROM `channels` WHERE name LIKE ?",
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

        if (!$util.isValidChannelName(name)) {
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

            dbutil.query("INSERT INTO `channels` " +
                         "(`name`, `owner`, `time`) VALUES (?, ?, ?)",
                         [name, owner, Date.now()],
                         function (err, res) {
                if (err) {
                    callback(err, null);
                    return;
                }

                initTables(name, owner, function (err, res) {
                    if (err) {
                        dbutil.query("DELETE FROM `channels` WHERE name=?", [name]);
                        callback(err, null);
                        return;
                    }
                    callback(null, {
                        name: name
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

        dropTable("chan_" + name + "_ranks", function (err) {
            dropTable("chan_" + name + "_bans", function (e2) {
                if (err && e2) {
                    err += "\n" + e2;
                } else if (e2) {
                    err = e2;
                }

                dropTable("chan_" + name + "_library", function (e3) {
                    if (err && e3) {
                        err += "\n" + e3;
                    } else if (e3) {
                        err = e3;
                    }

                    db.query("DELETE FROM `channels` WHERE name=?", [name],
                    function (e4) {
                        if (err && e4) {
                            err += "\n" + e4;
                        } else if (e4) {
                            err = e4;
                        }

                        callback(err, !Boolean(err));
                    }
                });
            });
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

    /**
     * Looks up a user's rank
     */
    getRank: function (chan, name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        db.query("SELECT name,rank FROM `chan_" + chan + "_ranks` WHERE name=?",
                 [name],
        function (err, rows) {
            if (err) {
                callback(err, 1);
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

        var replace = "(" + names.map(function () { return "?"; }).join(",") + ")";
        db.query("SELECT name,rank FROM `chan_" + chan + "_ranks` WHERE name IN " +
                 replace,
        function (err, rows) {
            if (err) {
                callback(err, []);
                return;
            }

            callback(null, rows);
        });
    },
};
