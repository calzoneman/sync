var Server = require("./lib/server");
var Config = require("./lib/config");
var Logger = require("./lib/logger");

Config.load("config.yaml");
var sv = Server.init();
if (!Config.get("debug")) {
    process.on("uncaughtException", function (err) {
        Logger.errlog.log("[SEVERE] Uncaught Exception: " + err);
        Logger.errlog.log(err.stack);
    });

    process.on("SIGINT", function () {
        sv.shutdown();
    });
}

var stdinbuf = "";
process.stdin.on("data", function (data) {
    stdinbuf += data;
    if (stdinbuf.indexOf("\n") !== -1) {
        var line = stdinbuf.substring(0, stdinbuf.indexOf("\n"));
        stdinbuf = stdinbuf.substring(stdinbuf.indexOf("\n") + 1);
        handleLine(line);
    }
});

function handleLine(line) {
    if (line === "/reload") {
        Logger.syslog.log("Reloading config");
        Config.load("config.yaml");
    } else if (line === "/gc") {
        if (global && global.gc) {
            Logger.syslog.log("Running GC");
            global.gc();
        } else {
            Logger.syslog.log("Failed to invoke GC: node started without --expose-gc");
        }
    } else if (line === "/delete_old_tables") {
        require("./lib/database/update").deleteOldChannelTables(function (err) {
            if (!err) {
                Logger.syslog.log("Deleted old channel tables");
            }
        });
    }
}
