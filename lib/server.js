const VERSION = "3.7.1";
var singleton = null;
var Config = require("./config");

module.exports = {
    init: function () {
        Logger.syslog.log("Starting CyTube v" + VERSION);
        var chanlogpath = path.join(__dirname, "../chanlogs");
        fs.exists(chanlogpath, function (exists) {
            exists || fs.mkdir(chanlogpath);
        });

        var chandumppath = path.join(__dirname, "../chandump");
        fs.exists(chandumppath, function (exists) {
            exists || fs.mkdir(chandumppath);
        });
        singleton = new Server();
        return singleton;
    },

    getServer: function () {
        return singleton;
    }
};

var path = require("path");
var fs = require("fs");
var http = require("http");
var https = require("https");
var express = require("express");
var Logger = require("./logger");
var Channel = require("./channel/channel");
var User = require("./user");
var $util = require("./utilities");
var db = require("./database");
var Flags = require("./flags");
var sio = require("socket.io");

var Server = function () {
    var self = this;
    self.channels = [],
    self.express = null;
    self.db = null;
    self.api = null;
    self.announcement = null;
    self.infogetter = null;
    self.servers = {};

    // database init ------------------------------------------------------
    var Database = require("./database");
    self.db = Database;
    self.db.init();

    // webserver init -----------------------------------------------------
    self.express = express();
    require("./web/webserver").init(self.express);

    // http/https/sio server init -----------------------------------------
    var key = "", cert = "", ca = undefined;
    if (Config.get("https.enabled")) {
        key = fs.readFileSync(path.resolve(__dirname, "..",
                                               Config.get("https.keyfile")));
        cert = fs.readFileSync(path.resolve(__dirname, "..",
                                                Config.get("https.certfile")));
        if (Config.get("https.cafile")) {
            ca = fs.readFileSync(path.resolve(__dirname, "..",
                                              Config.get("https.cafile")));
        }
    }

    var opts = {
        key: key,
        cert: cert,
        passphrase: Config.get("https.passphrase"),
        ca: ca,
        ciphers: Config.get("https.ciphers"),
        honorCipherOrder: true
    };

    Config.get("listen").forEach(function (bind) {
        var id = bind.ip + ":" + bind.port;
        if (id in self.servers) {
            Logger.syslog.log("[WARN] Ignoring duplicate listen address " + id);
            return;
        }

        if (bind.https && Config.get("https.enabled")) {
            self.servers[id] = https.createServer(opts, self.express)
                                    .listen(bind.port, bind.ip);
            self.servers[id].on("clientError", function (err, socket) {
                console.error("clientError on " + id + " - " + err);
                try {
                    socket.destroy();
                } catch (e) {
                }
            });
        } else if (bind.http) {
            self.servers[id] = self.express.listen(bind.port, bind.ip);
            self.servers[id].on("clientError", function (err, socket) {
                console.error("clientError on " + id + " - " + err);
                try {
                    socket.destroy();
                } catch (e) {
                }
            });
        }
    });

    require("./io/ioserver").init(self);

    // background tasks init ----------------------------------------------
    require("./bgtask")(self);

    // setuid
    require("./setuid");
};

Server.prototype.getHTTPIP = function (req) {
    var ip = req.ip;
    if (ip === "127.0.0.1" || ip === "::1") {
        var fwd = req.header("x-forwarded-for");
        if (fwd && typeof fwd === "string") {
            return fwd;
        }
    }
    return ip;
};

Server.prototype.getSocketIP = function (socket) {
    var raw = socket.handshake.address.address;
    if (raw === "127.0.0.1" || raw === "::1") {
        var fwd = socket.handshake.headers["x-forwarded-for"];
        if (fwd && typeof fwd === "string") {
            return fwd;
        }
    }
    return raw;
};

Server.prototype.isChannelLoaded = function (name) {
    name = name.toLowerCase();
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].uniqueName == name)
            return true;
    }
    return false;
};

Server.prototype.getChannel = function (name) {
    var self = this;
    var cname = name.toLowerCase();
    for (var i = 0; i < self.channels.length; i++) {
        if (self.channels[i].uniqueName === cname)
            return self.channels[i];
    }

    var c = new Channel(name);
    c.on("empty", function () {
        self.unloadChannel(c);
    });
    self.channels.push(c);
    return c;
};

Server.prototype.unloadChannel = function (chan) {
    if (chan.dead) {
        return;
    }

    chan.saveState();

    chan.logger.log("[init] Channel shutting down");
    chan.logger.close();

    chan.notifyModules("unload", []);
    Object.keys(chan.modules).forEach(function (k) {
        chan.modules[k].dead = true;
    });

    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].uniqueName === chan.uniqueName) {
            this.channels.splice(i, 1);
            i--;
        }
    }

    Logger.syslog.log("Unloaded channel " + chan.name);
    // Empty all outward references from the channel
    var keys = Object.keys(chan);
    for (var i in keys) {
        delete chan[keys[i]];
    }
    chan.dead = true;
};

Server.prototype.packChannelList = function (publicOnly, isAdmin) {
    var channels = this.channels.filter(function (c) {
        if (!publicOnly) {
            return true;
        }

        return c.modules.options && c.modules.options.get("show_public");
    });

    var self = this;
    return channels.map(function (c) {
        return c.packInfo(isAdmin);
    });
};

Server.prototype.announce = function (data) {
    if (data == null) {
        this.announcement = null;
        db.clearAnnouncement();
    } else {
        this.announcement = data;
        db.setAnnouncement(data);
        sio.instance.emit("announcement", data);
    }
};

Server.prototype.shutdown = function () {
    Logger.syslog.log("Unloading channels");
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].is(Flags.C_REGISTERED)) {
            Logger.syslog.log("Saving /r/" + this.channels[i].name);
            this.channels[i].saveState();
        }
    }
    Logger.syslog.log("Goodbye");
    process.exit(0);
};

