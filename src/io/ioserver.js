var sio = require("socket.io");
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
import { CachingGlobalBanlist } from './globalban';
import proxyaddr from 'proxy-addr';
import { Counter, Gauge } from 'prom-client';
import Socket from 'socket.io/lib/socket';

const LOGGER = require('@calzoneman/jsli')('ioserver');

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
        LOGGER.warn("IP throttled: " + ip);
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

/* TODO: remove this crap */
function patchTypecheckedFunctions() {
    Socket.prototype.typecheckedOn = function typecheckedOn(msg, template, cb) {
        this.on(msg, (data, ack) => {
            typecheck(data, template, (err, data) => {
                if (err) {
                    this.emit("errorMsg", {
                        msg: "Unexpected error for message " + msg + ": " + err.message
                    });
                } else {
                    cb(data, ack);
                }
            });
        });
    };

    Socket.prototype.typecheckedOnce = function typecheckedOnce(msg, template, cb) {
        this.once(msg, data => {
            typecheck(data, template, (err, data) => {
                if (err) {
                    this.emit("errorMsg", {
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
    const trustFn = proxyaddr.compile(webConfig.getTrustedProxies());

    return function (socket, accept) {
        LOGGER.debug('ip = %s', socket.client.request.connection.remoteAddress);
        //socket.client.request.ip = socket.client.conn.remoteAddress;
        socket._realip = proxyaddr(socket.client.request, trustFn);
        LOGGER.debug('socket._realip: %s', socket._realip);
        accept(null, true);
    }
}

let globalIPBanlist = null;
function isIPGlobalBanned(ip) {
    if (globalIPBanlist === null) {
        globalIPBanlist = new CachingGlobalBanlist(db.getGlobalBanDB());
        globalIPBanlist.refreshCache();
        globalIPBanlist.startCacheTimer(60 * 1000);
    }

    return globalIPBanlist.isIPGlobalBanned(ip);
}

const promSocketCount = new Gauge({
    name: 'cytube_sockets_num_connected',
    help: 'Gauge of connected socket.io clients',
    labelNames: ['transport']
});
const promSocketAccept = new Counter({
    name: 'cytube_sockets_accept_count',
    help: 'Counter for number of connections accepted.  Excludes rejected connections.'
});
const promSocketDisconnect = new Counter({
    name: 'cytube_sockets_disconnect_count',
    help: 'Counter for number of connections disconnected.'
});
function emitMetrics(sock) {
    try {
        let transportName = sock.client.conn.transport.name;
        promSocketCount.inc({ transport: transportName });
        promSocketAccept.inc(1, new Date());

        sock.client.conn.on('upgrade', newTransport => {
            try {
                // Sanity check
                if (newTransport !== transportName) {
                    promSocketCount.dec({ transport: transportName });
                    transportName = newTransport.name;
                    promSocketCount.inc({ transport: transportName });
                }
            } catch (error) {
                LOGGER.error('Error emitting transport upgrade metrics for socket (ip=%s): %s',
                        sock._realip, error.stack);
            }
        });

        sock.on('disconnect', () => {
            try {
                promSocketCount.dec({ transport: transportName });
                promSocketDisconnect.inc(1, new Date());
            } catch (error) {
                LOGGER.error('Error emitting disconnect metrics for socket (ip=%s): %s',
                        sock._realip, error.stack);
            }
        });
    } catch (error) {
        LOGGER.error('Error emitting metrics for socket (ip=%s): %s',
                sock._realip, error.stack);
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

    if (isTorExit(ip)) {
        sock._isUsingTor = true;
    }

    var srv = Server.getServer();

    if (throttleIP(sock)) {
        return;
    }

    // Check for global ban on the IP
    if (isIPGlobalBanned(ip)) {
        LOGGER.info("Rejecting " + ip + " - global banned");
        sock.emit("kick", { reason: "Your IP is globally banned." });
        sock.disconnect();
        return;
    }

    if (ipLimitReached(sock)) {
        return;
    }

    emitMetrics(sock);

    LOGGER.info("Accepted socket from " + ip);
    counters.add("socket.io:accept", 1);

    const user = new User(sock, ip, sock.user);
    if (sock.user) {
        db.recordVisit(ip, user.getName());
    }

    const announcement = srv.announcement;
    if (announcement != null) {
        sock.emit("announcement", announcement);
    }

}

module.exports = {
    init: function (srv, webConfig) {
        patchTypecheckedFunctions();
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
                LOGGER.warn("Ignoring duplicate listen address " + id);
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
