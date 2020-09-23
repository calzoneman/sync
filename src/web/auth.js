/**
 * web/auth.js - Webserver functions for user authentication and registration
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var webserver = require("./webserver");
var sendPug = require("./pug").sendPug;
var Logger = require("../logger");
var $util = require("../utilities");
var db = require("../database");
var Config = require("../config");
var url = require("url");
var session = require("../session");
var csrf = require("./csrf");

const LOGGER = require('@calzoneman/jsli')('web/auth');

function getSafeReferrer(req) {
    const referrer = req.header('referer');

    if (!referrer) {
        return null;
    }

    const { hostname } = url.parse(referrer);

    // TODO: come back to this when refactoring http alt domains
    if (hostname === Config.get('http.root-domain')
            || Config.get('http.alt-domains').includes(hostname)) {
        return referrer;
    } else {
        return null;
    }
}

/**
 * Processes a login request.  Sets a cookie upon successful authentication
 */
function handleLogin(req, res) {
    csrf.verify(req);

    var name = req.body.name;
    var password = req.body.password;
    var rememberMe = req.body.remember;
    var dest = req.body.dest || getSafeReferrer(req) || null;
    dest = dest && dest.match(/login|logout/) ? null : dest;

    if (typeof name !== "string" || typeof password !== "string") {
        res.sendStatus(400);
        return;
    }

    var host = req.hostname;
    // TODO: remove this check from /login, make it generic middleware
    // TODO: separate root-domain and "login domain", e.g. accounts.example.com
    if (host !== Config.get("http.root-domain") &&
            !host.endsWith("." + Config.get("http.root-domain")) &&
            Config.get("http.alt-domains").indexOf(host) === -1) {
        LOGGER.warn("Attempted login from non-approved domain " + host);
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

            webserver.setAuthCookie(req, res, expiration, auth);

            if (dest) {
                res.redirect(dest);
            } else {
                sendPug(res, "login", {
                    loggedIn: true,
                    loginName: user.name,
                    superadmin: user.global_rank >= 255
                });
            }
        });
    });
}

/**
 * Handles a GET request for /login
 */
function handleLoginPage(req, res) {
    if (res.locals.loggedIn) {
        return sendPug(res, "login", {
            wasAlreadyLoggedIn: true
        });
    }

    var redirect = getSafeReferrer(req);
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
    res.locals.loggedIn = res.locals.loginName = res.locals.superadmin = false;
    // Try to find an appropriate redirect
    var dest = req.body.dest || getSafeReferrer(req);
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

function getHcaptchaSiteKey(captchaConfig) {
    if (captchaConfig.isEnabled())
        return captchaConfig.getHcaptcha().getSiteKey();
    else
        return null;
}

/**
 * Handles a GET request for /register
 */
function handleRegisterPage(captchaConfig, req, res) {
    if (res.locals.loggedIn) {
        sendPug(res, "register", {});
        return;
    }

    sendPug(res, "register", {
        registered: false,
        registerError: false,
        hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
    });
}

/**
 * Processes a registration request.
 */
function handleRegister(captchaConfig, captchaController, req, res) {
    csrf.verify(req);

    var name = req.body.name;
    var password = req.body.password;
    var email = req.body.email;
    if (typeof email !== "string") {
        email = "";
    }
    var ip = req.realIP;
    let captchaToken = req.body['h-captcha-response'];

    if (typeof name !== "string" || typeof password !== "string") {
        res.sendStatus(400);
        return;
    }

    if (captchaConfig.isEnabled() &&
        (typeof captchaToken !== 'string' || captchaToken === '')) {
        sendPug(res, "register", {
            registerError: "Missing CAPTCHA",
            hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
        });
        return;
    }

    if (name.length === 0) {
        sendPug(res, "register", {
            registerError: "Username must not be empty",
            hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
        });
        return;
    }

    if (name.match(Config.get("reserved-names.usernames"))) {
        LOGGER.warn(
            'Rejecting attempt by %s to register reserved username "%s"',
            ip,
            name
        );
        sendPug(res, "register", {
            registerError: "That username is reserved",
            hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
        });
        return;
    }

    if (password.length === 0) {
        sendPug(res, "register", {
            registerError: "Password must not be empty",
            hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
        });
        return;
    }

    password = password.substring(0, 100);

    if (email.length > 0 && !$util.isValidEmail(email)) {
        sendPug(res, "register", {
            registerError: "Invalid email address",
            hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
        });
        return;
    }

    if (captchaConfig.isEnabled()) {
        let captchaSuccess = true;
        captchaController.verifyToken(captchaToken)
            .catch(error => {
                LOGGER.warn('CAPTCHA failed for registration %s: %s', name, error.message);
                captchaSuccess = false;
                sendPug(res, "register", {
                    registerError: 'CAPTCHA verification failed: ' + error.message,
                    hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
                });
            }).then(() => {
                if (captchaSuccess)
                    doRegister();
            });
    } else {
        doRegister();
    }

    function doRegister() {
        db.users.register(name, password, email, ip, function (err) {
            if (err) {
                sendPug(res, "register", {
                    registerError: err,
                    hCaptchaSiteKey: getHcaptchaSiteKey(captchaConfig)
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
}

module.exports = {
    /**
     * Initializes auth callbacks
     */
    init: function (app, captchaConfig, captchaController) {
        app.get("/login", handleLoginPage);
        app.post("/login", handleLogin);
        app.post("/logout", handleLogout);
        app.get("/register", (req, res) => {
            handleRegisterPage(captchaConfig, req, res);
        });
        app.post("/register", (req, res) => {
            handleRegister(captchaConfig, captchaController, req, res);
        });
    }
};
