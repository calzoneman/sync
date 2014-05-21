var path = require("path");
var fs = require("fs");
var net = require("net");
var express = require("express");
var webroot = path.join(__dirname, "..", "www");
var sendJade = require("./jade").sendJade;
var Server = require("../server");
var $util = require("../utilities");
var Logger = require("../logger");
var Config = require("../config");
var db = require("../database");

var httplog = new Logger.Logger(path.join(__dirname, "..", "..", "http.log"));

var suspiciousPath = (/admin|adm|\.\.|\/etc\/passwd|\\x5c|%5c|0x5c|setup|install|php|pma|blog|sql|scripts|aspx?|database/ig);
/**
 * Determines whether a request is suspected of being illegitimate
 */
function isSuspicious(req) {
    // ZmEu is a penetration script
    if (req.header("user-agent") &&
        req.header("user-agent").toLowerCase() === "zmeu") {
        return true;
    }

    if (req.path.match(suspiciousPath)) {
        return true;
    }

    return false;
}

/**
 * Extracts an IP address from a request.  Uses X-Forwarded-For if the IP is localhost
 */
function ipForRequest(req) {
    var ip = req.ip;
    if (ip === "127.0.0.1" || ip === "::1") {
        var xforward = req.header("x-forwarded-for");
        if (typeof xforward !== "string") {
            xforward = [];
        } else {
            xforward = xforward.split(",");
        }

        for (var i = 0; i < xforward.length; i++) {
            if (net.isIP(xforward[i])) {
                return xforward[i];
            }
        }
        return ip;
    }
    return ip;
}

/**
 * Logs an HTTP request
 */
function logRequest(req, status) {
    if (status === undefined) {
        status = 200;
    }

    httplog.log([
        ipForRequest(req),
        req.method,
        req.path,
        req.header("user-agent")
    ].join(" "));
}

/**
 * Redirects a request to HTTPS if the server supports it
 */
function redirectHttps(req, res) {
    if (!req.secure && Config.get("https.enabled")) {
        var ssldomain = Config.get("https.full-address");
        res.redirect(ssldomain + req.path);
        return true;
    }
    return false;
}

/**
 * Redirects a request to HTTP if the server supports it
 */
function redirectHttp(req, res) {
    if (req.secure) {
        var domain = Config.get("http.full-address");
        res.redirect(domain + req.path);
        return true;
    }
    return false;
}

/**
 * Handles a GET request for /r/:channel - serves channel.html
 */
function handleChannel(req, res) {
    if (redirectHttp(req, res)) {
        return;
    }

    if (!$util.isValidChannelName(req.params.channel)) {
        logRequest(req, 404);
        res.status(404);
        res.send("Invalid channel name '" + req.params.channel + "'");
        return;
    }

    logRequest(req);

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    var sio;
    if (net.isIPv6(ipForRequest(req))) {
        sio = Config.get("io.ipv6-default");
    }

    if (!sio) {
        sio = Config.get("io.ipv4-default");
    }

    sio += "/socket.io/socket.io.js";

    sendJade(res, "channel", {
        channelName: req.params.channel,
        loggedIn: loginName !== false,
        loginName: loginName,
        sioSource: sio
    });
}

/**
 * Handles a request for the index page
 */
function handleIndex(req, res) {
    logRequest(req);

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    var channels = Server.getServer().packChannelList(true);
    channels.sort(function (a, b) {
        if (a.usercount === b.usercount) {
            return a.uniqueName > b.uniqueName ? -1 : 1;
        }

        return b.usercount - a.usercount;
    });

    sendJade(res, "index", {
        loggedIn: loginName !== false,
        loginName: loginName,
        channels: channels
    });
}

/**
 * Handles a request for the socket.io information
 */
function handleSocketConfig(req, res) {
    logRequest(req);

    res.type("application/javascript");

    var sioconfig = Config.get("sioconfig");
    var iourl;
    var ip = ipForRequest(req);

    if (net.isIPv6(ip)) {
        iourl = Config.get("io.ipv6-default");
    }

    if (!iourl) {
        iourl = Config.get("io.ipv4-default");
    }
    sioconfig += "var IO_URL='" + iourl + "';";
    res.send(sioconfig);
}

function handleUserAgreement(req, res) {
    logRequest(req);

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    sendJade(res, "tos", {
        loggedIn: loginName !== false,
        loginName: loginName,
        domain: Config.get("http.domain")
    });
}

function handleContactPage(req, res) {
    logRequest(req);

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    // Make a copy to prevent messing with the original
    var contacts = Config.get("contacts").map(function (c) {
        return {
            name: c.name,
            email: c.email,
            title: c.title
        };
    });

    // Rudimentary hiding of email addresses to prevent spambots
    contacts.forEach(function (c) {
        c.emkey = $util.randomSalt(16)
        var email = new Array(c.email.length);
        for (var i = 0; i < c.email.length; i++) {
          email[i] = String.fromCharCode(
            c.email.charCodeAt(i) ^ c.emkey.charCodeAt(i % c.emkey.length)
          );
        }
        c.email = escape(email.join(""));
        c.emkey = escape(c.emkey);
    });

    sendJade(res, "contact", {
        loggedIn: loginName !== false,
        loginName: loginName,
        contacts: contacts
    });
}

function static(dir) {
    dir = path.join(__dirname, dir);
    return function (req, res) {
        try {
            if (isSuspicious(req)) {
                logRequest(req, 403);
                res.status(403);
                if (typeof req.header("user-agent") === "string" &&
                    req.header("user-agent").toLowerCase() === "zmeu") {
                    res.send("This server disallows requests from ZmEu.");
                } else {
                    res.send("The request " + req.method.toUpperCase() + " " +
                             req.path + " looks pretty fishy to me.  Double check that " +
                             "you typed it correctly.");
                }
                return;
            }

            res.sendfile(req.path.replace(/^\//, ""), {
                maxAge: Config.get("http.cache-ttl") * 1000,
                root: dir
            }, function (err) {
                logRequest(req);
                if (err) {
                    res.send(err.status);
                }
            });
        } catch (e) {
            Logger.errlog.log(e);
            Logger.errlog.log(e.trace);
        }
    };
}

module.exports = {
    /**
     * Initializes webserver callbacks
     */
    init: function (app) {
        app.use(express.json());
        app.use(express.urlencoded());
        app.use(express.cookieParser());

        if (Config.get("http.minify")) {
            var cache = path.join(__dirname, "..", "..", "www", "cache")
            if (!fs.existsSync(cache)) {
                fs.mkdirSync(cache);
            }
            app.use(require("express-minify")({
                cache: cache
            }));
            Logger.syslog.log("Enabled express-minify for CSS and JS");
        }
        /* Order here is important
         * Since I placed /r/:channel above *, the function will
         * not apply to the /r/:channel route.  This prevents
         * duplicate logging, since /r/:channel"s callback does
         * its own logging
         */
        app.get("/r/:channel", handleChannel);
        app.get("/", handleIndex);
        app.get("/sioconfig", handleSocketConfig);
        app.get("/useragreement", handleUserAgreement);
        app.get("/contact", handleContactPage);
        require("./auth").init(app);
        require("./account").init(app);
        require("./acp").init(app);
        app.use(static(path.join("..", "..", "www")));
        app.use(function (err, req, res, next) {
            if (err) {
                Logger.errlog.log(err);
                Logger.errlog.log(err.stack);
                res.send(500);
            } else {
                next();
            }
        });
    },

    logRequest: logRequest,

    ipForRequest: ipForRequest,

    redirectHttps: redirectHttps,

    redirectHttp: redirectHttp,
};
