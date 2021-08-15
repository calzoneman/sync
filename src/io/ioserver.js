import sio from 'socket.io';
import db from '../database';
import User from '../user';
import Server from '../server';
import Config from '../config';
const cookieParser = require("cookie-parser")(Config.get("http.cookie-secret"));
import typecheck from 'json-typecheck';
import { isTorExit } from '../tor';
import session from '../session';
import { verifyIPSessionCookie } from '../web/middleware/ipsessioncookie';
import Promise from 'bluebird';
const verifySession = Promise.promisify(session.verifySession);
const getAliases = Promise.promisify(db.getAliases);
import { CachingGlobalBanlist } from './globalban';
import proxyaddr from 'proxy-addr';
import { Counter, Gauge } from 'prom-client';
import { TokenBucket } from '../util/token-bucket';
import http from 'http';

const LOGGER = require('@calzoneman/jsli')('ioserver');

const rateLimitExceeded = new Counter({
    name: 'cytube_socketio_rate_limited_total',
    help: 'Number of socket.io connections rejected due to exceeding rate limit'
});
const connLimitExceeded = new Counter({
    name: 'cytube_socketio_conn_limited_total',
    help: 'Number of socket.io connections rejected due to exceeding conn limit'
});
const authFailureCount = new Counter({
    name: 'cytube_socketio_auth_error_total',
    help: 'Number of failed authentications from session middleware'
});

class IOServer {
    constructor(options = {
        proxyTrustFn: proxyaddr.compile('127.0.0.1')
    }) {
        ({
            proxyTrustFn: this.proxyTrustFn
        } = options);

        this.ipThrottle = new Map();
        this.ipCount = new Map();
    }

    // Map proxied sockets to the real IP address via X-Forwarded-For
    // If the resulting address is a known Tor exit, flag it as such
    ipProxyMiddleware(socket, next) {
        if (!socket.context) socket.context = {};

        try {
            socket.handshake.connection = {
                remoteAddress: socket.handshake.address
            };

            socket.context.ipAddress = proxyaddr(
                socket.handshake,
                this.proxyTrustFn
            );

            if (!socket.context.ipAddress) {
                throw new Error(
                    `Assertion failed: unexpected IP ${socket.context.ipAddress}`
                );
            }
        } catch (error) {
            LOGGER.warn('Rejecting socket - proxyaddr failed: %s', error);
            next(new Error('Could not determine IP address'));
            return;
        }

        if (isTorExit(socket.context.ipAddress)) {
            socket.context.torConnection = true;
        }

        next();
    }

    // Reject global banned IP addresses
    ipBanMiddleware(socket, next) {
        if (isIPGlobalBanned(socket.context.ipAddress)) {
            LOGGER.info('Rejecting %s - banned',
                    socket.context.ipAddress);
            next(new Error('You are banned from the server'));
            return;
        }

        next();
    }

    // Rate limit connection attempts by IP address
    ipThrottleMiddleware(socket, next) {
        if (!this.ipThrottle.has(socket.context.ipAddress)) {
            this.ipThrottle.set(socket.context.ipAddress, new TokenBucket(5, 0.1));
        }

        const bucket = this.ipThrottle.get(socket.context.ipAddress);
        if (bucket.throttle()) {
            rateLimitExceeded.inc(1);
            LOGGER.info('Rejecting %s - exceeded connection rate limit',
                    socket.context.ipAddress);
            next(new Error('Rate limit exceeded'));
            return;
        }

        next();
    }

    checkIPLimit(socket) {
        const ip = socket.context.ipAddress;
        const count = this.ipCount.get(ip) || 0;
        if (count >= Config.get('io.ip-connection-limit')) {
            connLimitExceeded.inc(1);
            LOGGER.info(
                'Rejecting %s - exceeded connection count limit',
                ip
            );
            socket.emit('kick', {
                reason: 'Too many connections from your IP address'
            });
            socket.disconnect(true);
            return false;
        }

        this.ipCount.set(ip, count + 1);
        socket.once('disconnect', () => {
            const newCount = (this.ipCount.get(ip) || 1) - 1;

            if (newCount === 0) {
                this.ipCount.delete(ip);
            } else {
                this.ipCount.set(ip, newCount);
            }
        });

        return true;
    }

    // Parse cookies
    cookieParsingMiddleware(socket, next) {
        const req = socket.handshake;
        if (req.headers.cookie) {
            cookieParser(req, null, () => next());
        } else {
            req.cookies = {};
            req.signedCookies = {};
            next();
        }
    }

    // Determine session age from ip-session cookie
    // (Used for restricting chat)
    ipSessionCookieMiddleware(socket, next) {
        const cookie = socket.handshake.signedCookies['ip-session'];
        if (!cookie) {
            socket.context.ipSessionFirstSeen = new Date();
            next();
            return;
        }

        const sessionMatch = verifyIPSessionCookie(socket.context.ipAddress, cookie);
        if (sessionMatch) {
            socket.context.ipSessionFirstSeen = sessionMatch.date;
        } else {
            socket.context.ipSessionFirstSeen = new Date();
        }
        next();
    }

    // Match login cookie against the DB, look up aliases
    authUserMiddleware(socket, next) {
        socket.context.aliases = [];

        const promises = [];
        const auth = socket.handshake.signedCookies.auth;
        if (auth) {
            promises.push(verifySession(auth).then(user => {
                socket.context.user = Object.assign({}, user);
            }).catch(_error => {
                authFailureCount.inc(1);
                LOGGER.warn('Unable to verify session for %s - ignoring auth',
                        socket.context.ipAddress);
            }));
        }

        promises.push(getAliases(socket.context.ipAddress).then(aliases => {
            socket.context.aliases = aliases;
        }).catch(_error => {
            LOGGER.warn('Unable to load aliases for %s',
                    socket.context.ipAddress);
        }));

        Promise.all(promises).then(() => next());
    }

    handleConnection(socket) {
        if (!this.checkIPLimit(socket)) {
            //return;
        }

        patchTypecheckedFunctions(socket);
        patchSocketMetrics(socket);

        this.setRateLimiter(socket);

        emitMetrics(socket);

        LOGGER.info('Accepted socket from %s', socket.context.ipAddress);
        socket.once('disconnect', (reason, reasonDetail) => {
            LOGGER.info(
                '%s disconnected (%s%s)',
                socket.context.ipAddress,
                reason,
                reasonDetail ? ` - ${reasonDetail}` : ''
            );
        });

        const user = new User(socket, socket.context.ipAddress, socket.context.user);
        if (socket.context.user) {
            db.recordVisit(socket.context.ipAddress, user.getName());
        }

        const announcement = Server.getServer().announcement;
        if (announcement !== null) {
            socket.emit('announcement', announcement);
        }
    }

    setRateLimiter(socket) {
        const refillRate = () => Config.get('io.throttle.in-rate-limit');
        const capacity = () => Config.get('io.throttle.bucket-capacity');

        socket._inRateLimit = new TokenBucket(capacity, refillRate);

        socket.on('cytube:count-event', () => {
            if (socket._inRateLimit.throttle()) {
                LOGGER.warn(
                    'Kicking client %s: exceeded in-rate-limit of %d',
                    socket.context.ipAddress,
                    refillRate()
                );

                socket.emit('kick', { reason: 'Rate limit exceeded' });
                socket.disconnect();
            }
        });
    }

    initSocketIO() {
        const io = this.io = sio.instance = sio();
        io.use(this.ipProxyMiddleware.bind(this));
        io.use(this.ipBanMiddleware.bind(this));
        io.use(this.ipThrottleMiddleware.bind(this));
        io.use(this.cookieParsingMiddleware.bind(this));
        io.use(this.ipSessionCookieMiddleware.bind(this));
        io.use(this.authUserMiddleware.bind(this));
        io.on('connection', this.handleConnection.bind(this));
    }

    bindTo(servers) {
        if (!this.io) {
            throw new Error('Cannot bind: socket.io has not been initialized yet');
        }

        const engineOpts = {
            /*
             * Set ping timeout to 2 minutes to avoid spurious reconnects
             * during transient network issues.  The default of 20 seconds
             * is too aggressive.
             *
             * https://github.com/calzoneman/sync/issues/780
             */
            pingTimeout: 120000,

            /*
             * Per `ws` docs: "Note that Node.js has a variety of issues with
             * high-performance compression, where increased concurrency,
             * especially on Linux, can lead to catastrophic memory
             * fragmentation and slow performance."
             *
             * CyTube's frames are ordinarily quite small, so there's not much
             * point in compressing them.
             */
            perMessageDeflate: false,
            httpCompression: false,

            maxHttpBufferSize: 1 << 20,

            /*
             * Enable legacy support for socket.io v2 clients (e.g., bots)
             */
            allowEIO3: true,

            cors: {
                origin: getCorsAllowCallback(),
                credentials: true // enable cookies for auth
            }
        };

        servers.forEach(server => {
            this.io.attach(server, engineOpts);
        });
    }
}

const incomingEventCount = new Counter({
    name: 'cytube_socketio_incoming_events_total',
    help: 'Number of received socket.io events from clients'
});
const outgoingPacketCount = new Counter({
    name: 'cytube_socketio_outgoing_packets_total',
    help: 'Number of outgoing socket.io packets to clients'
});
function patchSocketMetrics(sock) {
    const emit = require('events').EventEmitter.prototype.emit;

    sock.onAny(() => {
        incomingEventCount.inc(1);
        emit.call(sock, 'cytube:count-event');
    });

    let packet = sock.packet;
    sock.packet = function patchedPacket() {
        packet.apply(this, arguments);
        outgoingPacketCount.inc(1);
    }.bind(sock);
}

/* TODO: remove this crap */
/* Addendum 2021-08-14: socket.io v4 supports middleware, maybe move type validation to that */
function patchTypecheckedFunctions(sock) {
    sock.typecheckedOn = function typecheckedOn(msg, template, cb) {
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
    }.bind(sock);

    sock.typecheckedOnce = function typecheckedOnce(msg, template, cb) {
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
    }.bind(sock);
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
    name: 'cytube_sockets_accepts_total',
    help: 'Counter for number of connections accepted.  Excludes rejected connections.'
});
const promSocketDisconnect = new Counter({
    name: 'cytube_sockets_disconnects_total',
    help: 'Counter for number of connections disconnected.'
});
const promSocketReconnect = new Counter({
    name: 'cytube_sockets_reconnects_total',
    help: 'Counter for number of reconnects detected.'
});
function emitMetrics(sock) {
    try {
        let closed = false;
        let transportName = sock.conn.transport.name;
        promSocketCount.inc({ transport: transportName });
        promSocketAccept.inc(1);

        sock.conn.on('upgrade', () => {
            try {
                let newTransport = sock.conn.transport.name;
                // Sanity check
                if (!closed && newTransport !== transportName) {
                    promSocketCount.dec({ transport: transportName });
                    transportName = newTransport;
                    promSocketCount.inc({ transport: transportName });
                }
            } catch (error) {
                LOGGER.error('Error emitting transport upgrade metrics for socket (ip=%s): %s',
                        sock.context.ipAddress, error.stack);
            }
        });

        sock.once('disconnect', () => {
            try {
                closed = true;
                promSocketCount.dec({ transport: transportName });
                promSocketDisconnect.inc(1);
            } catch (error) {
                LOGGER.error('Error emitting disconnect metrics for socket (ip=%s): %s',
                        sock.context.ipAddress, error.stack);
            }
        });

        sock.once('reportReconnect', () => {
            try {
                promSocketReconnect.inc(1, new Date());
            } catch (error) {
                LOGGER.error('Error emitting reconnect metrics for socket (ip=%s): %s',
                        sock.context.ipAddress, error.stack);
            }
        });
    } catch (error) {
        LOGGER.error('Error emitting metrics for socket (ip=%s): %s',
                sock.context.ipAddress, error.stack);
    }
}

let instance = null;

module.exports = {
    init: function (srv, webConfig) {
        if (instance !== null) {
            throw new Error('ioserver.init: already initialized');
        }

        const ioServer = instance = new IOServer({
            proxyTrustFn: proxyaddr.compile(webConfig.getTrustedProxies())
        });

        ioServer.initSocketIO();

        const uniqueListenAddresses = new Set();
        const servers = [];

        Config.get("listen").forEach(function (bind) {
            if (!bind.io) {
                return;
            }

            const id = bind.ip + ":" + bind.port;
            if (uniqueListenAddresses.has(id)) {
                LOGGER.warn("Ignoring duplicate listen address %s", id);
                return;
            }

            if (srv.servers.hasOwnProperty(id)) {
                servers.push(srv.servers[id]);
            } else {
                const server = http.createServer().listen(bind.port, bind.ip);
                servers.push(server);
                server.on("error", error => {
                    if (error.code === "EADDRINUSE") {
                        LOGGER.fatal(
                            "Could not bind %s: address already in use.  Check " +
                            "whether another application has already bound this " +
                            "port, or whether another instance of this server " +
                            "is running.",
                            id
                        );
                        process.exit(1);
                    }
                });
            }

            uniqueListenAddresses.add(id);
        });

        ioServer.bindTo(servers);
    },

    IOServer: IOServer
};

/* Clean out old rate limiters */
setInterval(function () {
    if (instance == null) return;

    let cleaned = 0;
    const keys = instance.ipThrottle.keys();
    for (const key of keys) {
        if (instance.ipThrottle.get(key).lastRefill < Date.now() - 60000) {
            const bucket = instance.ipThrottle.delete(key);
            for (const k in bucket) delete bucket[k];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        LOGGER.info('Cleaned up %d stale IP throttle token buckets', cleaned);
    }
}, 5 * 60 * 1000);

function getCorsAllowCallback() {
    let origins = Array.prototype.slice.call(Config.get('io.cors.allowed-origins'));

    origins = origins.concat([
        Config.get('io.domain'),
        Config.get('https.domain')
    ]);

    return function corsOriginAllowed(origin, callback) {
        if (!origin) {
            // Non-browser clients might not care about Origin, allow these.
            callback(null, true);
            return;
        }

        // Different ports are technically cross-origin; a distinction that does not matter to CyTube.
        origin = origin.replace(/:\d+$/, '');

        if (origins.includes(origin)) {
            callback(null, true);
        } else {
            LOGGER.warn('Rejecting origin "%s"; allowed origins are %j', origin, origins);
            callback(new Error('Invalid origin'));
        }
    };
}
