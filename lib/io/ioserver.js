var sio = require("socket.io");
var parseCookie = require("cookie").parse;
var Logger = require("../logger");
var db = require("../database");
var User = require("../user");
var Server = require("../server");
var $util = require("../utilities");

var CONNECT_RATE = {
    burst: 5,
    sustained: 0.1
};

// Keep track of rate limiting by IP
var ipThrottle = {};
// Keep track of number of connections per IP
var ipCount = {};

/**
 * Called before an incoming socket.io connection is accepted.
 */
function handleAuth(data, accept) {
    data.user = false;
    if (data.headers.cookie) {
        data.cookie = parseCookie(data.headers.cookie);
        var auth = data.cookie.auth;
        db.users.verifyAuth(auth, function (err, user) {
            if (!err) {
                console.log('VERIFIED: ' + user.name + ' => ' + user.global_rank);
                data.user = {
                    name: user.name,
                    global_rank: user.global_rank
                };
            } else {
                console.log('Auth fail: ' + err);
            }
            accept(null, true);
        });
    } else {
        accept(null, true);
    }
}

/**
 * Called after a connection is accepted
 */
function handleConnection(sock) {
    sock._ip = sock.handshake.address.address;
    var ip = sock._ip;
    var srv = Server.getServer();
    if (srv.torblocker && srv.torblocker.shouldBlockIP(ip)) {
        sock.emit("kick", {
            reason: "This server does not allow connections from Tor.  "+
                    "Please log in with your regular internet connection."
        });
        Logger.syslog.log("Blocked Tor IP: " + ip);
        sock.disconnect(true);
        return;
    }

    if (!(ip in ipThrottle)) {
        ipThrottle[ip] = $util.newRateLimiter();
    }

    if (ipThrottle[ip].throttle(CONNECT_RATE)) {
        Logger.syslog.log("WARN: IP throttled: " + ip);
        sock.emit("kick", {
            reason: "Your IP address is connecting too quickly.  Please "+
                    "wait 10 seconds before joining again."
        });
        return;
    }

    // Check for global ban on the IP
    db.isGlobalIPBanned(ip, function (err, banned) {
        if (banned) {
            Logger.syslog.log("Disconnecting " + ip + " - global banned");
            sock.emit("kick", { reason: "Your IP is globally banned." });
            sock.disconnect(true);
        }
    });

    sock.on("disconnect", function () {
        ipCount[ip]--;
    });

    if (!(ip in ipCount)) {
        ipCount[ip] = 0;
    }

    ipCount[ip]++;
    if (ipCount[ip] > srv.cfg["ip-connection-limit"]) {
        sock.emit("kick", {
            reason: "Too many connections from your IP address"
        });
        sock.disconnect(true);
        return;
    }

    Logger.syslog.log("Accepted socket from " + ip);
    var user = new User(sock);
    if (sock.handshake.user) {
        user.name = sock.handshake.user.name;
        user.global_rank = sock.handshake.user.global_rank;
        user.loggedIn = true;
        user.socket.emit("login", {
            success: true,
            name: user.name
        });
        user.socket.emit("rank", user.global_rank);
    }
}

module.exports = {
    init: function (srv) {
        var ioport = srv.cfg["io-port"];
        var webport = srv.cfg["web-port"];
        var app;
        if (ioport !== webport) {
            app = require("express")().listen(ioport, srv.cfg["express-host"]);
            srv.ioWeb = app;
        } else {
            app = srv.express;
        }

        srv.io = sio.listen(app);
        srv.io.set("log level", 1);
        srv.io.set("authorization", handleAuth);
        srv.io.on("connection", handleConnection);

        if (srv.cfg["enable-ssl"]) {
            srv.ioSecure = sio.listen(srv.https);
            srv.ioSecure.set("log level", 1);
            srv.ioSecure.set("authorization", handleAuth);
            srv.ioSecure.on("connection", handleConnection);
        }
    }
};
