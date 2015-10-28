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
var bodyParser = require("body-parser");
var cookieParser = require("cookie-parser");
var serveStatic = require("serve-static");
var morgan = require("morgan");
var session = require("../session");
var csrf = require("./csrf");
var XSS = require("../xss");
import * as HTTPStatus from './httpstatus';
import { CSRFError, HTTPError } from '../errors';

const LOG_FORMAT = ':real-address - :remote-user [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
morgan.token('real-address', function (req) { return req.realIP; });

/**
 * Redirects a request to HTTPS if the server supports it
 */
function redirectHttps(req, res) {
    if (!req.secure && Config.get("https.enabled") && Config.get("https.redirect")) {
        var ssldomain = Config.get("https.full-address");
        if (ssldomain.indexOf(req.hostname) < 0) {
            return false;
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
        var domain = Config.get("http.full-address");
        res.redirect(domain + req.path);
        return true;
    }
    return false;
}

/**
 * Legacy socket.io configuration endpoint.  This is being migrated to
 * /socketconfig/<channel name>.json (see ./routes/socketconfig.js)
 */
function handleSocketConfig(req, res) {
    if (/\.json$/.test(req.path)) {
        res.json(Config.get("sioconfigjson"));
        return;
    }

    res.type("application/javascript");

    var sioconfig = Config.get("sioconfig");
    var iourl;
    var ip = req.realIP;
    var ipv6 = false;

    if (net.isIPv6(ip)) {
        iourl = Config.get("io.ipv6-default");
        ipv6 = true;
    }

    if (!iourl) {
        iourl = Config.get("io.ipv4-default");
    }

    sioconfig += "var IO_URL='" + iourl + "';";
    sioconfig += "var IO_V6=" + ipv6 + ";";
    res.send(sioconfig);
}

function handleUserAgreement(req, res) {
    sendJade(res, "tos", {
        domain: Config.get("http.domain")
    });
}

module.exports = {
    /**
     * Initializes webserver callbacks
     */
    init: function (app, webConfig, ioConfig, clusterClient, channelIndex) {
        require("./middleware/x-forwarded-for")(app, webConfig);
        app.use(bodyParser.urlencoded({
            extended: false,
            limit: '1kb' // No POST data should ever exceed this size under normal usage
        }));
        if (Config.get("http.cookie-secret") === "change-me") {
            Logger.errlog.log("YOU SHOULD CHANGE THE VALUE OF cookie-secret IN config.yaml");
        }
        app.use(cookieParser(Config.get("http.cookie-secret")));
        app.use(csrf.init(Config.get("http.root-domain-dotted")));
        app.use(morgan(LOG_FORMAT, {
            stream: require("fs").createWriteStream(path.join(__dirname, "..", "..",
            "http.log"), {
                flags: "a",
                encoding: "utf-8"
            })
        }));

        app.use(function (req, res, next) {
            if (req.path.match(/^\/(css|js|img|boop).*$/)) {
                return next();
            }

            if (!req.signedCookies || !req.signedCookies.auth) {
                return next();
            }

            session.verifySession(req.signedCookies.auth, function (err, account) {
                if (!err) {
                    req.user = res.user = account;
                }

                next();
            });
        });

        if (Config.get("http.gzip")) {
            app.use(require("compression")({ threshold: Config.get("http.gzip-threshold") }));
            Logger.syslog.log("Enabled gzip compression");
        }

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

        require("./routes/channel")(app, ioConfig);
        require("./routes/index")(app, channelIndex);
        app.get("/sioconfig(.json)?", handleSocketConfig);
        require("./routes/socketconfig")(app, clusterClient);
        app.get("/useragreement", handleUserAgreement);
        require("./routes/contact")(app, webConfig);
        require("./auth").init(app);
        require("./account").init(app);
        require("./acp").init(app);
        require("../google2vtt").attach(app);
        app.use(serveStatic(path.join(__dirname, "..", "..", "www"), {
            maxAge: Config.get("http.max-age") || Config.get("http.cache-ttl")
        }));
        app.use((req, res, next) => {
            return next(new HTTPError(`No route for ${req.path}`, {
                status: HTTPStatus.NOT_FOUND
            }));
        });
        app.use(function (err, req, res, next) {
            if (err) {
                if (err instanceof CSRFError) {
                    res.status(HTTPStatus.FORBIDDEN);
                    return sendJade(res, 'csrferror', {
                        path: req.path,
                        referer: req.header('referer')
                    });
                }

                let { message, status } = err;
                if (!status) {
                    status = HTTPStatus.INTERNAL_SERVER_ERROR;
                }
                if (!message) {
                    message = 'An unknown error occurred.';
                } else if (/\.(jade|js)/.test(message)) {
                    // Prevent leakage of stack traces
                    message = 'An internal error occurred.';
                }

                // Log 5xx (server) errors
                if (Math.floor(status / 100) === 5) {
                    Logger.errlog.log(err.stack);
                }

                res.status(status);
                return sendJade(res, 'httperror', {
                    path: req.path,
                    status: status,
                    message: message
                });
            } else {
                next();
            }
        });
    },

    redirectHttps: redirectHttps,

    redirectHttp: redirectHttp
};
