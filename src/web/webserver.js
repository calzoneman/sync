import fs from 'fs';
import path from 'path';
import { sendPug } from './pug';
import Config from '../config';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import serveStatic from 'serve-static';
import morgan from 'morgan';
import csrf from './csrf';
import * as HTTPStatus from './httpstatus';
import { CSRFError, HTTPError } from '../errors';
import { Summary, Counter } from 'prom-client';
import session from '../session';
const verifySessionAsync = require('bluebird').promisify(session.verifySession);

const LOGGER = require('@calzoneman/jsli')('webserver');

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

function initPrometheus(app) {
    const latency = new Summary({
        name: 'cytube_http_req_duration_seconds',
        help: 'HTTP Request latency from execution of the first middleware '
                + 'until the "finish" event on the response object.',
        labelNames: ['method', 'statusCode']
    });
    const requests = new Counter({
        name: 'cytube_http_req_total',
        help: 'HTTP Request count',
        labelNames: ['method', 'statusCode']
    });

    app.use((req, res, next) => {
        const startTime = process.hrtime();
        res.on('finish', () => {
            try {
                const diff = process.hrtime(startTime);
                const diffSec = diff[0] + diff[1]*1e-9;
                latency.labels(req.method, res.statusCode).observe(diffSec);
                requests.labels(req.method, res.statusCode).inc(1, new Date());
            } catch (error) {
                LOGGER.error('Failed to record HTTP Prometheus metrics: %s', error.stack);
            }
        });
        next();
    });

    setInterval(() => {
        latency.reset();
    }, 5 * 60 * 1000).unref();
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
                return sendPug(res, 'csrferror', {
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
            } else if (/\.(pug|js)/.test(message)) {
                // Prevent leakage of stack traces
                message = 'An internal error occurred.';
            }

            // Log 5xx (server) errors
            if (Math.floor(status / 100) === 5) {
                LOGGER.error(err.stack);
            }

            res.status(status);
            return sendPug(res, 'httperror', {
                path: req.path,
                status: status,
                message: message
            });
        } else {
            next();
        }
    });
}

function patchExpressToHandleAsync() {
    const Layer = require('express/lib/router/layer');
    // https://github.com/expressjs/express/blob/4.x/lib/router/layer.js#L86
    Layer.prototype.handle_request = function handle(req, res, next) {
        const fn = this.handle;

        if (fn.length > 3) {
            next();
        }

        try {
            const result = fn(req, res, next);

            if (result && result.catch) {
                result.catch(error => next(error));
            }
        } catch (error) {
            next(error);
        }
    };
}

module.exports = {
    /**
     * Initializes webserver callbacks
     */
    init: function (
        app,
        webConfig,
        ioConfig,
        clusterClient,
        channelIndex,
        session,
        globalMessageBus,
        emailConfig,
        emailController,
        captchaConfig,
        captchaController
    ) {
        patchExpressToHandleAsync();
        const chanPath = Config.get('channel-path');

        initPrometheus(app);
        require('./middleware/x-forwarded-for').initialize(app, webConfig);
        app.use(bodyParser.urlencoded({
            extended: false,
            limit: '32kb' // No POST data should ever exceed this size under normal usage
        }));
        app.use(bodyParser.json({
            limit: '8kb'
        }));
        if (webConfig.getCookieSecret() === 'change-me') {
            LOGGER.warn('The configured cookie secret was left as the ' +
                    'default of "change-me".');
        }
        app.use(cookieParser(webConfig.getCookieSecret()));
        app.use(csrf.init(webConfig.getCookieDomain()));
        app.use(`/${chanPath}/:channel`, require('./middleware/ipsessioncookie').ipSessionCookieMiddleware);
        initializeLog(app);
        require('./middleware/authorize')(app, session);

        if (webConfig.getEnableGzip()) {
            app.use(require('compression')({
                threshold: webConfig.getGzipThreshold()
            }));
            LOGGER.info('Enabled gzip compression');
        }

        if (webConfig.getEnableMinification()) {
            const cacheDir = path.join(__dirname, '..', '..', 'www', 'cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir);
            }
            app.use((req, res, next) => {
                res.minifyOptions = res.minifyOptions || {};

                if (/\.user\.js/.test(req.url)) {
                    res.minifyOptions.minify = false;
                }

                next();
            });
            app.use(require('express-minify')({
                cache: cacheDir
            }));
            LOGGER.info('Enabled express-minify for CSS and JS');
        }

        require('./routes/channel')(app, ioConfig, chanPath);
        require('./routes/index')(app, channelIndex, webConfig.getMaxIndexEntries());
        require('./routes/socketconfig')(app, clusterClient);
        require('./routes/contact')(app, webConfig);
        require('./auth').init(app, captchaConfig, captchaController);
        require('./account').init(app, globalMessageBus, emailConfig, emailController, captchaConfig);
        require('./routes/account/delete-account')(
            app,
            csrf.verify,
            require('../database/channels'),
            require('../database/accounts'),
            emailConfig,
            emailController
        );

        require('./acp').init(app, ioConfig);
        require('../google2vtt').attach(app);
        require('./routes/google_drive_userscript')(app);

        app.use(serveStatic(path.join(__dirname, '..', '..', 'www'), {
            maxAge: webConfig.getCacheTTL()
        }));

        initializeErrorHandlers(app);
    },

    authorize: async function authorize(req) {
        if (!req.signedCookies || !req.signedCookies.auth) {
            return false;
        }

        try {
            return await verifySessionAsync(req.signedCookies.auth);
        } catch (error) {
            return false;
        }
    },

    setAuthCookie: function setAuthCookie(req, res, expiration, auth) {
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
    }
};
