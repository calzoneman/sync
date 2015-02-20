var sio = require("socket.io");
var Logger = require("../logger");
var db = require("../database");
var User = require("../user");
var Server = require("../server");
var Config = require("../config");
var cookieParser = require("cookie-parser")(Config.get("http.cookie-secret"));
var $util = require("../utilities");
var Flags = require("../flags");
var Account = require("../account");
var typecheck = require("json-typecheck");
var net = require("net");
var util = require("../utilities");
var crypto = require("crypto");
var isTorExit = require("../tor").isTorExit;
var session = require("../session");

var CONNECT_RATE = {
    burst: 5,
    sustained: 0.1
};

var ipThrottle = {};
// Keep track of number of connections per IP
var ipCount = {};

/**
 * Called before an incoming socket.io connection is accepted.
 */
function handleAuth(socket, accept) {
    var data = socket.request;

    socket.user = false;
    if (data.headers.cookie) {
        cookieParser(data, null, function () {
            var auth = data.signedCookies.auth;
            if (!auth) {
                return accept(null, true);
            }

            session.verifySession(auth, function (err, user) {
                if (!err) {
                    socket.user = {
                        name: user.name,
                        global_rank: user.global_rank
                    };
                }
                accept(null, true);
            });
        });
    } else {
        accept(null, true);
    }
}

function throttleIP(sock) {
    var ip = sock._realip;

    if (!(ip in ipThrottle)) {
        ipThrottle[ip] = $util.newRateLimiter();
    }

    if (ipThrottle[ip].throttle(CONNECT_RATE)) {
        Logger.syslog.log("WARN: IP throttled: " + ip);
        sock.emit("kick", {
            reason: "Your IP address is connecting too quickly.  Please "+
                    "wait 10 seconds before joining again."
        });
        return true;
    }

    return false;
}

function ipLimitReached(sock) {
    var ip = sock._realip;

    sock.on("disconnect", function () {
        ipCount[ip]--;
        if (ipCount[ip] === 0) {
            /* Clear out unnecessary counters to save memory */
            delete ipCount[ip];
        }
    });

    if (!(ip in ipCount)) {
        ipCount[ip] = 0;
    }

    ipCount[ip]++;
    if (ipCount[ip] > Config.get("io.ip-connection-limit")) {
        sock.emit("kick", {
            reason: "Too many connections from your IP address"
        });
        sock.disconnect();
        return;
    }
}

function addTypecheckedFunctions(sock) {
    sock.typecheckedOn = function (msg, template, cb) {
        sock.on(msg, function (data) {
            typecheck(data, template, function (err, data) {
                if (err) {
                    sock.emit("errorMsg", {
                        msg: "Unexpected error for message " + msg + ": " + err.message
                    });
                } else {
                    cb(data);
                }
            });
        });
    };

    sock.typecheckedOnce = function (msg, template, cb) {
        sock.once(msg, function (data) {
            typecheck(data, template, function (err, data) {
                if (err) {
                    sock.emit("errorMsg", {
                        msg: "Unexpected error for message " + msg + ": " + err.message
                    });
                } else {
                    cb(data);
                }
            });
        });
    };
}

/**
 * Called after a connection is accepted
 */
function handleConnection(sock) {
    var ip = sock.client.conn.remoteAddress;
    if (!ip) {
        sock.emit("kick", {
            reason: "Your IP address could not be determined from the socket connection.  See https://github.com/Automattic/socket.io/issues/1737 for details"
        });
        return;
    }

    if (net.isIPv6(ip)) {
        ip = util.expandIPv6(ip);
    }
    sock._realip = ip;
    sock._displayip = $util.cloakIP(ip);

    if (isTorExit(ip)) {
        sock._isUsingTor = true;
    }

    var srv = Server.getServer();

    if (throttleIP(sock)) {
        return;
    }

    // Check for global ban on the IP
    if (db.isGlobalIPBanned(ip)) {
        Logger.syslog.log("Rejecting " + ip + " - global banned");
        sock.emit("kick", { reason: "Your IP is globally banned." });
        sock.disconnect();
        return;
    }

    if (ipLimitReached(sock)) {
        return;
    }

    Logger.syslog.log("Accepted socket from " + ip);

    addTypecheckedFunctions(sock);

    var user = new User(sock);
    if (sock.user) {
        user.setFlag(Flags.U_REGISTERED);
        user.clearFlag(Flags.U_READY);
        user.refreshAccount({ name: sock.user.name },
                            function (err, account) {
            if (err) {
                user.clearFlag(Flags.U_REGISTERED);
                user.setFlag(Flags.U_READY);
                return;
            }

            user.socket.emit("login", {
                success: true,
                name: user.getName(),
                guest: false
            });
            db.recordVisit(ip, user.getName());
            user.socket.emit("rank", user.account.effectiveRank);
            user.setFlag(Flags.U_LOGGED_IN);
            user.emit("login", account);
            Logger.syslog.log(ip + " logged in as " + user.getName());
            user.setFlag(Flags.U_READY);
        });
    } else {
        user.socket.emit("rank", -1);
        user.setFlag(Flags.U_READY);
    }
}

module.exports = {
    init: function (srv) {
        var bound = {};
        var io = sio.instance = sio();

        io.use(handleAuth);
        io.on("connection", handleConnection);

        Config.get("listen").forEach(function (bind) {
            if (!bind.io) {
                return;
            }
            var id = bind.ip + ":" + bind.port;
            if (id in bound) {
                Logger.syslog.log("[WARN] Ignoring duplicate listen address " + id);
                return;
            }

            if (id in srv.servers) {
                io.attach(srv.servers[id]);
            } else {
                var server = require("http").createServer().listen(bind.port, bind.ip);
                server.on("clientError", function (err, socket) {
                    console.error("clientError on " + id + " - " + err);
                    try {
                        socket.destroy();
                    } catch (e) {
                    }
                });
                io.attach(server);
            }

            bound[id] = null;
        });
    }
};

/* Clean out old rate limiters */
setInterval(function () {
    for (var ip in ipThrottle) {
        if (ipThrottle[ip].lastTime < Date.now() - 60 * 1000) {
            var obj = ipThrottle[ip];
            /* Not strictly necessary, but seems to help the GC out a bit */
            for (var key in obj) {
                delete obj[key];
            }
            delete ipThrottle[ip];
        }
    }

    if (Config.get("aggressive-gc") && global && global.gc) {
        global.gc();
    }
}, 5 * 60 * 1000);
