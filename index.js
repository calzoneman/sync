if (/^v0/.test(process.version)) {
    console.error('node.js ' + process.version + ' is not supported.  ' +
            'For more information, visit ' +
            'https://github.com/calzoneman/sync/wiki/CyTube-3.0-Installation-Guide#nodejs');
    process.exit(1);
}

try {
    var Server = require("./lib/server");
} catch (err) {
    console.error('FATAL: Failed to require() lib/server.js');
    if (/module version mismatch/i.test(err.message)) {
        console.error('Module version mismatch, try running `npm rebuild` or removing ' +
                      'the node_modules folder and re-running `npm install`');
    } else {
        console.error('Possible causes:\n' +
                      '  * You haven\'t run `npm run build-server` to regenerate ' +
                      'the runtime\n' +
                      '  * You\'ve upgraded node/npm and haven\'t rebuilt dependencies ' +
                      '(try `npm rebuild` or `rm -rf node_modules && npm install`)\n' +
                      '  * A dependency failed to install correctly (check the output ' +
                      'of `npm install` next time)');
    }
    console.error(err.stack);
    process.exit(1);
}
var Config = require("./lib/config");
var Logger = require("./lib/logger");
const Switches = require("./lib/switches");
require("source-map-support").install();

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

var validIP = require('net').isIP;
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
    } else if (line.indexOf("/switch") === 0) {
        var args = line.split(" ");
        args.shift();
        if (args.length === 1) {
            Logger.syslog.log("Switch " + args[0] + " is " +
                    (Switches.isActive(args[0]) ? "ON" : "OFF"));
        } else if (args.length === 2) {
            Switches.setActive(args[0], args[1].toLowerCase() === "on" ? true : false);
            Logger.syslog.log("Switch " + args[0] + " is now " +
                    (Switches.isActive(args[0]) ? "ON" : "OFF"));
        }
    } else if (line.indexOf("/reload-partitions") === 0) {
        sv.reloadPartitionMap();
    } else if (line.indexOf("/globalban") === 0) {
        var args = line.split(/\s+/); args.shift();
        if (args.length >= 2 && validIP(args[0]) !== 0) {
            var ip = args.shift();
            var comment = args.join(' ');
            require("./lib/database").globalBanIP(ip, comment, function (err, res) {
                if (!err) {
                    Logger.eventlog.log("[acp] " + "SYSTEM" + " global banned " + ip);
                }
            })
        }
    } else if (line.indexOf("/unglobalban") === 0) {
        var args = line.split(/\s+/); args.shift();
        if (args.length >= 1 && validIP(args[0]) !== 0) {
            var ip = args.shift();
            require("./lib/database").globalUnbanIP(ip, function (err, res) {
                if (!err) {
                    Logger.eventlog.log("[acp] " + "SYSTEM" + " un-global banned " + ip);
                }
            })
        }
    } else if (line.indexOf("/unloadchan") === 0) {
        var args = line.split(/\s+/); args.shift();
        if(args.length){
            var name = args.shift();
            var chan = sv.getChannel(name);
            var users = Array.prototype.slice.call(chan.users);
            chan.emit("empty");
            users.forEach(function (u) {
                u.kick("Channel shutting down");
            });
            Logger.eventlog.log("[acp] " + "SYSTEM" + " forced unload of " + name);
        }
    }
}

// Go Go Gadget Service Socket
if (Config.get("service-socket.enabled")) {
    Logger.syslog.log("Opening service socket");
    var ServiceSocket = require('./lib/servsock');
    var server = new ServiceSocket;
    server.init(handleLine, Config.get("service-socket.socket"));
}

require("bluebird");
process.on("unhandledRejection", function (reason, promise) {
    Logger.errlog.log("[SEVERE] Unhandled rejection: " + reason.stack);
});
