/**
 * web/webserver.js - functions for serving web content
 *
 * @author Calvin Montgomery <cyzon@cyzon.us>
 */

var path = require('path');
var net = require('net');
var express = require('express');
var webroot = path.join(__dirname, '..', 'www');
var sendJade = require('./jade').sendJade;
var Server = require('../server');
var $util = require('../utilities');
var Logger = require('../logger');

var httplog = new Logger.Logger(path.join(__dirname, '..', '..', 'http.log'));

var suspiciousPath = (/admin|adm|\.\.|\/etc\/passwd|\\x5c|%5c|0x5c|setup|install|php|pma|blog|sql|scripts|aspx?|database/ig);
/**
 * Determines whether a request is suspected of being illegitimate
 */
function isSuspicious(req) {
    // ZmEu is a penetration script
    if (req.header('user-agent') &&
        req.header('user-agent').toLowerCase() === 'zmeu') {
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
    if (ip === '127.0.0.1' || ip === '::1') {
        var xforward = req.header('x-forwarded-for');
        if (typeof xforward !== 'string' || !net.isIP(xforward)) {
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
        status,
        req.header('user-agent')
    ].join(' '));
}

/**
 * Handles a GET request for /r/:channel - serves channel.html
 */
function handleChannel(req, res) {
    if (!$util.isValidChannelName(req.params.channel)) {
        logRequest(req, 404);
        res.status(404);
        res.send('Invalid channel name "' + req.params.channel + '"');
        return;
    }
    logRequest(req);
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    }
    var inst = Server.getServer();
    var iourl = '';
    sendJade(res, 'channel', {
        channelName: req.params.channel,
        layout: 'hd',
        loggedIn: loginName !== false,
        loginName: loginName,
        /*ioUrl: 'http://' + inst.config.sio.domain + ':' + inst.config.sio.port*/
    });
}

/**
 * Handles a request for the index page
 */
function handleIndex(req, res) {
    logRequest(req);
    var loginName = false;
    if (req.cookies.auth) {
        loginName = req.cookies.auth.split(':')[0];
    }

    sendJade(res, 'index', {
        loggedIn: loginName !== false,
        loginName: loginName,
        channels: Server.getServer().packChannelList(true)
    });
}

module.exports = {
    /**
     * Initializes webserver callbacks
     *
     * @param app - The express instance to initialize
     */
    init: function (app) {
        app.use(express.json());
        app.use(express.urlencoded());
        app.use(express.cookieParser());
        /* Order here is important
         * Since I placed /r/:channel above *, the function will
         * not apply to the /r/:channel route.  This prevents
         * duplicate logging, since /r/:channel's callback does
         * its own logging
         */
        app.get('/r/:channel', handleChannel);
        app.get('/', handleIndex);
        app.all('*', function (req, res, next) {
            if (isSuspicious(req)) {
                logRequest(req, 403);
                res.status(403);
                if (req.header('user-agent').toLowerCase() === 'zmeu') {
                    res.send('This server disallows requests from ZmEu.');
                } else {
                    res.send('The request ' + req.route.method.toUpperCase() + ' ' +
                             req.path + ' looks pretty fishy to me.  Double check that ' +
                             'you typed it correctly.');
                }
                return;
            }
            logRequest(req);
            next();
        });
        app.use(express.static('www'));
        require('./auth').init(app);
        require('./account').init(app);
    },

    logRequest: logRequest,

    ipForRequest: ipForRequest
};
