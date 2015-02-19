/**
 * web/account.js - Webserver details for account management
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var webserver = require("./webserver");
var sendJade = require("./jade").sendJade;
var Logger = require("../logger");
var db = require("../database");
var $util = require("../utilities");
var Config = require("../config");
var Server = require("../server");

/**
 * Handles a GET request for /account/edit
 */
function handleAccountEditPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    db.users.verifyAuth(req.cookies.auth, function (err, user) {
        if (err) {
            return sendJade(res, "account-edit", {
                loggedIn: false
            });
        }

        sendJade(res, "account-edit", {
            loggedIn: loginName !== false,
            loginName: loginName
        });
    });
}

/**
 * Handles a POST request to edit a user"s account
 */
function handleAccountEdit(req, res) {
    var action = req.body.action;
    switch(action) {
        case "change_password":
            handleChangePassword(req, res);
            break;
        case "change_email":
            handleChangeEmail(req, res);
            break;
        default:
            res.send(400);
            break;
    }
}

/**
 * Handles a request to change the user"s password
 */
function handleChangePassword(req, res) {
    var name = req.body.name;
    var oldpassword = req.body.oldpassword;
    var newpassword = req.body.newpassword;
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    if (typeof name !== "string" ||
        typeof oldpassword !== "string" ||
        typeof newpassword !== "string") {
        res.send(400);
        return;
    }

    if (newpassword.length === 0) {
        sendJade(res, "account-edit", {
            loggedIn: loginName !== false,
            loginName: loginName,
            errorMessage: "New password must not be empty"
        });
        return;
    }

    newpassword = newpassword.substring(0, 100);

    db.users.verifyLogin(name, oldpassword, function (err, user) {
        if (err) {
            sendJade(res, "account-edit", {
                loggedIn: loginName !== false,
                loginName: loginName,
                errorMessage: err
            });
            return;
        }

        db.users.setPassword(name, newpassword, function (err, dbres) {
            if (err) {
                sendJade(res, "account-edit", {
                    loggedIn: loginName !== false,
                    loginName: loginName,
                    errorMessage: err
                });
                return;
            }
            Logger.eventlog.log("[account] " + webserver.ipForRequest(req) +
                                " changed password for " + name);
            sendJade(res, "account-edit", {
                loggedIn: loginName !== false,
                loginName: loginName,
                successMessage: "Password changed."
            });
        });
    });
}

/**
 * Handles a request to change the user"s email
 */
function handleChangeEmail(req, res) {
    var name = req.body.name;
    var password = req.body.password;
    var email = req.body.email;
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    if (typeof name !== "string" ||
        typeof password !== "string" ||
        typeof email !== "string") {
        res.send(400);
        return;
    }

    if (!$util.isValidEmail(email) && email !== "") {
        sendJade(res, "account-edit", {
            loggedIn: loginName !== false,
            loginName: loginName,
            errorMessage: "Invalid email address"
        });
        return;
    }

    db.users.verifyLogin(name, password, function (err, user) {
        if (err) {
            sendJade(res, "account-edit", {
                loggedIn: loginName !== false,
                loginName: loginName,
                errorMessage: err
            });
            return;
        }

        db.users.setEmail(name, email, function (err, dbres) {
            if (err) {
                sendJade(res, "account-edit", {
                    loggedIn: loginName !== false,
                    loginName: loginName,
                    errorMessage: err
                });
                return;
            }
            Logger.eventlog.log("[account] " + webserver.ipForRequest(req) +
                                " changed email for " + name +
                                " to " + email);
            sendJade(res, "account-edit", {
                loggedIn: loginName !== false,
                loginName: loginName,
                successMessage: "Email address changed."
            });
        });
    });
}

/**
 * Handles a GET request for /account/channels
 */
function handleAccountChannelPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    }

    if (loginName) {
        db.users.verifyAuth(req.cookies.auth, function (err, user) {
            if (err) {
                return sendJade(res, "account-channels", {
                    loggedIn: false
                });
            }

            db.channels.listUserChannels(loginName, function (err, channels) {
                sendJade(res, "account-channels", {
                    loggedIn: true,
                    loginName: loginName,
                    channels: channels
                });
            });
        });
    } else {
        sendJade(res, "account-channels", {
            loggedIn: false,
            channels: [],
        });
    }
}

/**
 * Handles a POST request to modify a user"s channels
 */
function handleAccountChannel(req, res) {
    var action = req.body.action;
    switch(action) {
        case "new_channel":
            handleNewChannel(req, res);
            break;
        case "delete_channel":
            handleDeleteChannel(req, res);
            break;
        default:
            res.send(400);
            break;
    }
}

/**
 * Handles a request to register a new channel
 */
function handleNewChannel(req, res) {

    var name = req.body.name;
    if (typeof name !== "string") {
        res.send(400);
        return;
    }

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    } else {
        sendJade(res, "account-channels", {
            loggedIn: false,
            channels: []
        });
        return;
    }
    db.users.verifyAuth(req.cookies.auth, function (err, user) {
        if (err) {
            sendJade(res, "account-channels", {
                loggedIn: false,
                channels: [],
                newChannelError: err
            });
            return;
        }

        db.channels.listUserChannels(loginName, function (err, channels) {
            if (err) {
                sendJade(res, "account-channels", {
                    loggedIn: true,
                    loginName: loginName,
                    channels: [],
                    newChannelError: err
                });
                return;
            }

            if (name.match(Config.get("reserved-names.channels"))) {
                sendJade(res, "account-channels", {
                    loggedIn: true,
                    loginName: loginName,
                    channels: channels,
                    newChannelError: "That channel name is reserved"
                });
                return;
            }

            if (channels.length >= Config.get("max-channels-per-user")) {
                sendJade(res, "account-channels", {
                    loggedIn: true,
                    loginName: loginName,
                    channels: channels,
                    newChannelError: "You are not allowed to register more than " +
                                     Config.get("max-channels-per-user") + " channels."
                });
                return;
            }

            db.channels.register(name, user.name, function (err, channel) {
                if (!err) {
                    Logger.eventlog.log("[channel] " + user.name + "@" +
                                        webserver.ipForRequest(req) +
                                        " registered channel " + name);
                    var sv = Server.getServer();
                    if (sv.isChannelLoaded(name)) {
                        var chan = sv.getChannel(name);
                        var users = Array.prototype.slice.call(chan.users);
                        users.forEach(function (u) {
                            u.kick("Channel reloading");
                        });

                        if (!chan.dead) {
                            chan.emit("empty");
                        }
                    }
                    channels.push({
                        name: name
                    });
                }


                sendJade(res, "account-channels", {
                    loggedIn: true,
                    loginName: loginName,
                    channels: channels,
                    newChannelError: err ? err : undefined
                });
            });
        });
    });
}

/**
 * Handles a request to delete a new channel
 */
function handleDeleteChannel(req, res) {
    var name = req.body.name;
    if (typeof name !== "string") {
        res.send(400);
        return;
    }

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    } else {
        sendJade(res, "account-channels", {
            loggedIn: false,
            channels: [],
        });
        return;
    }
    db.users.verifyAuth(req.cookies.auth, function (err, user) {
        if (err) {
            sendJade(res, "account-channels", {
                loggedIn: false,
                channels: [],
                deleteChannelError: err
            });
            return;
        }

        db.channels.lookup(name, function (err, channel) {
            if (err) {
                sendJade(res, "account-channels", {
                    loggedIn: true,
                    loginName: loginName,
                    channels: [],
                    deleteChannelError: err
                });
                return;
            }

            if (channel.owner !== user.name && user.global_rank < 255) {
                db.channels.listUserChannels(loginName, function (err2, channels) {
                    sendJade(res, "account-channels", {
                        loggedIn: true,
                        loginName: loginName,
                        channels: err2 ? [] : channels,
                        deleteChannelError: "You do not have permission to delete this channel"
                    });
                });
                return;
            }

            db.channels.drop(name, function (err) {
                if (!err) {
                    Logger.eventlog.log("[channel] " + loginName + "@" +
                                        webserver.ipForRequest(req) + " deleted channel " +
                                        name);
                }
                var sv = Server.getServer();
                if (sv.isChannelLoaded(name)) {
                    var chan = sv.getChannel(name);
                    chan.clearFlag(require("../flags").C_REGISTERED);
                    var users = Array.prototype.slice.call(chan.users);
                    users.forEach(function (u) {
                        u.kick("Channel reloading");
                    });

                    if (!chan.dead) {
                        chan.emit("empty");
                    }
                }
                db.channels.listUserChannels(loginName, function (err2, channels) {
                    sendJade(res, "account-channels", {
                        loggedIn: true,
                        loginName: loginName,
                        channels: err2 ? [] : channels,
                        deleteChannelError: err ? err : undefined
                    });
                });
            });
        });
    });
}

/**
 * Handles a GET request for /account/profile
 */
function handleAccountProfilePage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    var loginName = false;
    if (!req.cookies.auth) {
        return sendJade(res, "account-profile", {
            loggedIn: false,
            profileImage: "",
            profileText: ""
        });
    } else {
        loginName = req.cookies.auth.split(":")[0];
        db.users.verifyAuth(req.cookies.auth, function (err, user) {
            if (err) {
                return sendJade(res, "account-profile", {
                    loggedIn: false
                });
            }

            db.users.getProfile(loginName, function (err, profile) {
                if (err) {
                    sendJade(res, "account-profile", {
                        loggedIn: true,
                        loginName: loginName,
                        profileError: err,
                        profileImage: "",
                        profileText: ""
                    });
                    return;
                }

                sendJade(res, "account-profile", {
                    loggedIn: true,
                    loginName: loginName,
                    profileImage: profile.image,
                    profileText: profile.text,
                    profileError: false
                });
            });
        });
    }
}

/**
 * Handles a POST request to edit a profile
 */
function handleAccountProfile(req, res) {
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(":")[0];
    } else {
        sendJade(res, "account-profile", {
            loggedIn: false,
            profileImage: "",
            profileText: "",
            profileError: "You must be logged in to edit your profile",
        });
        return;
    }

    var image = req.body.image;
    var text = req.body.text;

    db.users.verifyAuth(req.cookies.auth, function (err, user) {
        if (err) {
            sendJade(res, "account-profile", {
                loggedIn: false,
                profileImage: "",
                profileText: "",
                profileError: err
            });
            return;
        }

        db.users.setProfile(user.name, { image: image, text: text }, function (err) {
            if (err) {
                sendJade(res, "account-profile", {
                    loggedIn: true,
                    loginName: user.name,
                    profileImage: "",
                    profileText: "",
                    profileError: err
                });
                return;
            }

            sendJade(res, "account-profile", {
                loggedIn: true,
                loginName: user.name,
                profileImage: image,
                profileText: text,
                profileError: false
            });
        });
    });
}

/**
 * Handles a GET request for /account/passwordreset
 */
function handlePasswordResetPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    sendJade(res, "account-passwordreset", {
        reset: false,
        resetEmail: "",
        resetErr: false
    });
}

/**
 * Handles a POST request to reset a user's password
 */
function handlePasswordReset(req, res) {
    var name = req.body.name,
        email = req.body.email;

    if (typeof name !== "string" || typeof email !== "string") {
        res.send(400);
        return;
    }

    if (!$util.isValidUserName(name)) {
        sendJade(res, "account-passwordreset", {
            reset: false,
            resetEmail: "",
            resetErr: "Invalid username '" + name + "'"
        });
        return;
    }

    db.users.getEmail(name, function (err, actualEmail) {
        if (err) {
            sendJade(res, "account-passwordreset", {
                reset: false,
                resetEmail: "",
                resetErr: err
            });
            return;
        }

        if (actualEmail !== email.trim()) {
            sendJade(res, "account-passwordreset", {
                reset: false,
                resetEmail: "",
                resetErr: "Provided email does not match the email address on record for " + name
            });
            return;
        } else if (actualEmail === "") {
            sendJade(res, "account-passwordreset", {
                reset: false,
                resetEmail: "",
                resetErr: name + " doesn't have an email address on record.  Please contact an " +
                          "administrator to manually reset your password."
            });
            return;
        }

        var hash = $util.sha1($util.randomSalt(64));
        // 24-hour expiration
        var expire = Date.now() + 86400000;
        var ip = webserver.ipForRequest(req);

        db.addPasswordReset({
            ip: ip,
            name: name,
            email: email,
            hash: hash,
            expire: expire
        }, function (err, dbres) {
            if (err) {
                sendJade(res, "account-passwordreset", {
                    reset: false,
                    resetEmail: "",
                    resetErr: err
                });
                return;
            }

            Logger.eventlog.log("[account] " + ip + " requested password recovery for " +
                                name + " <" + email + ">");

            if (!Config.get("mail.enabled")) {
                sendJade(res, "account-passwordreset", {
                    reset: false,
                    resetEmail: email,
                    resetErr: "This server does not have mail support enabled.  Please " +
                              "contact an administrator for assistance."
                });
                return;
            }

            var msg = "A password reset request was issued for your " +
                      "account `"+ name + "` on " + Config.get("http.domain") +
                      ".  This request is valid for 24 hours.  If you did "+
                      "not initiate this, there is no need to take action."+
                      "  To reset your password, copy and paste the " +
                      "following link into your browser: " +
                      Config.get("http.domain") + "/account/passwordrecover/"+hash;

            var mail = {
                from: Config.get("mail.from-name") + " <" + Config.get("mail.from-address") + ">",
                to: email,
                subject: "Password reset request",
                text: msg
            };

            Config.get("mail.nodemailer").sendMail(mail, function (err, response) {
                if (err) {
                    Logger.errlog.log("mail fail: " + err);
                    sendJade(res, "account-passwordreset", {
                        reset: false,
                        resetEmail: email,
                        resetErr: "Sending reset email failed.  Please contact an " +
                                  "administrator for assistance."
                    });
                } else {
                    sendJade(res, "account-passwordreset", {
                        reset: true,
                        resetEmail: email,
                        resetErr: false
                    });
                }
            });
        });
    });
}

/**
 * Handles a request for /account/passwordrecover/<hash>
 */
function handlePasswordRecover(req, res) {
    var hash = req.params.hash;
    if (typeof hash !== "string") {
        res.send(400);
        return;
    }

    var ip = webserver.ipForRequest(req);

    db.lookupPasswordReset(hash, function (err, row) {
        if (err) {
            sendJade(res, "account-passwordrecover", {
                recovered: false,
                recoverErr: err,
                loginName: false
            });
            return;
        }

        if (Date.now() >= row.expire) {
            sendJade(res, "account-passwordrecover", {
                recovered: false,
                recoverErr: "This password recovery link has expired.  Password " +
                            "recovery links are valid only for 24 hours after " +
                            "submission.",
                loginName: false
            });
            return;
        }

        var newpw = "";
        const avail = "abcdefgihkmnpqrstuvwxyz0123456789";
        for (var i = 0; i < 10; i++) {
            newpw += avail[Math.floor(Math.random() * avail.length)];
        }
        db.users.setPassword(row.name, newpw, function (err) {
            if (err) {
                sendJade(res, "account-passwordrecover", {
                    recovered: false,
                    recoverErr: "Database error.  Please contact an administrator if " +
                                "this persists.",
                    loginName: false
                });
                return;
            }

            db.deletePasswordReset(hash);
            Logger.eventlog.log("[account] " + ip + " recovered password for " + row.name);

            sendJade(res, "account-passwordrecover", {
                recovered: true,
                recoverPw: newpw,
                loginName: false
            });
        });
    });
}

module.exports = {
    /**
     * Initialize the module
     */
    init: function (app) {
        app.get("/account/edit", handleAccountEditPage);
        app.post("/account/edit", handleAccountEdit);
        app.get("/account/channels", handleAccountChannelPage);
        app.post("/account/channels", handleAccountChannel);
        app.get("/account/profile", handleAccountProfilePage);
        app.post("/account/profile", handleAccountProfile);
        app.get("/account/passwordreset", handlePasswordResetPage);
        app.post("/account/passwordreset", handlePasswordReset);
        app.get("/account/passwordrecover/:hash", handlePasswordRecover);
        app.get("/account", function (req, res) {
            res.redirect("/login");
        });
    }
};
