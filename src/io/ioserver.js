var sio = require("socket.io");
var Logger = require("../logger");
var db = require("../database");
var User = require("../user");
var Server = require("../server");
var Config = require("../config");
var cookieParser = require("cookie-parser")(Config.get("http.cookie-secret"));
var $util = require("../utilities");
var Flags = require("../flags");
var typecheck = require("json-typecheck");
var net = require("net");
var util = require("../utilities");
var crypto = require("crypto");
var isTorExit = require("../tor").isTorExit;
var session = require("../session");
import counters from '../counters';
import { verifyIPSessionCookie } from '../web/middleware/ipsessioncookie';
import Promise from 'bluebird';
const verifySession = Promise.promisify(session.verifySession);
const getAliases = Promise.promisify(db.getAliases);

var CONNECT_RATE = {
    burst: 5,
    sustained: 0.1
};

var ipThrottle = {};
// Keep track of number of connections per IP
var ipCount = {};

function parseCookies(socket, accept) {
    var req = socket.request;
    if (req.headers.cookie) {
        cookieParser(req, null, () => {
            accept(null, true);
        });
    } else {
        req.cookies = {};
        req.signedCookies = {};
        accept(null, true);
    }
}

/**
 * Called before an incoming socket.io connection is accepted.
 */
function handleAuth(socket, accept) {
    socket.user = null;
    socket.aliases = [];

    const promises = [];
    const auth = socket.request.signedCookies.auth;
    if (auth) {
        promises.push(verifySession(auth).then(user => {
            socket.user = Object.assign({}, user);
        }).catch(error => {
            // Do nothing
        }));
    }

    promises.push(getAliases(socket._realip).then(aliases => {
        socket.aliases = aliases;
    }).catch(error => {
        // Do nothing
    }));

    Promise.all(promises).then(() => {
        accept(null, true);
    });
}

function handleIPSessionCookie(socket, accept) {
    var cookie = socket.request.signedCookies['ip-session'];
    if (!cookie) {
        socket.ipSessionFirstSeen = new Date();
        return accept(null, true);
    }

    var sessionMatch = verifyIPSessionCookie(socket._realip, cookie);
    if (sessionMatch) {
        socket.ipSessionFirstSeen = sessionMatch.date;
    } else {
        socket.ipSessionFirstSeen = new Date();
    }
    accept(null, true);
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
        sock.disconnect();
        return true;
    }

    return false;
}

function ipLimitReached(sock) {
    var ip = sock._realip;

    sock.on("disconnect", function () {
        counters.add("socket.io:disconnect", 1);
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

function ipForwardingMiddleware(webConfig) {
    function getForwardedIP(socket) {
        var req = socket.client.request;
        const xForwardedFor = req.headers['x-forwarded-for'];
        if (!xForwardedFor) {
            return socket.client.conn.remoteAddress;
        }

        const ipList = xForwardedFor.split(',');
        for (let i = 0; i < ipList.length; i++) {
            const ip = ipList[i].trim();
            if (net.isIP(ip)) {
                return ip;
            }
        }

        return socket.client.conn.remoteAddress;
    }

    function isTrustedProxy(ip) {
        return webConfig.getTrustedProxies().indexOf(ip) >= 0;
    }

    return function (socket, accept) {
        if (isTrustedProxy(socket.client.conn.remoteAddress)) {
            socket._realip = getForwardedIP(socket);
        } else {
            socket._realip = socket.client.conn.remoteAddress;
        }

        accept(null, true);
    }
}

/**
 * Called after a connection is accepted
 */
function handleConnection(sock) {
    var ip = sock._realip;
    if (!ip) {
        sock.emit("kick", {
            reason: "Your IP address could not be determined from the socket connection.  See https://github.com/Automattic/socket.io/issues/1737 for details"
        });
        return;
    }

    if (net.isIPv6(ip)) {
        ip = util.expandIPv6(ip);
        sock._realip = ip;
    }
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
    counters.add("socket.io:accept", 1);

    addTypecheckedFunctions(sock);

    var user = new User(sock);
    if (sock.user) {
        user.setFlag(Flags.U_REGISTERED);
        user.socket.emit("login", {
            success: true,
            name: user.getName(),
            guest: false
        });
        db.recordVisit(ip, user.getName());
        user.socket.emit("rank", user.account.effectiveRank);
        user.setFlag(Flags.U_LOGGED_IN);
        user.emit("login", user.account);
        Logger.syslog.log(ip + " logged in as " + user.getName());
        user.setFlag(Flags.U_READY);
    } else {
        user.socket.emit("rank", -1);
        user.setFlag(Flags.U_READY);
    }
}

module.exports = {
    init: function (srv, webConfig) {
        var bound = {};
        const ioOptions = {
            perMessageDeflate: Config.get("io.per-message-deflate")
        };
        var io = sio.instance = sio();

        io.use(ipForwardingMiddleware(webConfig));
        io.use(parseCookies);
        io.use(handleIPSessionCookie);
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
                io.attach(srv.servers[id], ioOptions);
            } else {
                var server = require("http").createServer().listen(bind.port, bind.ip);
                server.on("clientError", function (err, socket) {
                    try {
                        socket.destroy();
                    } catch (e) {
                    }
                });
                io.attach(server, ioOptions);
            }

            bound[id] = null;
        });
    },

    handleConnection: handleConnection
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
