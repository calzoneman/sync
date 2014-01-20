/**
 * web/account.js - Webserver details for account management
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var webserver = require('./webserver');
var logRequest = webserver.logRequest;
var sendJade = require('./jade').sendJade;
var Logger = require('../logger');
var db = require('../database');
//var dbchannels = require('../database/channels');
var $util = require('../utilities');

/**
 * Handles a GET request for /account/edit
 */
function handleAccountEditPage(req, res) {
    logRequest(req);
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    }
    sendJade(res, 'account-edit', {
        loggedIn: loginName !== false,
        loginName: loginName
    });
}

/**
 * Handles a POST request to edit a user's account
 */
function handleAccountEdit(req, res) {
    logRequest(req);
    var action = req.body.action;
    switch(action) {
        case 'change_password':
            handleChangePassword(req, res);
            break;
        case 'change_email':
            handleChangeEmail(req, res);
            break;
        default:
            res.send(400);
            break;
    }
}

/**
 * Handles a request to change the user's password
 */
function handleChangePassword(req, res) {
    var name = req.body.name;
    var oldpassword = req.body.oldpassword;
    var newpassword = req.body.newpassword;
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    }

    if (typeof name !== 'string' ||
        typeof oldpassword !== 'string' ||
        typeof newpassword !== 'string') {
        res.send(400);
        return;
    }

    if (newpassword.length === 0) {
        sendJade(res, 'account-edit', {
            loggedIn: loginName !== false,
            loginName: loginName,
            errorMessage: 'New password must not be empty'
        });
        return;
    }

    newpassword = newpassword.substring(0, 100);

    db.users.verifyLogin(name, oldpassword, function (err, user) {
        if (err) {
            sendJade(res, 'account-edit', {
                loggedIn: loginName !== false,
                loginName: loginName,
                errorMessage: err
            });
            return;
        }

        db.users.setPassword(name, newpassword, function (err, dbres) {
            if (err) {
                sendJade(res, 'account-edit', {
                    loggedIn: loginName !== false,
                    loginName: loginName,
                    errorMessage: err
                });
                return;
            }
            Logger.eventlog(webserver.ipForRequest(req) + ' changed password for ' + name);
            sendJade(res, 'account-edit', {
                loggedIn: loginName !== false,
                loginName: loginName,
                successMessage: 'Password changed.'
            });
        });
    });
}

/**
 * Handles a request to change the user's email
 */
function handleChangeEmail(req, res) {
    var name = req.body.name;
    var password = req.body.password;
    var email = req.body.email;
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    }

    if (typeof name !== 'string' ||
        typeof password !== 'string' ||
        typeof email !== 'string') {
        res.send(400);
        return;
    }

    if (!$util.isValidEmail(email)) {
        sendJade(res, 'account-edit', {
            loggedIn: loginName !== false,
            loginName: loginName,
            errorMessage: 'Invalid email address'
        });
        return;
    }

    db.users.verifyLogin(name, password, function (err, user) {
        if (err) {
            sendJade(res, 'account-edit', {
                loggedIn: loginName !== false,
                loginName: loginName,
                errorMessage: err
            });
            return;
        }

        db.users.setEmail(name, email, function (err, dbres) {
            if (err) {
                sendJade(res, 'account-edit', {
                    loggedIn: loginName !== false,
                    loginName: loginName,
                    errorMessage: err
                });
                return;
            }
            Logger.eventlog(webserver.ipForRequest(req) + ' changed email for ' + name +
                            ' to ' + email);
            sendJade(res, 'account-edit', {
                loggedIn: loginName !== false,
                loginName: loginName,
                successMessage: 'Email address changed.'
            });
        });
    });
}

/**
 * Handles a GET request for /account/channels
 */
function handleAccountChannelPage(req, res) {
    logRequest(req);
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    }

    if (loginName) {
        db.channels.listUserChannels(loginName, function (err, channels) {
            sendJade(res, 'account-channels', {
                loggedIn: true,
                loginName: loginName,
                channels: channels
            });
        });
    } else {
        sendJade(res, 'account-channels', {
            loggedIn: false,
            channels: [],
        });
    }
}

/**
 * Handles a POST request to modify a user's channels
 */
function handleAccountChannel(req, res) {
    logRequest(req);
    var action = req.body.action;
    switch(action) {
        case 'new_channel':
            handleNewChannel(req, res);
            break;
        case 'delete_channel':
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
    logRequest(req);

    var name = req.body.name;
    if (typeof name !== 'string') {
        res.send(400);
        return;
    }

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    } else {
        sendJade(res, 'account-channels', {
            loggedIn: false,
            channels: []
        });
        return;
    }
    db.users.verifyAuth(req.cookies.auth, function (err, user) {
        if (err) {
            sendJade(res, 'account-channels', {
                loggedIn: false,
                channels: [],
                newChannelError: err
            });
            return;
        }

        db.channels.register(name, user.name, function (err, channel) {
            db.channels.listUserChannels(loginName, function (err2, channels) {
                sendJade(res, 'account-channels', {
                    loggedIn: true,
                    loginName: loginName,
                    channels: err2 ? [] : channels,
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
    logRequest(req);

    var name = req.body.name;
    if (typeof name !== 'string') {
        res.send(400);
        return;
    }

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    } else {
        sendJade(res, 'account-channels', {
            loggedIn: false,
            channels: [],
        });
        return;
    }
    db.users.verifyAuth(req.cookies.auth, function (err, user) {
        if (err) {
            sendJade(res, 'account-channels', {
                loggedIn: false,
                channels: [],
                deleteChannelError: err
            });
            return;
        }

        db.channels.lookup(name, function (err, channel) {
            if (channel.owner !== user.name && user.global_rank < 255) {
                db.channels.listUserChannels(loginName, function (err2, channels) {
                    sendJade(res, 'account-channels', {
                        loggedIn: true,
                        loginName: loginName,
                        channels: err2 ? [] : channels,
                        deleteChannelError: 'You do not have permission to delete this channel'
                    });
                });
                return;
            }
            db.channels.drop(name, function (err) {
                db.channels.listUserChannels(loginName, function (err2, channels) {
                    sendJade(res, 'account-channels', {
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
    logRequest(req);

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    } else {
        sendJade(res, 'account-profile', {
            loggedIn: false,
            profileImage: '',
            profileText: ''
        });
        return;
    }

    db.users.getProfile(loginName, function (err, profile) {
        if (err) {
            sendJade(res, 'account-profile', {
                loggedIn: true,
                loginName: loginName,
                profileError: err,
                profileImage: '',
                profileText: ''
            });
            return;
        }

        sendJade(res, 'account-profile', {
            loggedIn: true,
            loginName: loginName,
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
    logRequest(req);

    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    } else {
        sendJade(res, 'account-profile', {
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
            sendJade(res, 'account-profile', {
                loggedIn: false,
                profileImage: "",
                profileText: "",
                profileError: err
            });
            return;
        }

        db.users.setProfile(user.name, { image: image, text: text }, function (err) {
            if (err) {
                sendJade(res, 'account-profile', {
                    loggedIn: true,
                    loginName: user.name,
                    profileImage: "",
                    profileText: "",
                    profileError: err
                });
                return;
            }

            sendJade(res, 'account-profile', {
                loggedIn: true,
                loginName: user.name,
                profileImage: image,
                profileText: text,
                profileError: false
            });
        });
    });
}

module.exports = {
    /**
     * Initialize the module
     */
    init: function (app) {
        app.get('/account/edit', handleAccountEditPage);
        app.post('/account/edit', handleAccountEdit);
        app.get('/account/channels', handleAccountChannelPage);
        app.post('/account/channels', handleAccountChannel);
        app.get('/account/profile', handleAccountProfilePage);
        app.post('/account/profile', handleAccountProfile);
    }
};
