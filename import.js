/**
 * Utility for importing a CyTube 2.4.6 database to 3.0
 */

var mysql = require("mysql");
var AsyncQueue = require("./lib/asyncqueue");
var tables = require("./lib/database/tables");

var olddb = {
    host: "",
    user: "",
    password: "",
    database: ""
};

var newdb = {
    host: "",
    user: "",
    password: "",
    database: ""
};

var oldpool;
var newpool;

function query(pool, query, sub, callback) {
    // 2nd argument is optional
    if (typeof sub === "function") {
        callback = sub;
        sub = false;
    }

    if (typeof callback !== "function") {
        callback = function () { };
    }

    pool.getConnection(function (err, conn) {
        if (err) {
            console.log("[ERROR] DB connection failed: " + err);
            callback("Database failure", null);
        } else {
            function cback(err, res) {
                if (err) {
                    console.log("[ERROR] DB query failed: " + query);
                    if (sub) {
                        console.log("[ERROR] Substitutions: " + sub);
                    }
                    console.log("[ERROR] " + err);
                    callback("Database failure", null);
                } else {
                    callback(null, res);
                }
                conn.release();
            }

            if (sub) {
                conn.query(query, sub, cback);
            } else {
                conn.query(query, cback);
            }
        }
    });
};

var queryOld;
var queryNew;

function chain(/* arguments */) {
    var args = Array.prototype.slice.call(arguments);
    var cb = args.pop();
    var next = function () {
        if (args.length > 0) {
            args.shift()(next);
        } else {
            cb();
        }
    };

    next();
}

/**
 * Imports entries from the registrations table of 2.4.6 to the users table of 3.0
 */
function importUsers(cb) {
    console.log("[INFO] Importing users");
    var insert = "INSERT INTO `users` (`name`, `password`, `global_rank`, " +
                 "`email`, `profile`, `time`) VALUES (?, ?, ?, ?, ?, ?)";
    queryOld("SELECT * FROM `registrations`", function (err, rows) {
        if (err) {
            cb(err);
            return;
        }

        rows.sort(function (a, b) {
            return a.id - b.id;
        });

        var aq = new AsyncQueue();
        rows.forEach(function (r) {
            var data = [r.uname, r.pw, r.global_rank, r.email,
                        JSON.stringify({ image: r.profile_image, text: r.profile_text }),
                        Date.now()];
            aq.queue(function (lock) {
                queryNew(insert, data, function (err) {
                    if (!err) {
                        console.log("Imported user " + r.uname);
                    }
                    lock.release();
                });
            });
        });

        aq.queue(function (lock) {
            lock.release();
            cb();
        });
    });
}

/**
 * Imports channel registration entries from `channels` table
 */
function importChannelRegistrations(cb) {
    var insert = "INSERT INTO `channels` (`name`, `owner`, `time`) VALUES (?, ?, ?)";

    queryOld("SELECT * FROM channels", function (err, rows) {
        if (err) {
            cb(err);
            return;
        }

        rows.sort(function (a, b) {
            return a.id - b.id;
        });

        var aq = new AsyncQueue();
        rows.forEach(function (r) {
            var data = [r.name, r.owner, Date.now()];
            aq.queue(function (lock) {
                queryNew(insert, data, function (err) {
                    if (!err) {
                        console.log("Imported channel record " + r.name + " (" + r.owner + ")");
                    }
                    lock.release();
                });
            });
        });

        aq.queue(function (lock) {
            lock.release();
            cb();
        });
    });
}

/**
 * Imports ranks/bans/library
 */
function importChannelTables(cb) {
    console.log("Importing channel ranks, libraries, bans");
    queryOld("SELECT * FROM `channels`", function (err, rows) {
        if (err) {
            cb(err);
            return;
        }

        var aq = new AsyncQueue();

        rows.forEach(function (r) {
            aq.queue(function (lock) {
                console.log("Creating channel tables for "+r.name);
                tables.createChannelTables(r.name, queryNew, function () {
                    copyChannelTables(r.name, function () {
                        lock.release();
                    });
                });
            });
        });

        aq.queue(function (lock) {
            lock.release();
            cb();
        });
    });
}

function copyChannelTables(name, cb) {
    var copyRanks = function () {
        queryOld("SELECT * FROM `chan_"+name+"_ranks`", function (err, rows) {
            if (err) {
                cb(err);
                return;
            }

            rows = rows.filter(function (r) {
                return r.rank > 1;
            });

            rows = rows.map(function (r) {
                if (r.rank === 10) {
                    r.rank = 5;
                } else if (r.rank > 3 && r.rank < 10) {
                    r.rank = 4;
                }
                return [r.name, r.rank];
            });

            if (rows.length === 0) {
                console.log("`chan_"+name+"_ranks` is empty");
                copyLibrary();
                return;
            }

            console.log("Copying `chan_"+name+"_ranks`");
            queryNew("INSERT INTO `chan_"+name+"_ranks` VALUES ?", [rows], copyLibrary);
        });
    };

    var copyLibrary = function () {
        queryOld("SELECT * FROM `chan_"+name+"_library`", function (err, rows) {
            if (err) {
                cb(err);
                return;
            }

            rows = rows.map(function (r) {
                return [r.id, r.title, r.seconds, r.type];
            });

            if (rows.length === 0) {
                console.log("`chan_"+name+"_library` is empty");
                copyBans();
                return;
            }

            var subs = [];
            while (rows.length > 1000) {
                subs.push(rows.slice(0, 1000));
                rows = rows.slice(1000);
            }

            if (rows.length > 0) {
                subs.push(rows);
            }

            if (subs.length > 1) {
                console.log("`chan_"+name+"_library` is >1000 rows, requires multiple inserts");
            }

            var aq = new AsyncQueue();
            subs.forEach(function (s) {
                aq.queue(function (lock) {
                    console.log("Copying `chan_"+name+"_library`");
                    queryNew("INSERT INTO `chan_"+name+"_library` VALUES ?",
                             [s], function () {
                        lock.release();
                    });
                });
            });

            aq.queue(function (lock) {
                lock.release();
                copyBans();
            });
        });
    };

    var copyBans = function () {
        queryOld("SELECT * FROM `chan_"+name+"_bans`", function (err, rows) {
            if (err) {
                cb(err);
                return;
            }

            rows = rows.map(function (r) {
                return [r.id, r.ip, r.name, r.bannedby, r.reason];
            });

            if (rows.length === 0) {
                console.log("`chan_"+name+"_bans` is empty");
                cb();
                return;
            }

            console.log("Copying `chan_"+name+"_bans`");
            queryNew("INSERT INTO `chan_"+name+"_bans` VALUES ?", [rows], cb);
        });
    };

    copyRanks();
}

function importGlobalBans(cb) {
    console.log("Importing global bans");
    queryOld("SELECT * FROM `global_bans`", function (err, bans) {
        if (err) {
            cb(err);
            return;
        }

        bans = bans.map(function (b) {
            return [b.ip, b.reason];
        });
        queryNew("INSERT INTO `global_bans` VALUES ?", [bans], cb);
    });
}

function importUserPlaylists(cb) {
    console.log("Importing user playlists");
    queryOld("SELECT * FROM `user_playlists`", function (err, pls) {
        if (err) {
            cb(err);
            return;
        }

        pls = pls.map(function (pl) {
            return [pl.user, pl.name, pl.contents, pl.count, pl.duration];
        });
        var subs = [];
        while (pls.length > 10) {
            subs.push(pls.slice(0, 10));
            pls = pls.slice(10);
        }

        if (pls.length > 0) {
            subs.push(pls);
        }

        var aq = new AsyncQueue();
        subs.forEach(function (s) {
            aq.queue(function (lock) {
                queryNew("INSERT INTO `user_playlists` VALUES ?", [s], function () {
                    lock.release();
                });
            });
        });

        aq.queue(function (lock) {
            lock.release();
            cb();
        });
    });
}

function importAliases(cb) {
    console.log("Importing aliases");
    queryOld("SELECT * FROM `aliases`", function (err, aliases) {
        if (err) {
            cb(err);
            return;
        }

        aliases = aliases.map(function (al) {
            return [al.visit_id, al.ip, al.name, al.time];
        });

        var subs = [];
        while (aliases.length > 1000) {
            subs.push(aliases.slice(0, 1000));
            aliases = aliases.slice(1000);
        }

        if (aliases.length > 0) {
            subs.push(aliases);
        }

        var aq = new AsyncQueue();
        subs.forEach(function (s) {
            aq.queue(function (lock) {
                queryNew("INSERT INTO `aliases` VALUES ?", [s], function () {
                    lock.release();
                });
            });
        });

        aq.queue(function (lock) {
            lock.release();
            cb();
        });
    });
}

function main() {
    var aq = new AsyncQueue();
    var readline = require("readline");
    console.log("This script will generate a lot of text output, both informational and " +
                "possibly errors.  I recommend running it as `node import.js | " +
                "tee import.log` or similar to pipe output to a log file for easy reading");
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    aq.queue(function (lock) {
        rl.question("2.x host: ", function (host) {
            olddb.host = host;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        rl.question("2.x username: ", function (user) {
            olddb.user = user;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        rl.question("2.x password: ", function (pw) {
            olddb.password = pw;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        rl.question("2.x database: ", function (db) {
            olddb.database = db;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        rl.question("3.0 host: ", function (host) {
            newdb.host = host;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        rl.question("3.0 username: ", function (user) {
            newdb.user = user;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        rl.question("3.0 password: ", function (pw) {
            newdb.password = pw;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        rl.question("3.0 database: ", function (db) {
            newdb.database = db;
            lock.release();
        });
    });
    aq.queue(function (lock) {
        oldpool = mysql.createPool(olddb);
        newpool = mysql.createPool(newdb);
        queryOld = query.bind(this, oldpool);
        queryNew = query.bind(this, newpool);
        startImport();
    });
}

function startImport() {
    tables.init(queryNew, function (err) {
        if (!err) {
            var aq = new AsyncQueue();
            aq.queue(function (lock) {
                importUsers(function () {
                    lock.release();
                });
            });
            aq.queue(function (lock) {
                importChannelRegistrations(function () {
                    lock.release(); });
            });
            aq.queue(function (lock) {
                importChannelTables(function () {
                    lock.release();
                });
            });
            aq.queue(function (lock) {
                importGlobalBans(function () {
                    lock.release();
                });
            });
            aq.queue(function (lock) {
                importUserPlaylists(function () {
                    lock.release();
                });
            });
            aq.queue(function (lock) {
                importAliases(function () {
                    lock.release();
                });
            });
            aq.queue(function (lock) {
                process.exit(0);
            });
        } else {
            console.log("[ERROR] Aborting due to errors initializing tables");
        }
    });
}

main();
