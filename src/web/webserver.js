import fs from 'fs';
import path from 'path';
import net from 'net';
import express from 'express';
import { sendJade } from './jade';
import Logger from '../logger';
import Config from '../config';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import serveStatic from 'serve-static';
import morgan from 'morgan';
import csrf from './csrf';
import * as HTTPStatus from './httpstatus';
import { CSRFError, HTTPError } from '../errors';
import counters from "../counters";

function initializeLog(app) {
    const logFormat = ':real-address - :remote-user [:date] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
    const logPath = path.join(__dirname, '..', '..', 'http.log');
    const outputStream = fs.createWriteStream(logPath, {
        flags: 'a', // append to existing file
        encoding: 'utf8'
    });
    morgan.token('real-address', req => req.realIP);
    app.use(morgan(logFormat, {
        stream: outputStream
    }));
}

/**
 * Redirects a request to HTTPS if the server supports it
 */
function redirectHttps(req, res) {
    if (req.realProtocol !== 'https' && Config.get('https.enabled') &&
            Config.get('https.redirect')) {
        var ssldomain = Config.get('https.full-address');
        if (ssldomain.indexOf(req.hostname) < 0) {
            return false;
        }

        res.redirect(ssldomain + req.path);
        return true;
    }
    return false;
}

/**
 * Legacy socket.io configuration endpoint.  This is being migrated to
 * /socketconfig/<channel name>.json (see ./routes/socketconfig.js)
 */
function handleLegacySocketConfig(req, res) {
    if (/\.json$/.test(req.path)) {
        res.json(Config.get('sioconfigjson'));
        return;
    }

    res.type('application/javascript');

    var sioconfig = Config.get('sioconfig');
    var iourl;
    var ip = req.realIP;
    var ipv6 = false;

    if (net.isIPv6(ip)) {
        iourl = Config.get('io.ipv6-default');
        ipv6 = true;
    }

    if (!iourl) {
        iourl = Config.get('io.ipv4-default');
    }

    sioconfig += 'var IO_URL=\'' + iourl + '\';';
    sioconfig += 'var IO_V6=' + ipv6 + ';';
    res.send(sioconfig);
}

function handleUserAgreement(req, res) {
    sendJade(res, 'tos', {
        domain: Config.get('http.domain')
    });
}

function initializeErrorHandlers(app) {
    app.use((req, res, next) => {
        return next(new HTTPError(`No route for ${req.path}`, {
            status: HTTPStatus.NOT_FOUND
        }));
    });

    app.use((err, req, res, next) => {
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
}

module.exports = {
    /**
     * Initializes webserver callbacks
     */
    init: function (app, webConfig, ioConfig, clusterClient, channelIndex, session) {
        app.use((req, res, next) => {
            counters.add("http:request", 1);
            next();
        });
        require('./middleware/x-forwarded-for')(app, webConfig);
        app.use(bodyParser.urlencoded({
            extended: false,
            limit: '1kb' // No POST data should ever exceed this size under normal usage
        }));
        if (webConfig.getCookieSecret() === 'change-me') {
            Logger.errlog.log('WARNING: The configured cookie secret was left as the ' +
                    'default of "change-me".');
        }
        app.use(cookieParser(webConfig.getCookieSecret()));
        app.use(csrf.init(webConfig.getCookieDomain()));
        initializeLog(app);
        require('./middleware/authorize')(app, session);

        if (webConfig.getEnableGzip()) {
            app.use(require('compression')({
                threshold: webConfig.getGzipThreshold()
            }));
            Logger.syslog.log('Enabled gzip compression');
        }

        if (webConfig.getEnableMinification()) {
            const cacheDir = path.join(__dirname, '..', '..', 'www', 'cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir);
            }
            app.use(require('express-minify')({
                cache: cacheDir
            }));
            Logger.syslog.log('Enabled express-minify for CSS and JS');
        }

        require('./routes/channel')(app, ioConfig);
        require('./routes/index')(app, channelIndex);
        app.get('/sioconfig(.json)?', handleLegacySocketConfig);
        require('./routes/socketconfig')(app, clusterClient);
        app.get('/useragreement', handleUserAgreement);
        require('./routes/contact')(app, webConfig);
        require('./auth').init(app);
        require('./account').init(app);
        require('./acp').init(app);
        require('../google2vtt').attach(app);
        app.use(serveStatic(path.join(__dirname, '..', '..', 'www'), {
            maxAge: webConfig.getCacheTTL()
        }));

        initializeErrorHandlers(app);
    },

    redirectHttps: redirectHttps
};
