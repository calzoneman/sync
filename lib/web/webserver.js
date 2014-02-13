var path = require("path");
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
        if (typeof xforward !== "string" || !net.isIP(xforward)) {
            return ip;
        } else {
            return xforward;
        }
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
        req.route.method.toUpperCase(),
        req.path,
        req.header("user-agent")
    ].join(" "));
}

/**
 * Redirects a request to HTTPS if the server supports it
 */
function redirectHttps(req, res) {
    if (!req.secure && Config.get("https.enabled")) {
        var ssldomain = Config.get("https.domain");
        var port = Config.get("https.port");
        if (port !== 443) {
            ssldomain += ":" + port;
        }
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
        var domain = Config.get("http.domain");
        var port = Config.get("http.port");
        if (port !== 80) {
            domain += ":" + port;
        }
        console.log(domain);
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
    if (req.secure) {
        sio = Config.get("https.domain") + ":" + Config.get("https.port");
    } else {
        sio = Config.get("http.domain") + ":" + Config.get("io.port");
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
            return a.uniqueName > b.uniqueName ? 1 : -1;
        }

        return a.usercount - b.usercount;
    });

    sendJade(res, "index", {
        loggedIn: loginName !== false,
        loginName: loginName,
        channels: Server.getServer().packChannelList(true)
    });
}

/**
 * Handles a request for the socket.io information
 */
function handleSocketConfig(req, res) {
    logRequest(req);

    res.type("application/javascript");

    var io_url = Config.get("http.domain") + ":" + Config.get("io.port");
    var web_url = Config.get("http.domain") + ":" + Config.get("http.port");
    var ssl_url = Config.get("https.domain") + ":" + Config.get("https.port");
    res.send("var IO_URL='"+io_url+"',WEB_URL='"+web_url+"',SSL_URL='" + ssl_url +
             "',ALLOW_SSL="+Config.get("https.enabled")+";" +
             (Config.get("https.enabled") ?
             "if(location.protocol=='https:'||USEROPTS.secure_connection){" +
             "IO_URL=WEB_URL=SSL_URL;}" : ""));
}

/**
 * Handles a request for the user agreement
 */
function handleUserAgreement(req, res) {
    logRequest(req);
    sendJade(res, "tos", {
        domain: Config.get("http.domain")
    });
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
            app.use(require("express-minify")());
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
        require("./auth").init(app);
        require("./account").init(app);
        require("./acp").init(app);
        app.all("*", function (req, res, next) {
            if (isSuspicious(req)) {
                console.log("isSuspicious");
                logRequest(req, 403);
                res.status(403);
                if (req.header("user-agent").toLowerCase() === "zmeu") {
                    res.send("This server disallows requests from ZmEu.");
                } else {
                    res.send("The request " + req.route.method.toUpperCase() + " " +
                             req.path + " looks pretty fishy to me.  Double check that " +
                             "you typed it correctly.");
                }
                return;
            }
            logRequest(req);
            next();
        });
        app.use(express.static("www"));
    },

    logRequest: logRequest,

    ipForRequest: ipForRequest,

    redirectHttps: redirectHttps,

    redirectHttp: redirectHttp
};
