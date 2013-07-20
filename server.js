var path = require("path");
var express = require("express");
var Config = require("./config");
var Logger = require("./logger");
var Channel = require("./channel");
var User = require("./user");

const VERSION = "2.1.0";

function getIP(req) {
    var raw = req.connection.remoteAddress;
    var forward = req.header("x-forwarded-for");
    if(Config.REVERSE_PROXY && forward) {
        var ip = forward.split(",")[0];
        Logger.syslog.log("REVPROXY " + raw + " => " + ip);
        return ip;
    }
    return raw;
}

function getSocketIP(socket) {
    var raw = socket.handshake.address.address;
    if(Config.REVERSE_PROXY) {
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
            if(this.channels[i].name.toLowerCase() == name.toLowerCase())
                return true;
        }
        return false;
    },
    getChannel: function (name) {
        for(var i in this.channels) {
            if(this.channels[i].name.toLowerCase() == name.toLowerCase())
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
        for(var i in this.channels) {
            if(this.channels[i].name.toLowerCase() == chan.name.toLowerCase()) {
                this.channels.splice(i, 1);
                break;
            }
        }
        //for(var i in chan)
        //    delete chan[i];
    },
    stats: null,
    app: null,
    io: null,
    httpserv: null,
    ioserv: null,
    db: null,
    ips: {},
    acp: null,
    init: function () {
        this.app = express();
        // channel path
        this.app.get("/r/:channel(*)", function (req, res, next) {
            var c = req.params.channel;
            if(!c.match(/^[\w-_]+$/))
                res.redirect("/" + c);
            else
                res.sendfile(__dirname + "/www/channel.html");
        });

        // api path
        this.api = require("./api")(this);
        this.app.get("/api/:apireq(*)", function (req, res, next) {
            this.api.handle(req.url.substring(5), req, res);
        }.bind(this));

        this.app.get("/", function (req, res, next) {
            res.sendfile(__dirname + "/www/index.html");
        });

        // default path
        this.app.get("/:thing(*)", function (req, res, next) {
            var root = __dirname + "/www/",
                answer = path.resolve (__dirname + "/www/", req.params.thing);
            if (answer.indexOf (root) != 0)
                res.send (404);
            else
                res.sendfile(__dirname + "/www/" + req.params.thing);
        });

        // fallback
        this.app.use(function (err, req, res, next) {
            if(err.status == 404) {
                res.send(404);
            } else {
                next(err);
            }
        });

        // bind servers
        this.httpserv = this.app.listen(Config.WEBSERVER_PORT);
        this.ioserv = express().listen(Config.IO_PORT);

        // init socket.io
        this.io = require("socket.io").listen(this.ioserv);
        this.io.set("log level", 1);
        this.io.sockets.on("connection", function (socket) {
            var ip = getSocketIP(socket);
            socket._ip = ip;
            if(this.db.checkGlobalBan(ip)) {
                Logger.syslog.log("Disconnecting " + ip + " - gbanned");
                socket.emit("kick", {
                    reason: "You're globally banned."
                });
                socket.disconnect(true);
                return;
            }

            socket.on("disconnect", function () {
                this.ips[ip]--;
            }.bind(this));

            if(!(ip in this.ips))
                this.ips[ip] = 0;
            this.ips[ip]++;

            if(this.ips[ip] > Config.MAX_PER_IP) {
                socket.emit("kick", {
                    reason: "Too many connections from your IP address"
                });
                socket.disconnect(true);
                return;
            }

            // finally a valid user
            Logger.syslog.log("Accepted socket from /" + socket._ip);
            new User(socket, this);
        }.bind(this));

        // init database
        this.db = require("./database");
        this.db.setup(Config);
        this.db.init();

        // init ACP
        this.acp = require("./acp")(this);

        // init stats
        this.stats = require("./stats")(this);
    },
    shutdown: function () {
        Logger.syslog.log("Unloading channels");
        for(var i in this.channels) {
            if(this.channels[i].registered)
                this.channels[i].saveDump();
        }
        Logger.syslog.log("Goodbye");
        process.exit(0);
    }
};

Logger.syslog.log("Starting CyTube v" + VERSION);
Server.init();

if(!Config.DEBUG) {
    process.on("uncaughtException", function (err) {
        Logger.errlog.log("[SEVERE] Uncaught Exception: " + err);
        Logger.errlog.log(err.stack);
    });

    process.on("exit", Server.shutdown);
    process.on("SIGINT", function () { process.exit(0); });
}
