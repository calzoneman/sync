/**
 * web/account.js - Webserver details for account management
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var webserver = require("./webserver");
var sendPug = require("./pug").sendPug;
var Logger = require("../logger");
var db = require("../database");
var $util = require("../utilities");
var Config = require("../config");
var session = require("../session");
var csrf = require("./csrf");
const url = require("url");
import crypto from 'crypto';

const LOGGER = require('@calzoneman/jsli')('web/accounts');

let globalMessageBus;
let emailConfig;
let emailController;

/**
 * Handles a GET request for /account/edit
 */
function handleAccountEditPage(req, res) {
    sendPug(res, "account-edit", {});
}

function verifyReferrer(req, expected) {
    const referrer = req.header('referer');

    if (!referrer) {
        return true;
    }

    try {
        const parsed = url.parse(referrer);

        if (parsed.pathname !== expected) {
            LOGGER.warn(
                'Possible attempted forgery: %s POSTed to %s',
                referrer,
                expected
            );
            return false;
        }

        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Handles a POST request to edit a user"s account
 */
function handleAccountEdit(req, res) {
    csrf.verify(req);

    if (!verifyReferrer(req, '/account/edit')) {
        res.status(403).send('Mismatched referrer');
        return;
    }

    var action = req.body.action;
    switch(action) {
        case "change_password":
            handleChangePassword(req, res);
            break;
        case "change_email":
            handleChangeEmail(req, res);
            break;
        default:
            res.sendStatus(400);
            break;
    }
}

/**
 * Handles a request to change the user"s password
 */
async function handleChangePassword(req, res) {
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
        sendPug(res, "account-edit", {
            errorMessage: "New password must not be empty"
        });
        return;
    }

    const reqUser = await webserver.authorize(req);
    if (!reqUser) {
        sendPug(res, "account-edit", {
            errorMessage: "You must be logged in to change your password"
        });
        return;
    }

    newpassword = newpassword.substring(0, 100);

    db.users.verifyLogin(name, oldpassword, function (err, _user) {
        if (err) {
            sendPug(res, "account-edit", {
                errorMessage: err
            });
            return;
        }

        db.users.setPassword(name, newpassword, function (err, _dbres) {
            if (err) {
                sendPug(res, "account-edit", {
                    errorMessage: err
                });
                return;
            }

            Logger.eventlog.log("[account] " + req.realIP +
                                " changed password for " + name);

            db.users.getUser(name, function (err, user) {
                if (err) {
                    return sendPug(res, "account-edit", {
                        errorMessage: err
                    });
                }

                var expiration = new Date(parseInt(req.signedCookies.auth.split(":")[1]));
                session.genSession(user, expiration, function (err, auth) {
                    if (err) {
                        return sendPug(res, "account-edit", {
                            errorMessage: err
                        });
                    }

                    webserver.setAuthCookie(req, res, expiration, auth);

                    sendPug(res, "account-edit", {
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
        sendPug(res, "account-edit", {
            errorMessage: "Invalid email address"
        });
        return;
    }

    db.users.verifyLogin(name, password, function (err, _user) {
        if (err) {
            sendPug(res, "account-edit", {
                errorMessage: err
            });
            return;
        }

        db.users.setEmail(name, email, function (err, _dbres) {
            if (err) {
                sendPug(res, "account-edit", {
                    errorMessage: err
                });
                return;
            }
            Logger.eventlog.log("[account] " + req.realIP +
                                " changed email for " + name +
                                " to " + email);
            sendPug(res, "account-edit", {
                successMessage: "Email address changed."
            });
        });
    });
}

/**
 * Handles a GET request for /account/channels
 */
async function handleAccountChannelPage(req, res) {
    const user = await webserver.authorize(req);
    // TODO: error message
    if (!user) {
        return sendPug(res, "account-channels", {
            channels: []
        });
    }

    db.channels.listUserChannels(user.name, function (err, channels) {
        sendPug(res, "account-channels", {
            channels: channels
        });
    });
}

/**
 * Handles a POST request to modify a user"s channels
 */
function handleAccountChannel(req, res) {
    csrf.verify(req);

    if (!verifyReferrer(req, '/account/channels')) {
        res.status(403).send('Mismatched referrer');
        return;
    }

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
async function handleNewChannel(req, res) {

    var name = req.body.name;
    if (typeof name !== "string") {
        res.send(400);
        return;
    }

    const user = await webserver.authorize(req);
    // TODO: error message
    if (!user) {
        return sendPug(res, "account-channels", {
            channels: []
        });
    }

    db.channels.listUserChannels(user.name, function (err, channels) {
        if (err) {
            sendPug(res, "account-channels", {
                channels: [],
                newChannelError: err
            });
            return;
        }

        if (name.match(Config.get("reserved-names.channels"))) {
            sendPug(res, "account-channels", {
                channels: channels,
                newChannelError: "That channel name is reserved"
            });
            return;
        }

        if (channels.length >= Config.get("max-channels-per-user")
                && user.global_rank < 255) {
            sendPug(res, "account-channels", {
                channels: channels,
                newChannelError: "You are not allowed to register more than " +
                                 Config.get("max-channels-per-user") + " channels."
            });
            return;
        }

        db.channels.register(name, user.name, function (err, _channel) {
            if (!err) {
                Logger.eventlog.log("[channel] " + user.name + "@" +
                                    req.realIP +
                                    " registered channel " + name);
                globalMessageBus.emit('ChannelRegistered', {
                    channel: name
                });

                channels.push({
                    name: name
                });
            }


            sendPug(res, "account-channels", {
                channels: channels,
                newChannelError: err ? err : undefined
            });
        });
    });
}

/**
 * Handles a request to delete a new channel
 */
async function handleDeleteChannel(req, res) {
    var name = req.body.name;
    if (typeof name !== "string") {
        res.send(400);
        return;
    }

    const user = await webserver.authorize(req);
    // TODO: error
    if (!user) {
        return sendPug(res, "account-channels", {
            channels: [],
        });
    }


    db.channels.lookup(name, function (err, channel) {
        if (err) {
            sendPug(res, "account-channels", {
                channels: [],
                deleteChannelError: err
            });
            return;
        }

        if ((!channel.owner || channel.owner.toLowerCase() !== user.name.toLowerCase()) && user.global_rank < 255) {
            db.channels.listUserChannels(user.name, function (err2, channels) {
                sendPug(res, "account-channels", {
                    channels: err2 ? [] : channels,
                    deleteChannelError: "You do not have permission to delete this channel"
                });
            });
            return;
        }

        db.channels.drop(name, function (err) {
            if (!err) {
                Logger.eventlog.log("[channel] " + user.name + "@" +
                                    req.realIP + " deleted channel " +
                                    name);
            }

            globalMessageBus.emit('ChannelDeleted', {
                channel: name
            });

            db.channels.listUserChannels(user.name, function (err2, channels) {
                sendPug(res, "account-channels", {
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
async function handleAccountProfilePage(req, res) {
    const user = await webserver.authorize(req);
    // TODO: error message
    if (!user) {
        return sendPug(res, "account-profile", {
            profileImage: "",
            profileText: ""
        });
    }

    db.users.getProfile(user.name, function (err, profile) {
        if (err) {
            sendPug(res, "account-profile", {
                profileError: err,
                profileImage: "",
                profileText: ""
            });
            return;
        }

        sendPug(res, "account-profile", {
            profileImage: profile.image,
            profileText: profile.text,
            profileError: false
        });
    });
}

function validateProfileImage(image, callback) {
    var prefix = "Invalid URL for profile image: ";
    var link = image.trim();
    if (!link) {
        process.nextTick(callback, null, link);
    } else {
        var data = url.parse(link);
        if (!data.protocol || data.protocol !== 'https:') {
            process.nextTick(callback,
                    new Error(prefix + " URL must begin with 'https://'"));
        } else if (!data.host) {
            process.nextTick(callback,
                    new Error(prefix + "missing hostname"));
        } else {
            process.nextTick(callback, null, link);
        }
    }
}

/**
 * Handles a POST request to edit a profile
 */
async function handleAccountProfile(req, res) {
    csrf.verify(req);

    if (!verifyReferrer(req, '/account/profile')) {
        res.status(403).send('Mismatched referrer');
        return;
    }

    const user = await webserver.authorize(req);
    // TODO: error message
    if (!user) {
        return sendPug(res, "account-profile", {
            profileImage: "",
            profileText: "",
            profileError: "You must be logged in to edit your profile",
        });
    }

    var rawImage = String(req.body.image).substring(0, 255);
    var text = String(req.body.text).substring(0, 255);

    validateProfileImage(rawImage, (error, image) => {
        if (error) {
            db.users.getProfile(user.name, function (err, profile) {
                var errorMessage = err || error.message;
                sendPug(res, "account-profile", {
                    profileImage: profile ? profile.image : "",
                    profileText: profile ? profile.text : "",
                    profileError: errorMessage
                });
            });
            return;
        }

        db.users.setProfile(user.name, { image: image, text: text }, function (err) {
            if (err) {
                sendPug(res, "account-profile", {
                    profileImage: "",
                    profileText: "",
                    profileError: err
                });
                return;
            }

            globalMessageBus.emit('UserProfileChanged', {
                user: user.name,
                profile: {
                    image,
                    text
                }
            });

            sendPug(res, "account-profile", {
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
    sendPug(res, "account-passwordreset", {
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

    if (!verifyReferrer(req, '/account/passwordreset')) {
        res.status(403).send('Mismatched referrer');
        return;
    }

    var name = req.body.name,
        email = req.body.email;

    if (typeof name !== "string" || typeof email !== "string") {
        res.send(400);
        return;
    }

    if (!$util.isValidUserName(name)) {
        sendPug(res, "account-passwordreset", {
            reset: false,
            resetEmail: "",
            resetErr: "Invalid username '" + name + "'"
        });
        return;
    }

    db.users.getEmail(name, function (err, actualEmail) {
        if (err) {
            sendPug(res, "account-passwordreset", {
                reset: false,
                resetEmail: "",
                resetErr: err
            });
            return;
        }

        if (actualEmail === '') {
            sendPug(res, "account-passwordreset", {
                reset: false,
                resetEmail: "",
                resetErr: `Username ${name} cannot be recovered because it ` +
                          "doesn't have an email address associated with it."
            });
            return;
        } else if (actualEmail.toLowerCase() !== email.trim().toLowerCase()) {
            sendPug(res, "account-passwordreset", {
                reset: false,
                resetEmail: "",
                resetErr: "Provided email does not match the email address on record for " + name
            });
            return;
        }

        crypto.randomBytes(20, (err, bytes) => {
            if (err) {
                LOGGER.error(
                    'Could not generate random bytes for password reset: %s',
                    err.stack
                );
                sendPug(res, "account-passwordreset", {
                    reset: false,
                    resetEmail: email,
                    resetErr: "Internal error when generating password reset"
                });
                return;
            }

            var hash = bytes.toString('hex');
            // 24-hour expiration
            var expire = Date.now() + 86400000;
            var ip = req.realIP;

            db.addPasswordReset({
                ip: ip,
                name: name,
                email: actualEmail,
                hash: hash,
                expire: expire
            }, function (err, _dbres) {
                if (err) {
                    sendPug(res, "account-passwordreset", {
                        reset: false,
                        resetEmail: "",
                        resetErr: err
                    });
                    return;
                }

                Logger.eventlog.log("[account] " + ip + " requested password recovery for " +
                                    name + " <" + email + ">");

                if (!emailConfig.getPasswordReset().isEnabled()) {
                    sendPug(res, "account-passwordreset", {
                        reset: false,
                        resetEmail: email,
                        resetErr: "This server does not have mail support enabled.  Please " +
                                  "contact an administrator for assistance."
                    });
                    return;
                }

                const baseUrl = `${req.realProtocol}://${req.header("host")}`;

                emailController.sendPasswordReset({
                    username: name,
                    address: email,
                    url: `${baseUrl}/account/passwordrecover/${hash}`
                }).then(_result => {
                    sendPug(res, "account-passwordreset", {
                        reset: true,
                        resetEmail: email,
                        resetErr: false
                    });
                }).catch(error => {
                    LOGGER.error("Sending password reset email failed: %s", error);
                    sendPug(res, "account-passwordreset", {
                        reset: false,
                        resetEmail: email,
                        resetErr: "Sending reset email failed.  Please contact an " +
                                  "administrator for assistance."
                    });
                });
            });
        });
    });
}

/**
 * Handles a request for /account/passwordrecover/<hash>
 */
function handleGetPasswordRecover(req, res) {
    var hash = req.params.hash;
    if (typeof hash !== "string") {
        res.send(400);
        return;
    }

    db.lookupPasswordReset(hash, function (err, row) {
        if (err) {
            sendPug(res, "account-passwordrecover", {
                recovered: false,
                recoverErr: err
            });
            return;
        }

        if (Date.now() >= row.expire) {
            sendPug(res, "account-passwordrecover", {
                recovered: false,
                recoverErr: "This password recovery link has expired.  Password " +
                            "recovery links are valid only for 24 hours after " +
                            "submission."
            });
            return;
        }

        sendPug(res, "account-passwordrecover", {
            confirm: true,
            recovered: false
        });
    });
}

/**
 * Handles a POST request for /account/passwordrecover/<hash>
 */
function handlePostPasswordRecover(req, res) {
    var hash = req.params.hash;
    if (typeof hash !== "string") {
        res.send(400);
        return;
    }

    var ip = req.realIP;

    db.lookupPasswordReset(hash, function (err, row) {
        if (err) {
            sendPug(res, "account-passwordrecover", {
                recovered: false,
                recoverErr: err
            });
            return;
        }

        if (Date.now() >= row.expire) {
            sendPug(res, "account-passwordrecover", {
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
                sendPug(res, "account-passwordrecover", {
                    recovered: false,
                    recoverErr: "Database error.  Please contact an administrator if " +
                                "this persists."

                });
                return;
            }

            db.deletePasswordReset(hash);
            Logger.eventlog.log("[account] " + ip + " recovered password for " + row.name);

            sendPug(res, "account-passwordrecover", {
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
    init: function (app, _globalMessageBus, _emailConfig, _emailController) {
        globalMessageBus = _globalMessageBus;
        emailConfig = _emailConfig;
        emailController = _emailController;

        app.get("/account/edit", handleAccountEditPage);
        app.post("/account/edit", handleAccountEdit);
        app.get("/account/channels", handleAccountChannelPage);
        app.post("/account/channels", handleAccountChannel);
        app.get("/account/profile", handleAccountProfilePage);
        app.post("/account/profile", handleAccountProfile);
        app.get("/account/passwordreset", handlePasswordResetPage);
        app.post("/account/passwordreset", handlePasswordReset);
        app.get("/account/passwordrecover/:hash", handleGetPasswordRecover);
        app.post("/account/passwordrecover/:hash", handlePostPasswordRecover);
        app.get("/account", function (req, res) {
            res.redirect("/login");
        });
    }
};
