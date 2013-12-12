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
    res.send(500);
    return;
    logRequest(req);
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    }
    if (loginName) {
        dbchannels.listUserChannels(loginName, function (err, channels) {
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
    res.send(500);
    return;
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
    res.send(500);
}

/**
 * Handles a request to delete a new channel
 */
function handleDeleteChannel(req, res) {
    res.send(500);
}

module.exports = {
    /**
     * Initializes the module
     *
     * @param app - The Express server to initialize
     */
    init: function (app) {
        app.get('/account/edit', handleAccountEditPage);
        app.post('/account/edit', handleAccountEdit);
        app.get('/account/channels', handleAccountChannelPage);
        app.post('/account/channels', handleAccountChannel);
    }
};
