/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const VERSION = "2.4.5";
var singleton = null;

module.exports = {
    init: function (cfg) {
        Logger.syslog.log("Starting CyTube v" + VERSION);
        var chanlogpath = path.join(__dirname, "../chanlogs");
        fs.exists(chanlogpath, function (exists) {
            exists || fs.mkdir(chanlogpath);
        });

        var chandumppath = path.join(__dirname, "../chandump");
        fs.exists(chandumppath, function (exists) {
            exists || fs.mkdir(chandumppath);
        });
        singleton = new Server(cfg);
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
var Config = require("./config");
var Logger = require("./logger");
var Channel = require("./channel-new");
var User = require("./user");
var $util = require("./utilities");
var ActionLog = require("./actionlog");

var Server = function (cfg) {
    var self = this;

    self.cfg = cfg;
    self.channels = [],
    self.express = null;
    self.http = null;
    self.https = null;
    self.io = null;
    self.ioWeb = null;
    self.ioSecure = null;
    self.db = null;
    self.api = null;
    self.announcement = null;
    self.httplog = null;
    self.infogetter = null;
    self.torblocker = null;

    // database init ------------------------------------------------------
    var Database = require("./database");
    self.db = Database;
    self.db.init(self.cfg);

    // webserver init -----------------------------------------------------
    self.httplog = new Logger.Logger(path.join(__dirname,
                                               "../httpaccess.log"));
    self.express = express();
    require("./web/webserver").init(self.express);
    self.express.get("/old/:channel(*)", function (req, res, next) {
        var c = req.params.channel;
        if (!$util.isValidChannelName(c)) {
            res.redirect("/" + c);
            return;
        }

        self.logHTTP(req);
        res.sendfile("channel.html", {
            root: path.join(__dirname, "../www")
        });
    });
    /*
    self.express.use(express.urlencoded());
    self.express.use(express.json());
    self.express.use(express.cookieParser());

    // channel route
    self.express.get("/r/:channel(*)", function (req, res, next) {
        var c = req.params.channel;
        if (!$util.isValidChannelName(c)) {
            res.redirect("/" + c);
            return;
        }

        self.logHTTP(req);
        res.sendfile("channel.html", {
            root: path.join(__dirname, "../www")
        });
    });

    // api route
    self.api = require("./api")(self);

    // index
    self.express.get("/", function (req, res, next) {
        self.logHTTP(req);
        res.sendfile("index.html", {
            root: path.join(__dirname, "../www")
        });
    });

    // default route
    self.express.get("/:thing(*)", function (req, res, next) {
        var opts = {
            root: path.join(__dirname, "../www"),
            maxAge: self.cfg["asset-cache-ttl"]
        };

        res.sendfile(req.params.thing, opts, function (e) {
            if (e) {
                self.logHTTP(req, e.status);
                if (req.params.thing.match(/\.\.|(%25)?%2e(%25)?%2e/)) {
                    res.send("Don't try that again.");
                    Logger.syslog.log("WARNING: Attempted path traversal "+
                                      "from IP " + self.getHTTPIP(req));
                    Logger.syslog.log("Path was: " + req.url);
                    ActionLog.record(self.getHTTPIP(req), "",
                                          "path-traversal",
                                          req.url);
                } else if (e.status >= 500) {
                    Logger.errlog.log(err);
                }
                res.send(e.status);
            } else {
                self.logHTTP(req);
            }
        });
    });

    // fallback route
    self.express.use(function (err, req, res, next) {
        self.logHTTP(req, err.status);
        if (err.status === 404) {
            res.send(404);
        } else {
            next(err);
        }
    });
    */

    // http/https/sio server init -----------------------------------------
    if (self.cfg["enable-ssl"]) {
        var key = fs.readFileSync(path.resolve(__dirname, "..",
                                               self.cfg["ssl-keyfile"]));
        var cert = fs.readFileSync(path.resolve(__dirname, "..",
                                                self.cfg["ssl-certfile"]));
        var opts = {
            key: key,
            cert: cert,
            passphrase: self.cfg["ssl-passphrase"]
        };

        self.https = https.createServer(opts, self.express)
                          .listen(self.cfg["ssl-port"]);
    }

    self.http = self.express.listen(self.cfg["web-port"],
                                    self.cfg["express-host"]);
    /*
    self.ioWeb = express().listen(self.cfg["io-port"], self.cfg["io-host"]);
    self.io = require("socket.io").listen(self.ioWeb);
    self.io.set("log level", 1);
    self.io.sockets.on("connection", function (sock) {
        self.handleSocketConnection(sock);
    });
    */
    require("./io/ioserver").init(self);

    // background tasks init ----------------------------------------------
    require("./bgtask")(self);

    // tor blocker init ---------------------------------------------------
    if (self.cfg["tor-blocker"]) {
        self.torblocker = require("./torblocker")();
    }
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
        if (this.channels[i].canonical_name == name)
            return true;
    }
    return false;
};

Server.prototype.getChannel = function (name) {
    var cname = name.toLowerCase();
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].uniqueName === cname)
            return this.channels[i];
    }

    var c = new Channel(name);
    this.channels.push(c);
    return c;
};

Server.prototype.unloadChannel = function (chan) {
    if (chan.registered)
        chan.saveState();

    chan.playlist.die();
    chan.logger.close();
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].canonical_name === chan.canonical_name) {
            this.channels.splice(i, 1);
            i--;
        }
    }

    // Empty all outward references from the channel
    var keys = Object.keys(chan);
    for (var i in keys) {
        delete chan[keys[i]];
    }
    chan.dead = true;
};

Server.prototype.packChannelList = function (publicOnly) {
    var channels = this.channels.filter(function (c) {
        if (!publicOnly) {
            return true;
        }

        return c.opts.show_public && !c.opts.password;
    });

    return channels.map(this.packChannel.bind(this));
};

Server.prototype.packChannel = function (c) {
    var data = {
        name: c.name,
        pagetitle: c.opts.pagetitle,
        mediatitle: c.playlist.current ? c.playlist.current.media.title : "-",
        usercount: c.users.length,
        voteskip_eligible: c.calcVoteskipMax(),
        users: [],
        chat: Array.prototype.slice.call(c.chatbuffer)
    };

    for (var i = 0; i < c.users.length; i++) {
        if (c.users[i].name !== "") {
            var name = c.users[i].name;
            var rank = c.users[i].rank;
            if (rank >= 255) {
                name = "!" + name;
            } else if (rank >= 4) {
                name = "~" + name;
            } else if (rank >= 3) {
                name = "&" + name;
            } else if (rank >= 2) {
                name = "@" + name;
            }
            data.users.push(name);
        }
    }

    return data;
};

Server.prototype.logHTTP = function (req, status) {
    if (status === undefined)
        status = 200;

    var ip = this.getHTTPIP(req);
    var url = req.url;
    // Remove query
    if(url.indexOf("?") != -1)
        url = url.substring(0, url.lastIndexOf("?"));
    this.httplog.log([
        ip,
        req.method,
        url,
        status,
        req.header("user-agent")
    ].join(" "));
};

Server.prototype.shutdown = function () {
    Logger.syslog.log("Unloading channels");
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].registered) {
            Logger.syslog.log("Saving /r/" + this.channels[i].name);
            this.channels[i].saveState();
        }
    }
    Logger.syslog.log("Goodbye");
    process.exit(0);
};

