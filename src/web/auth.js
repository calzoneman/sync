/**
 * web/auth.js - Webserver functions for user authentication and registration
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var pug = require("pug");
var path = require("path");
var webserver = require("./webserver");
var cookieall = webserver.cookieall;
var sendPug = require("./pug").sendPug;
var Logger = require("../logger");
var $util = require("../utilities");
var db = require("../database");
var Config = require("../config");
var url = require("url");
var session = require("../session");
var csrf = require("./csrf");

/**
 * Processes a login request.  Sets a cookie upon successful authentication
 */
function handleLogin(req, res) {
    csrf.verify(req);

    var name = req.body.name;
    var password = req.body.password;
    var rememberMe = req.body.remember;
    var dest = req.body.dest || req.header("referer") || null;
    dest = dest && dest.match(/login|logout/) ? null : dest;

    if (typeof name !== "string" || typeof password !== "string") {
        res.sendStatus(400);
        return;
    }

    var host = req.hostname;
    if (host.indexOf(Config.get("http.root-domain")) === -1 &&
            Config.get("http.alt-domains").indexOf(host) === -1) {
        Logger.syslog.log("WARNING: Attempted login from non-approved domain " + host);
        return res.sendStatus(403);
    }

    var expiration;
    if (rememberMe) {
        expiration = new Date("Fri, 31 Dec 9999 23:59:59 GMT");
    } else {
        expiration = new Date(Date.now() + 7*24*60*60*1000);
    }

    password = password.substring(0, 100);

    db.users.verifyLogin(name, password, function (err, user) {
        if (err) {
            if (err === "Invalid username/password combination") {
                Logger.eventlog.log("[loginfail] Login failed (bad password): " + name
                                  + "@" + req.realIP);
            }
            sendPug(res, "login", {
                loggedIn: false,
                loginError: err
            });
            return;
        }

        session.genSession(user, expiration, function (err, auth) {
            if (err) {
                sendPug(res, "login", {
                    loggedIn: false,
                    loginError: err
                });
                return;
            }

            if (req.hostname.indexOf(Config.get("http.root-domain")) >= 0) {
                // Prevent non-root cookie from screwing things up
                res.clearCookie("auth");
                res.cookie("auth", auth, {
                    domain: Config.get("http.root-domain-dotted"),
                    expires: expiration,
                    httpOnly: true,
                    signed: true
                });
            } else {
                res.cookie("auth", auth, {
                    expires: expiration,
                    httpOnly: true,
                    signed: true
                });
            }

            if (dest) {
                res.redirect(dest);
            } else {
                res.user = user;
                sendPug(res, "login", {});
            }
        });
    });
}

/**
 * Handles a GET request for /login
 */
function handleLoginPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    if (req.user) {
        return sendPug(res, "login", {
            wasAlreadyLoggedIn: true
        });
    }

    var redirect = req.query.dest || req.header("referer");
    var locals = {};
    if (!/\/register/.test(redirect)) {
        locals.redirect = redirect;
    }

    sendPug(res, "login", locals);
}

/**
 * Handles a request for /logout.  Clears auth cookie
 */
function handleLogout(req, res) {
    csrf.verify(req);

    res.clearCookie("auth");
    req.user = res.user = null;
    // Try to find an appropriate redirect
    var dest = req.body.dest || req.header("referer");
    dest = dest && dest.match(/login|logout|account/) ? null : dest;

    var host = req.hostname;
    if (host.indexOf(Config.get("http.root-domain")) !== -1) {
        res.clearCookie("auth", { domain: Config.get("http.root-domain-dotted") });
    }

    if (dest) {
        res.redirect(dest);
    } else {
        sendPug(res, "logout", {});
    }
}

/**
 * Handles a GET request for /register
 */
function handleRegisterPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    if (req.user) {
        sendPug(res, "register", {});
        return;
    }

    sendPug(res, "register", {
        registered: false,
        registerError: false
    });
}

/**
 * Processes a registration request.
 */
function handleRegister(req, res) {
    csrf.verify(req);

    var name = req.body.name;
    var password = req.body.password;
    var email = req.body.email;
    if (typeof email !== "string") {
        email = "";
    }
    var ip = req.realIP;

    if (typeof name !== "string" || typeof password !== "string") {
        res.sendStatus(400);
        return;
    }

    if (name.length === 0) {
        sendPug(res, "register", {
            registerError: "Username must not be empty"
        });
        return;
    }

    if (name.match(Config.get("reserved-names.usernames"))) {
        sendPug(res, "register", {
            registerError: "That username is reserved"
        });
        return;
    }

    if (password.length === 0) {
        sendPug(res, "register", {
            registerError: "Password must not be empty"
        });
        return;
    }

    password = password.substring(0, 100);

    if (email.length > 0 && !$util.isValidEmail(email)) {
        sendPug(res, "register", {
            registerError: "Invalid email address"
        });
        return;
    }

    db.users.register(name, password, email, ip, function (err) {
        if (err) {
            sendPug(res, "register", {
                registerError: err
            });
        } else {
            Logger.eventlog.log("[register] " + ip + " registered account: " + name +
                             (email.length > 0 ? " <" + email + ">" : ""));
            sendPug(res, "register", {
                registered: true,
                registerName: name,
                redirect: req.body.redirect
            });
        }
    });
}

module.exports = {
    /**
     * Initializes auth callbacks
     */
    init: function (app) {
        app.get("/login", handleLoginPage);
        app.post("/login", handleLogin);
        app.post("/logout", handleLogout);
        app.get("/register", handleRegisterPage);
        app.post("/register", handleRegister);
    }
};
