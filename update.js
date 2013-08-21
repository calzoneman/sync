var Config = require("./config.js");
var Database = require("./database.js");

var updates = {
    "2013-08-20-utf8fix": fixDBUnicode
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
