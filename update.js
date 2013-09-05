var Config = require("./lib/config.js");
var Database = require("./lib/database.js");

var updates = {
    "2013-08-20-utf8fix": fixDBUnicode,
    "2013-08-21-banfix": fixChannelBanKey
};

var x = {};
Config.load(x, "cfg.json", function () {
    var db = new Database(x.cfg);
    
    var u = process.argv[2];
    if(!(u in updates)) {
        console.log("Usage: node update.js <update>");
        console.log("Available updates: ");
        for(var k in updates) {
            console.log("    " + k);
        }
        process.exit(0);
    }

    var fn = updates[u];
    fn(db);
});

/*
    2013-08-20

    This function iterates over tables in the database and converts the
    encoding on each to UTF-8.

    Furthermore, it does the following to convert channel libraries in
    a way such that UTF-8 titles stored in other encodings (e.g. latin1)
    are preserved as UTF-8:
        1. Change the `title` column to BLOB (unencoded)
        2. Change the table character set to utf8
        3. Change the `title` column to VARCHAR(255) CHARACTER SET utf8

    This corrects an encoding issue that was exposed when switching to
    node-mysql.  mysql-libmysqlclient ignored database encoding and assumed
    the data was UTF-8.

*/

function fixDBUnicode(db) {
    db.query("SHOW TABLES", function (err, res) {
        if(err) {
            console.log(err);
            return;
        }

        var libs = [];
        var waiting = res.length;
        res.forEach(function (r) {
            var k = Object.keys(r)[0];
            if(r[k].match(/^chan_[\w-_]{1,30}_library$/)) {
                libs.push(r[k]);
                waiting--;
                return;
            } else if(r[k] == "user_playlists") {
                waiting--;
                return;
            }
            db.query("ALTER TABLE `" + r[k] + "` CONVERT TO CHARACTER SET utf8", function (err, _) {
                waiting--;
                if(err)
                    console.log("FAIL: " + r[k]);
                else
                    console.log("Fixed " + r[k]);
            });
        });
        var s1int = setInterval(function () {
            if(waiting == 0) {
                clearInterval(s1int);
                waiting = libs.length + 1;
                libs.forEach(function (lib) {
                    db.query("ALTER TABLE `"+lib+"` MODIFY title BLOB", function (err, _) {
                        if(err) {
                            console.log(err);
                            waiting--;
                            return;
                        }
                        db.query("ALTER TABLE `"+lib+"` CHARACTER SET utf8", function (err, _) {
                            if(err) {
                                console.log(err);
                                waiting--;
                                return;
                            }
                            db.query("ALTER TABLE `"+lib+"` MODIFY title VARCHAR(255) CHARACTER SET utf8", function (err, _) {
                                waiting--;
                                if(err) {
                                    console.log(err);
                                    return;
                                }
                                console.log("Fixed " + lib);
                            });
                        });
                    });
                });
                db.query("ALTER TABLE user_playlists MODIFY contents MEDIUMBLOB", function (err, _) {
                    if(err) {
                        console.log(err);
                        waiting--;
                        return;
                    }
                    db.query("ALTER TABLE user_playlists CHARACTER SET utf8", function (err, _) {
                        if(err) {
                            console.log(err);
                            waiting--;
                            return;
                        }
                        db.query("ALTER TABLE user_playlists MODIFY contents MEDIUMTEXT CHARACTER SET utf8", function (err, _) {
                            waiting--;
                            if(err) {
                                console.log(err);
                                return;
                            }
                            console.log("Fixed user_playlists");
                        });
                    });
                });
                setInterval(function () {
                    if(waiting == 0) {
                        console.log("Done");
                        process.exit(0);
                    }
                }, 1000);
            }
        }, 1000);
    });
}

/*
    2013-08-21

    This function iterates over channel ban tables and corrects the
    PRIMARY KEY.  Previously, the table was defined with PRIMARY KEY (ip),
    but in reality, (ip, name) should be pairwise unique.

    This corrects the issue where only one name ban can exist in the table
    because of the `ip` field "*" being unique.

*/

function fixChannelBanKey(db) {
    db.query("SHOW TABLES", function (err, res) {
        if(err) {
            console.log("SEVERE: SHOW TABLES failed");
            return;
        }

        var count = res.length;
        res.forEach(function (r) {
            var k = Object.keys(r)[0];

            if(!r[k].match(/^chan_[\w-_]{1,30}_bans$/)) {
                count--;
                return;
            }

            db.query("ALTER TABLE `" + r[k] + "` DROP PRIMARY KEY, ADD PRIMARY KEY (ip, name)", function (err, res) {
                count--;
                if(err) {
                    console.log("FAILED: " + r[k]);
                    return;
                }
                
                console.log("Fixed " + r[k]);
            });
        });

        setInterval(function () {
            if(count == 0) {
                console.log("Done");
                process.exit(0);
            }
        }, 1000);
    });
}
