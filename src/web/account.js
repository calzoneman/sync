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
var session = require("../session");
var csrf = require("./csrf");

/**
 * Handles a GET request for /account/edit
 */
function handleAccountEditPage(req, res) {
    if (webserver.redirectHttps(req, res)) {
        return;
    }

    sendJade(res, "account-edit", {});
}

/**
 * Handles a POST request to edit a user"s account
 */
function handleAccountEdit(req, res) {
    csrf.verify(req);

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

    if (typeof name !== "string" ||
        typeof oldpassword !== "string" ||
        typeof newpassword !== "string") {
        res.send(400);
        return;
    }

    if (newpassword.length === 0) {
        sendJade(res, "account-edit", {
            errorMessage: "New password must not be empty"
        });
        return;
    }

    if (!req.user) {
        sendJade(res, "account-edit", {
            errorMessage: "You must be logged in to change your password"
        });
        return;
    }

    newpassword = newpassword.substring(0, 100);

    db.users.verifyLogin(name, oldpassword, function (err, user) {
        if (err) {
            sendJade(res, "account-edit", {
                errorMessage: err
            });
            return;
        }

        db.users.setPassword(name, newpassword, function (err, dbres) {
            if (err) {
                sendJade(res, "account-edit", {
                    errorMessage: err
                });
                return;
            }

            Logger.eventlog.log("[account] " + webserver.ipForRequest(req) +
                                " changed password for " + name);

            db.users.getUser(name, function (err, user) {
                if (err) {
                    return sendJade(res, "account-edit", {
                        errorMessage: err
                    });
                }

                res.user = user;
                var expiration = new Date(parseInt(req.signedCookies.auth.split(":")[1]));
                session.genSession(user, expiration, function (err, auth) {
                    if (err) {
                        return sendJade(res, "account-edit", {
                            errorMessage: err
                        });
                    }

                    if (req.hostname.indexOf(Config.get("http.root-domain")) >= 0) {
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

                    sendJade(res, "account-edit", {
                        successMessage: "Password changed."
                    });
                });
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

    if (typeof name !== "string" ||
        typeof password !== "string" ||
        typeof email !== "string") {
        res.send(400);
        return;
    }

    if (!$util.isValidEmail(email) && email !== "") {
        sendJade(res, "account-edit", {
            errorMessage: "Invalid email address"
        });
        return;
    }

    db.users.verifyLogin(name, password, function (err, user) {
        if (err) {
            sendJade(res, "account-edit", {
                errorMessage: err
            });
            return;
        }

        db.users.setEmail(name, email, function (err, dbres) {
            if (err) {
                sendJade(res, "account-edit", {
                    errorMessage: err
                });
                return;
            }
            Logger.eventlog.log("[account] " + webserver.ipForRequest(req) +
                                " changed email for " + name +
                                " to " + email);
            sendJade(res, "account-edit", {
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

    if (!req.user) {
        return sendJade(res, "account-channels", {
            channels: []
        });
    }

    db.channels.listUserChannels(req.user.name, function (err, channels) {
        sendJade(res, "account-channels", {
            channels: channels
        });
    });
}

/**
 * Handles a POST request to modify a user"s channels
 */
function handleAccountChannel(req, res) {
    csrf.verify(req);

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

    if (!req.user) {
        return sendJade(res, "account-channels", {
            channels: []
        });
    }

    db.channels.listUserChannels(req.user.name, function (err, channels) {
        if (err) {
            sendJade(res, "account-channels", {
                channels: [],
                newChannelError: err
            });
            return;
        }

        if (name.match(Config.get("reserved-names.channels"))) {
            sendJade(res, "account-channels", {
                channels: channels,
                newChannelError: "That channel name is reserved"
            });
            return;
        }

        if (channels.length >= Config.get("max-channels-per-user")) {
            sendJade(res, "account-channels", {
                channels: channels,
                newChannelError: "You are not allowed to register more than " +
                                 Config.get("max-channels-per-user") + " channels."
            });
            return;
        }

        db.channels.register(name, req.user.name, function (err, channel) {
            if (!err) {
                Logger.eventlog.log("[channel] " + req.user.name + "@" +
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
                channels: channels,
                newChannelError: err ? err : undefined
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

    if (!req.user) {
        return sendJade(res, "account-channels", {
            channels: [],
        });
    }


    db.channels.lookup(name, function (err, channel) {
        if (err) {
            sendJade(res, "account-channels", {
                channels: [],
                deleteChannelError: err
            });
            return;
        }

        if (channel.owner !== req.user.name && req.user.global_rank < 255) {
            db.channels.listUserChannels(req.user.name, function (err2, channels) {
                sendJade(res, "account-channels", {
                    channels: err2 ? [] : channels,
                    deleteChannelError: "You do not have permission to delete this channel"
                });
            });
            return;
        }

        db.channels.drop(name, function (err) {
            if (!err) {
                Logger.eventlog.log("[channel] " + req.user.name + "@" +
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
            db.channels.listUserChannels(req.user.name, function (err2, channels) {
                sendJade(res, "account-channels", {
                    channels: err2 ? [] : channels,
                    deleteChannelError: err ? err : undefined
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

    if (!req.user) {
        return sendJade(res, "account-profile", {
            profileImage: "",
            profileText: ""
        });
    }

    db.users.getProfile(req.user.name, function (err, profile) {
        if (err) {
            sendJade(res, "account-profile", {
                profileError: err,
                profileImage: "",
                profileText: ""
            });
            return;
        }

        sendJade(res, "account-profile", {
            profileImage: profile.image,
            profileText: profile.text,
            profileError: false
        });
    });
}

/**
 * Handles a POST request to edit a profile
 */
function handleAccountProfile(req, res) {
    csrf.verify(req);

    if (!req.user) {
        return sendJade(res, "account-profile", {
            profileImage: "",
            profileText: "",
            profileError: "You must be logged in to edit your profile",
        });
    }

    var image = req.body.image;
    var text = req.body.text;

    db.users.setProfile(req.user.name, { image: image, text: text }, function (err) {
        if (err) {
            sendJade(res, "account-profile", {
                profileImage: "",
                profileText: "",
                profileError: err
            });
            return;
        }

        sendJade(res, "account-profile", {
            profileImage: image,
            profileText: text,
            profileError: false
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
    csrf.verify(req);

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
                recoverErr: err
            });
            return;
        }

        if (Date.now() >= row.expire) {
            sendJade(res, "account-passwordrecover", {
                recovered: false,
                recoverErr: "This password recovery link has expired.  Password " +
                            "recovery links are valid only for 24 hours after " +
                            "submission."
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
                                "this persists."

                });
                return;
            }

            db.deletePasswordReset(hash);
            Logger.eventlog.log("[account] " + ip + " recovered password for " + row.name);

            sendJade(res, "account-passwordrecover", {
                recovered: true,
                recoverPw: newpw
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
