var db = require("../database");
var Logger = require("../logger");
var Q = require("q");

const DB_VERSION = 2;

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
    if (version === 1) {
        addMetaColumnToLibraries(cb);
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
