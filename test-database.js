var cfg = {
    "mysql-server": "localhost",
    "mysql-user": "syncdevel",
    "mysql-db": "syncdevel",
    "mysql-pw": "tacky",
    "debug": true
};

var Database = require("./database");

var db = new Database(cfg);
var assert = require('assert');
db.init();

setTimeout(function () {
    db.channelExists("adsjnfgjdsg", function (err, res) {
        assert(!err && !res);
    });

    db.channelExists("xchan", function (err, res) {
        assert(!err && res);
    });

    db.removeFromLibrary("xchan", "xxx2364", function (err, res) {
        assert(!err);
        console.log(res);
    });

    db.getLibraryItem("xchan", "xxx23456", function (err, media) {
        assert(!err);
        assert(media === null);
    });

    db.getLibraryItem("xchan", "G7X5s5vacIU", function (err, media) {
        assert(!err);
        assert(media !== null);
        assert(media.id === "G7X5s5vacIU");
    });
}, 1000);
