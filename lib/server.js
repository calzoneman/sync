/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const VERSION = "2.4.4";
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
var Channel = require("./channel");
var User = require("./user");
var $util = require("./utilities");

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
    self.ipCount = {};
    self.ipThrottle = {};
    self.db = null;
    self.api = null;
    self.announcement = null;
    self.httplog = null;
    self.actionlog = null;
    self.infogetter = null;

    // database init ------------------------------------------------------
    var Database = require("./database");
    self.db = new Database(self.cfg);

    // webserver init -----------------------------------------------------
    self.httplog = new Logger.Logger(path.join(__dirname,
                                               "../httpaccess.log"));
    self.express = express();
    self.express.use(express.bodyParser());

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
                    self.actionlog.record(self.getHTTPIP(req), "",
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
        self.ioSecure = require("socket.io").listen(self.https);
        self.ioSecure.set("log level", 1);
        self.ioSecure.on("connection", function (sock) {
            self.handleSocketConnection(sock);
        });
    }

    self.http = self.express.listen(self.cfg["web-port"],
                                    self.cfg["express-host"]);
    self.ioWeb = express().listen(self.cfg["io-port"], self.cfg["io-host"]);
    self.io = require("socket.io").listen(self.ioWeb);
    self.io.set("log level", 1);
    self.io.sockets.on("connection", function (sock) {
        self.handleSocketConnection(sock);
    });

    // background tasks init ----------------------------------------------
    require("./bgtask")(self);
};

Server.prototype.getHTTPIP = function (req) {
    var raw = req.connection.remoteAddress;
    var forward = req.header("x-forwarded-for");
    if((this.cfg["trust-x-forward"] || raw === "127.0.0.1") && forward) {
        var ip = forward.split(",")[0];
        Logger.syslog.log("REVPROXY " + raw + " => " + ip);
        return ip;
    }
    return raw;
};

Server.prototype.getSocketIP = function (socket) {
    var raw = socket.handshake.address.address;
    if(this.cfg["trust-x-forward"] || raw === "127.0.0.1") {
        if(typeof socket.handshake.headers["x-forwarded-for"] == "string") {
            var ip = socket.handshake.headers["x-forwarded-for"]
                .split(",")[0];
            Logger.syslog.log("REVPROXY " + raw + " => " + ip);
            return ip;
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
        if (this.channels[i].canonical_name == name)
            return this.channels[i];
    }

    var c = new Channel(name);
    this.channels.push(c);
    return c;
};

Server.prototype.unloadChannel = function (chan) {
    if (chan.registered)
        chan.saveDump();

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

Server.prototype.logHTTP = function (req, status) {
    if (status === undefined)
        status = 200;

    var ip = req.connection.remoteAddress;
    var ip2 = req.header("x-forwarded-for") ||
              req.header("cf-connecting-ip");
    var ipstr = !ip2 ? ip : ip + " (X-Forwarded-For " + ip2 + ")";
    var url = req.url;
    // Remove query
    if(url.indexOf("?") != -1)
        url = url.substring(0, url.lastIndexOf("?"));
    this.httplog.log([
        ipstr,
        req.method,
        url,
        status,
        req.header("user-agent")
    ].join(" "));
};

const IP_THROTTLE = {
    burst: 5,
    sustained: 0.1
};

Server.prototype.handleSocketConnection = function (socket) {
    var self = this;
    var ip = self.getSocketIP(socket);
    socket._ip = ip;

    if (!(ip in self.ipThrottle)) {
        self.ipThrottle[ip] = $util.newRateLimiter();
    }

    if (self.ipThrottle[ip].throttle(IP_THROTTLE)) {
        Logger.syslog.log("WARN: IP throttled: " + ip);
        socket.emit("kick", {
            reason: "Your IP address is connecting too quickly.  Please "+
                    "wait 10 seconds before joining again."
        });
        return;
    }

    // Check for global ban on the IP
    self.db.isGlobalIPBanned(ip, function (err, banned) {
        if (banned) {
            Logger.syslog.log("Disconnecting " + ip + " - global banned");
            socket.emit("kick", { reason: "Your IP is globally banned." });
            socket.disconnect(true);
        }
    });

    socket.on("disconnect", function () {
        self.ipCount[ip]--;
    });

    if (!(ip in self.ipCount))
        self.ipCount[ip] = 0;

    self.ipCount[ip]++;
    if (self.ipCount[ip] > self.cfg["ip-connection-limit"]) {
        socket.emit("kick", {
            reason: "Too many connections from your IP address"
        });
        socket.disconnect(true);
        return;
    }

    Logger.syslog.log("Accepted socket from " + ip);
    new User(socket);
};

Server.prototype.shutdown = function () {
    Logger.syslog.log("Unloading channels");
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].registered) {
            Logger.syslog.log("Saving /r/" + this.channels[i].name);
            this.channels[i].saveDump();
        }
    }
    Logger.syslog.log("Goodbye");
    process.exit(0);
};

