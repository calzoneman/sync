var path = require("path");
var fs = require("fs");
var http = require("http");
var https = require("https");
var express = require("express");
var Config = require("./config");
var Logger = require("./logger");
var Channel = require("./channel");
var User = require("./user");

const VERSION = "2.4.2";

function getIP(req) {
    var raw = req.connection.remoteAddress;
    var forward = req.header("x-forwarded-for");
    if(Server.cfg["trust-x-forward"] && forward) {
        var ip = forward.split(",")[0];
        Logger.syslog.log("REVPROXY " + raw + " => " + ip);
        return ip;
    }
    return raw;
}

function getSocketIP(socket) {
    var raw = socket.handshake.address.address;
    if(Server.cfg["trust-x-forward"]) {
        if(typeof socket.handshake.headers["x-forwarded-for"] == "string") {
            var ip = socket.handshake.headers["x-forwarded-for"]
                .split(",")[0];
            Logger.syslog.log("REVPROXY " + raw + " => " + ip);
            return ip;
        }
    }
    return raw;
}

var Server = {
    channels: [],
    channelLoaded: function (name) {
        for(var i in this.channels) {
            if(this.channels[i].canonical_name == name.toLowerCase())
                return true;
        }
        return false;
    },
    getChannel: function (name) {
        for(var i in this.channels) {
            if(this.channels[i].canonical_name == name.toLowerCase())
                return this.channels[i];
        }

        var c = new Channel(name, this);
        this.channels.push(c);
        return c;
    },
    unloadChannel: function(chan) {
        if(chan.registered)
            chan.saveDump();
        chan.playlist.die();
        chan.logger.close();
        for(var i in this.channels) {
            if(this.channels[i].canonical_name == chan.canonical_name) {
                this.channels.splice(i, 1);
                break;
            }
        }
        var keys = Object.keys(chan);
        for (var i in keys) {
            delete chan[keys[i]];
        }
        chan.dead = true;
    },
    stats: null,
    app: null,
    io: null,
    httpserv: null,
    sslserv: null,
    sslio: null,
    ioserv: null,
    db: null,
    ips: {},
    acp: null,
    httpaccess: null,
    actionlog: null,
    logHTTP: function (req, status) {
        if(status === undefined)
            status = 200;
        var ip = req.connection.remoteAddress;
        var ip2 = false;
        if(this.cfg["trust-x-forward"])
            ip2 = req.header("x-forwarded-for") || req.header("cf-connecting-ip");
        var ipstr = !ip2 ? ip : ip + " (X-Forwarded-For " + ip2 + ")";
        var url = req.url;
        // Remove query
        if(url.indexOf("?") != -1)
            url = url.substring(0, url.lastIndexOf("?"));
        this.httpaccess.log([ipstr, req.method, url, status, req.headers["user-agent"]].join(" "));
    },
    handleIOConnection: function (socket) {
        var self = this;
        self.stats.record("socketio", "socket");
        var ip = getSocketIP(socket);
        socket._ip = ip;
        self.db.isGlobalIPBanned(ip, function (err, bant) {
            if(bant) {
                Logger.syslog.log("Disconnecting " + ip + " - gbanned");
                socket.emit("kick", {
                    reason: "You're globally banned."
                });
                socket.disconnect(true);
            }
        });

        socket.on("disconnect", function () {
            self.ips[ip]--;
        }.bind(self));

        if(!(ip in self.ips))
            self.ips[ip] = 0;
        self.ips[ip]++;

        if(self.ips[ip] > Server.cfg["ip-connection-limit"]) {
            socket.emit("kick", {
                reason: "Too many connections from your IP address"
            });
            socket.disconnect(true);
            return;
        }

        // finally a valid user
        Logger.syslog.log("Accepted socket from /" + socket._ip);
        new User(socket, self);
    },
    init: function () {
        var self = this;
        // init database
        var Database = require("./database");
        this.db = new Database(self.cfg);
        this.db.init();
        this.actionlog = require("./actionlog")(self);
        this.httpaccess = new Logger.Logger(path.join(__dirname, 
                                            "../httpaccess.log"));
        this.app = express();
        this.app.use(express.bodyParser());
        // channel path
        self.app.get("/r/:channel(*)", function (req, res, next) {
            var c = req.params.channel;
            if(!c.match(/^[\w-_]+$/)) {
                res.redirect("/" + c);
            }
            else {
                self.stats.record("http", "/r/" + c);
                self.logHTTP(req);
                res.sendfile("channel.html", {
                    root: path.join(__dirname, "../www")
                });
            }
        });

        // api path
        self.api = require("./api")(self);

        self.app.get("/", function (req, res, next) {
            self.logHTTP(req);
            self.stats.record("http", "/");
            res.sendfile("index.html", {
                root: path.join(__dirname, "../www")
            });
        });

        // default path
        self.app.get("/:thing(*)", function (req, res, next) {
            var opts = {
                root: path.join(__dirname, "../www"),
                maxAge: self.cfg["asset-cache-ttl"]
            }
            res.sendfile(req.params.thing, opts, function (err) {
                if(err) {
                    self.logHTTP(req, err.status);
                    // Damn path traversal attacks
                    if(req.params.thing.indexOf("%2e") != -1) {
                        res.send("Don't try that again, I'll ban you");
                        Logger.syslog.log("WARNING: Attempted path "+
                                          "traversal from /" + getIP(req));
                        Logger.syslog.log("URL: " + req.url);
                    }
                    // Something actually went wrong
                    else {
                        // Status codes over 500 are server errors
                        if(err.status >= 500)
                            Logger.errlog.log(err);
                        res.send(err.status);
                    }
                }
                else {
                    self.stats.record("http", req.params.thing);
                    self.logHTTP(req);
                }
            });
        });

        // fallback
        self.app.use(function (err, req, res, next) {
            self.logHTTP(req, err.status);
            if(err.status == 404) {
                res.send(404);
            } else {
                next(err);
            }
        });

        // bind servers
        if (self.cfg["enable-ssl"]) {
            var key = fs.readFileSync(path.resolve(__dirname, "..",
                                                   self.cfg["ssl-keyfile"]));
            var cert = fs.readFileSync(path.resolve(__dirname, "..",
                                                   self.cfg["ssl-certfile"]));

            var options = {
                key: key,
                cert: cert
            };

            self.sslserv = https.createServer(options, self.app)
                                .listen(self.cfg["ssl-port"]);
            self.sslio = require("socket.io").listen(self.sslserv);
            self.sslio.set("log level", 1);
            self.sslio.sockets.on("connection", function (socket) {
                self.handleIOConnection(socket);
            });
        }
        self.httpserv = self.app.listen(Server.cfg["web-port"],
                                        Server.cfg["express-host"]);
        self.ioserv = express().listen(Server.cfg["io-port"],
                                       Server.cfg["io-host"]);

        // init socket.io
        self.io = require("socket.io").listen(self.ioserv);
        self.io.set("log level", 1);
        self.io.sockets.on("connection", function (socket) {
            self.handleIOConnection(socket);
        });


        // init ACP
        self.acp = require("./acp")(self);

        // init stats
        self.stats = require("./stats")(self);

        // init media retriever
        self.infogetter = require("./get-info")(self);
    },
    shutdown: function () {
        Logger.syslog.log("Unloading channels");
        for(var i in this.channels) {
            if(this.channels[i].registered) {
                Logger.syslog.log("Saving /r/" + this.channels[i].name);
                this.channels[i].saveDump();
            }
        }
        Logger.syslog.log("Goodbye");
        process.exit(0);
    }
};

Logger.syslog.log("Starting CyTube v" + VERSION);

var chanlogpath = path.join(__dirname, "../chanlogs");
fs.exists(chanlogpath, function (exists) {
    exists || fs.mkdir(chanlogpath);
});

var chandumppath = path.join(__dirname, "../chandump");
fs.exists(chandumppath, function (exists) {
    exists || fs.mkdir(chandumppath);
});

Config.load(Server, path.join(__dirname, "../cfg.json"), function () {
    Server.init();
    if(!Server.cfg["debug"]) {
        process.on("uncaughtException", function (err) {
            Logger.errlog.log("[SEVERE] Uncaught Exception: " + err);
            Logger.errlog.log(err.stack);
        });

        process.on("SIGINT", function () {
            Server.shutdown();
        });
    }
});
