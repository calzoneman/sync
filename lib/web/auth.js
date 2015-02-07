/**
 * web/auth.js - Webserver functions for user authentication and registration
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var jade = require("jade");
var path = require("path");
var webserver = require("./webserver");
var cookieall = webserver.cookieall;
var sendJade = require("./jade").sendJade;
var Logger = require("../logger");
var $util = require("../utilities");
var db = require("../database");
var Config = require("../config");
var url = require("url");

/**
 * Processes a login request.  Sets a cookie upon successful authentication
 */
function handleLogin(req, res) {
    var name = req.body.name;
    var password = req.body.password;
    var rememberMe = req.body.remember;

    if (typeof name !== "string" || typeof password !== "string") {
        res.send(400);
        return;
    }

    password = password.substring(0, 100);

    db.users.verifyLogin(name, password, function (err, user) {
        if (err) {
            if (err === "Invalid username/password combination") {
                Logger.eventlog.log("[loginfail] Login failed (bad password): " + name
                                  + "@" + webserver.ipForRequest(req));
            }
            sendJade(res, "login", {
                loggedIn: false,
                loginError: err
            });
        } else {
            var auth = user.name + ":" + user.hash;
            var expiration;
            if (rememberMe) {
                expiration = new Date("Fri, 31 Dec 9999 23:59:59 GMT");
            } else {
                expiration = new Date(Date.now() + 7*24*60*60*1000);
            }

            res.cookie("auth", auth, {
                expires: expiration,
                httpOnly: true
            });

            res.cookie("auth", auth, {
                domain: Config.get("http.root-domain-dotted"),
                expires: expiration,
                httpOnly: true
            });

            // Try to find an appropriate redirect
            var ref = req.header("referrer");
            if (!ref) {
                ref = req.body.redirect;
            }

            if (typeof ref !== "string") {
                ref = "";
            }

            // Redirect to shim cookie layer if the host doesn't match
            try {
                var data = url.parse(ref);
                if (data.host.indexOf(Config.get("http.root-domain")) === -1) {
                    var host = data.host.replace(/:\d+$/, "");
                    if (Config.get("http.alt-domains").indexOf(host) === -1) {
                        Logger.syslog.log("WARNING: Attempted login from non-approved "+
                                          "domain " + host);
                    } else {
                        var dest = "/shimcookie?auth=" + encodeURIComponent(auth) +
                                   "&rank=" + encodeURIComponent(user.global_rank) +
                                   "&redirect=" + encodeURIComponent(ref);
                        res.redirect(data.protocol + "//" + data.host + dest);
                        return;
                    }
                }
            } catch (e) {
            }

            if (ref.match(/login|logout/)) {
                ref = "";
            }

            if (ref) {
                res.redirect(ref);
            } else {
                sendJade(res, "login", {
                    loggedIn: true,
                    loginName: user.name
                });
            }
        }
    });
}

function handleShimCookie(req, res) {
    var auth = req.query.auth;
    var rank = req.query.rank;
    var redirect = req.query.redirect;
    if (typeof auth !== "string" || typeof redirect !== "string" ||
        typeof rank !== "string") {
        res.send(400);
        return;
    }

    res.cookie("auth", auth, {
        expires: new Date(Date.now() + 7*24*60*60*1000),
        httpOnly: true
    });

    res.cookie("rank", rank, {
        expires: new Date(Date.now() + 7*24*60*60*1000),
    });

    if (redirect.match(/login|logout/)) {
        redirect = "";
    }

    if (redirect) {
        res.redirect(redirect);
    } else {
        sendJade(res, "login", {
            loggedIn: true,
            loginName: auth.split(":")[0]
        });
    }
}

function handleShimLogout(req, res) {
    var redirect = req.query.redirect;
    if (typeof redirect !== "string") {
        res.send(400);
        return;
    }

    res.clearCookie("auth");
    res.clearCookie("rank");
    res.clearCookie("auth", { domain: Config.get("http.root-domain-dotted") });
    res.clearCookie("rank", { domain: Config.get("http.root-domain-dotted") });
    

    if (redirect.match(/login|logout/)) {
        redirect = "";
    }

    if (redirect) {
        res.redirect(redirect);
    } else {
        sendJade(res, "logout", {});
    }
}

/**
 * Handles a GET request for /login
 */
function handleLoginPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    if (req.cookies.auth) {
        var split = req.cookies.auth.split(":");
        if (split.length === 2) {
            sendJade(res, "login", {
                wasAlreadyLoggedIn: true,
                loggedIn: true,
                loginName: split[0]
            });
            return;
        }
    }
    sendJade(res, "login", {
        loggedIn: false,
        redirect: req.header("Referrer")
    });
}

/**
 * Handles a request for /logout.  Clears auth cookie
 */
function handleLogout(req, res) {
    res.clearCookie("auth");
    res.clearCookie("rank");
    // Try to find an appropriate redirect
    var ref = req.header("referrer");
    if (!ref) {
        ref = req.query.redirect;
    }

    if (typeof ref !== "string") {
        ref = "";
    }

    var host = req.hostname;
    if (host.indexOf(Config.get("http.root-domain")) !== -1) {
        res.clearCookie("auth", { domain: Config.get("http.root-domain-dotted") });
        res.clearCookie("rank", { domain: Config.get("http.root-domain-dotted") });
    } else {
        var dest = Config.get("http.full-address") + "/shimlogout?redirect=" +
                   encodeURIComponent(ref);
        res.redirect(dest);
        return;
    }

    if (ref.match(/login|logout/)) {
        ref = "";
    }

    if (ref) {
        res.redirect(ref);
    } else {
        sendJade(res, "logout", {});
    }
}

/**
 * Handles a GET request for /register
 */
function handleRegisterPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    if (req.cookies.auth) {
        var split = req.cookies.auth.split(":");
        if (split.length === 2) {
            sendJade(res, "register", {
                loggedIn: true,
                loginName: split[0]
            });
            return;
        }
    }

    sendJade(res, "register", {
        registered: false,
        registerError: false
    });
}

/**
 * Processes a registration request.
 */
function handleRegister(req, res) {
    var name = req.body.name;
    var password = req.body.password;
    var email = req.body.email;
    if (typeof email !== "string") {
        email = "";
    }
    var ip = webserver.ipForRequest(req);

    if (typeof name !== "string" || typeof password !== "string") {
        res.send(400);
        return;
    }

    if (name.length === 0) {
        sendJade(res, "register", {
            registerError: "Username must not be empty"
        });
        return;
    }

    if (name.match(Config.get("reserved-names.usernames"))) {
        sendJade(res, "register", {
            registerError: "That username is reserved"
        });
        return;
    }

    if (password.length === 0) {
        sendJade(res, "register", {
            registerError: "Password must not be empty"
        });
        return;
    }

    password = password.substring(0, 100);

    if (email.length > 0 && !$util.isValidEmail(email)) {
        sendJade(res, "register", {
            registerError: "Invalid email address"
        });
        return;
    }

    db.users.register(name, password, email, ip, function (err) {
        if (err) {
            sendJade(res, "register", {
                registerError: err
            });
        } else {
            Logger.eventlog.log("[register] " + ip + " registered account: " + name +
                             (email.length > 0 ? " <" + email + ">" : ""));
            sendJade(res, "register", {
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
        app.get("/logout", handleLogout);
        app.get("/register", handleRegisterPage);
        app.post("/register", handleRegister);
        app.get("/shimcookie", handleShimCookie);
        app.get("/shimlogout", handleShimLogout);
    }
};
