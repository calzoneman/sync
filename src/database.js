var Config = require("./config");
var tables = require("./database/tables");
import knex from 'knex';
import { GlobalBanDB } from './db/globalban';
import { MetadataCacheDB } from './database/metadata_cache';
import { Summary, Counter } from 'prom-client';

const LOGGER = require('@calzoneman/jsli')('database');
const queryLatency = new Summary({
    name: 'cytube_db_query_duration_seconds',
    help: 'DB query latency (including time spent acquiring connections)'
});
const queryCount = new Counter({
    name: 'cytube_db_queries_total',
    help: 'DB query count'
});
const queryErrorCount = new Counter({
    name: 'cytube_db_query_errors_total',
    help: 'DB query error count'
});

setInterval(() => {
    queryLatency.reset();
}, 5 * 60 * 1000).unref();

let db = null;
let globalBanDB = null;

class Database {
    constructor(knexConfig = null) {
        if (knexConfig === null) {
            knexConfig = {
                client: 'mysql',
                connection: {
                    host: Config.get('mysql.server'),
                    port: Config.get('mysql.port'),
                    user: Config.get('mysql.user'),
                    password: Config.get('mysql.password'),
                    database: Config.get('mysql.database'),
                    multipleStatements: true, // Legacy thing
                    charset: 'utf8mb4'
                },
                pool: {
                    min: Config.get('mysql.pool-size'),
                    max: Config.get('mysql.pool-size')
                },
                debug: !!process.env.KNEX_DEBUG
            };
        }

        this.knex = knex(knexConfig);
    }

    runTransaction(fn) {
        const end = queryLatency.startTimer();
        return this.knex.transaction(fn).catch(error => {
            queryErrorCount.inc(1);
            throw error;
        }).finally(() => {
            end();
            queryCount.inc(1);
        });
    }
}

module.exports.Database = Database;
module.exports.users = require("./database/accounts");
module.exports.channels = require("./database/channels");

module.exports.init = function (newDB) {
    if (newDB) {
        db = newDB;
    } else {
        db = new Database();
    }
    db.knex.raw('select 1 from dual')
            .catch(error => {
                LOGGER.error('Initial database connection failed: %s', error.stack);
                process.exit(1);
            })
            .then(() => tables.initTables())
            .then(() => {
                require('./database/update').checkVersion();
                module.exports.loadAnnouncement();
                require('@cytube/mediaquery/lib/provider/youtube').setCache(
                    new MetadataCacheDB(db)
                );
            }).catch(error => {
                LOGGER.error(error.stack);
                process.exit(1);
            });
};

module.exports.getDB = function getDB() {
    return db;
};

module.exports.getGlobalBanDB = function getGlobalBanDB() {
    if (globalBanDB === null) {
        globalBanDB = new GlobalBanDB(db);
    }

    return globalBanDB;
};

/**
 * Execute a database query
 */
module.exports.query = function (query, sub, callback) {
    // 2nd argument is optional
    if (typeof sub === "function") {
        callback = sub;
        sub = undefined;
    }

    if (typeof callback !== "function") {
        callback = blackHole;
    }

    if (process.env.SHOW_SQL) {
        LOGGER.debug('%s', query);
    }

    const end = queryLatency.startTimer();
    db.knex.raw(query, sub)
        .then(res => {
            process.nextTick(callback, null, res[0]);
        }).catch(error => {
            queryErrorCount.inc(1);

            if (!sub) {
                sub = [];
            }

            let subs = JSON.stringify(sub);
            if (subs.length > 100) {
                subs = subs.substring(0, 100) + '...';
            }

            // Attempt to strip off the beginning of the message which
            // contains the entire substituted SQL query (followed by an
            // error code)
            // Thanks MySQL/MariaDB...
            error.message = error.message.replace(/^.* - ER/, 'ER');

            LOGGER.error(
                'Legacy DB query failed.  Query: %s, Substitutions: %s, ' +
                'Error: %s',
                query,
                subs,
                error
            );
            process.nextTick(callback, 'Database failure', null);
        }).finally(() => {
            end();
            queryCount.inc(1);
        });
};

/**
 * Dummy function to be used as a callback when none is provided
 */
function blackHole() {

}

/* password recovery */

/**
 * Deletes recovery rows older than the given time
 */
module.exports.cleanOldPasswordResets = function (callback) {
    if (typeof callback === "undefined") {
        callback = blackHole;
    }

    var query = "DELETE FROM password_reset WHERE expire < ?";
    module.exports.query(query, [Date.now() - 24*60*60*1000], callback);
};

module.exports.addPasswordReset = function (data, cb) {
    if (typeof cb !== "function") {
        cb = blackHole;
    }

    var ip = data.ip || "";
    var name = data.name;
    var email = data.email;
    var hash = data.hash;
    var expire = data.expire;

    if (!name || !hash) {
        cb("Internal error: Must provide name and hash to insert a new password reset", null);
        return;
    }

    module.exports.query("INSERT INTO `password_reset` (`ip`, `name`, `email`, `hash`, `expire`) " +
                         "VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE ip=?, hash=?, email=?, expire=?",
                         [ip, name, email, hash, expire, ip, hash, email, expire], cb);
};

module.exports.lookupPasswordReset = function (hash, cb) {
    if (typeof cb !== "function") {
        return;
    }

    module.exports.query("SELECT * FROM `password_reset` WHERE hash=?", [hash],
                         function (err, rows) {
        if (err) {
            cb(err, null);
        } else if (rows.length === 0) {
            cb("Invalid password reset link", null);
        } else {
            cb(null, rows[0]);
        }
    });
};

module.exports.deletePasswordReset = function (hash) {
    module.exports.query("DELETE FROM `password_reset` WHERE hash=?", [hash]);
};

/* user playlists */

/**
 * Retrieve all of a user's playlists
 */
module.exports.listUserPlaylists = function (name, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT name, count, duration FROM user_playlists WHERE user=?";
    module.exports.query(query, [name], callback);
};

/**
 * Retrieve a user playlist by (user, name) pair
 */
module.exports.getUserPlaylist = function (username, plname, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT contents FROM user_playlists WHERE " +
                "user=? AND name=?";

    module.exports.query(query, [username, plname], function (err, res) {
        if (err) {
            callback(err, null);
            return;
        }

        if (res.length == 0) {
            callback("Playlist does not exist", null);
            return;
        }

        var pl = null;
        try {
            pl = JSON.parse(res[0].contents);
        } catch(e) {
            callback("Malformed playlist JSON", null);
            return;
        }
        callback(null, pl);
    });
};

/**
 * Saves a user playlist.  Overwrites if the playlist keyed by
 * (user, name) already exists
 */
module.exports.saveUserPlaylist = function (pl, username, plname, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var tmp = [], time = 0;
    for(var i in pl) {
        var e = {
            id: pl[i].media.id,
            title: pl[i].media.title,
            seconds: pl[i].media.seconds || 0,
            type: pl[i].media.type,
            meta: {
                codec: pl[i].media.meta.codec,
                bitrate: pl[i].media.meta.bitrate,
                scuri: pl[i].media.meta.scuri,
                embed: pl[i].media.meta.embed
            }
        };
        time += pl[i].media.seconds || 0;
        tmp.push(e);
    }
    var count = tmp.length;
    var plText = JSON.stringify(tmp);

    var query = "INSERT INTO user_playlists VALUES (?, ?, ?, ?, ?) " +
                "ON DUPLICATE KEY UPDATE contents=?, count=?, duration=?";

    var params = [username, plname, plText, count, time,
                  plText, count, time];

    module.exports.query(query, params, callback);
};

/**
 * Deletes a user playlist
 */
module.exports.deleteUserPlaylist = function (username, plname, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var query = "DELETE FROM user_playlists WHERE user=? AND name=?";
    module.exports.query(query, [username, plname], callback);
};

/* aliases */

/**
 * Records a user or guest login in the aliases table
 */
module.exports.recordVisit = function (ip, name, callback) {
    if (typeof callback !== "function") {
        callback = blackHole;
    }

    var time = Date.now();
    var query = "DELETE FROM aliases WHERE ip=? AND name=?;" +
                "INSERT INTO aliases VALUES (NULL, ?, ?, ?)";

    module.exports.query(query, [ip, name, ip, name, time], callback);
};

/**
 * Deletes alias rows older than the given time
 */
module.exports.cleanOldAliases = function (expiration, callback) {
    if (typeof callback === "undefined") {
        callback = blackHole;
    }

    var query = "DELETE FROM aliases WHERE time < ?";
    module.exports.query(query, [Date.now() - expiration], callback);
};

/**
 * Retrieves a list of aliases for an IP address
 */
module.exports.getAliases = function (ip, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT name,time FROM aliases WHERE ip";
    // if the ip parameter is a /24 range, we want to match accordingly
    if (ip.match(/^\d+\.\d+\.\d+$/) || ip.match(/^\d+\.\d+$/)) {
        query += " LIKE ?";
        ip += ".%";
    } else if (ip.match(/^(?:[0-9a-f]{4}:){3}[0-9a-f]{4}$/) ||
               ip.match(/^(?:[0-9a-f]{4}:){2}[0-9a-f]{4}$/)) {
        query += " LIKE ?";
        ip += ":%";
    } else {
        query += "=?";
    }

    query += " ORDER BY time DESC LIMIT 5";

    module.exports.query(query, [ip], function (err, res) {
        var names = null;
        if(!err) {
            names = res.map(function (row) { return row.name; });
        }

        callback(err, names);
    });
};

/**
 * Retrieves a list of IPs that a name as logged in from
 */
module.exports.getIPs = function (name, callback) {
    if (typeof callback !== "function") {
        return;
    }

    var query = "SELECT ip FROM aliases WHERE name=?";
    module.exports.query(query, [name], function (err, res) {
        var ips = null;
        if(!err) {
            ips = res.map(function (row) { return row.ip; });
        }
        callback(err, ips);
    });
};

/* END REGION */

/* Misc */
module.exports.loadAnnouncement = function () {
    var query = "SELECT * FROM `meta` WHERE `key`='announcement'";
    module.exports.query(query, function (err, rows) {
        if (err) {
            return;
        }

        if (rows.length === 0) {
            return;
        }

        var announcement = rows[0].value;
        try {
            announcement = JSON.parse(announcement);
        } catch (e) {
            LOGGER.error("Invalid announcement data in database: " +
                              announcement.value);
            module.exports.clearAnnouncement();
            return;
        }

        var Server = require("./server");
        if (!Server.getServer || !Server.getServer()) {
            return;
        }

        var sv = Server.getServer();
        sv.announcement = announcement;
        for (var id in sv.ioServers) {
            sv.ioServers[id].emit("announcement", announcement);
        }
    });
};

module.exports.setAnnouncement = function (data) {
    var query = "INSERT INTO `meta` (`key`, `value`) VALUES ('announcement', ?) " +
                "ON DUPLICATE KEY UPDATE `value`=?";
    var repl = JSON.stringify(data);
    module.exports.query(query, [repl, repl]);
};

module.exports.clearAnnouncement = function () {
    module.exports.query("DELETE FROM `meta` WHERE `key`='announcement'");
};
