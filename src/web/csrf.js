/*
 * Adapted from https://github.com/expressjs/csurf
 */

import { CSRFError } from '../errors';

var csrf = require("csrf");
var cookieParser = require("cookie-parser");

var tokens = csrf();

function getCookieOptions(domain, req) {
    const secure = req.realProtocol === 'https' || req.secure === true;
    const options = {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure
    };

    if (domain && domain.indexOf('.') !== -1 && !/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
        options.domain = domain;
    }

    return options;
}

function getSignedCSRFCookies(req) {
    var header = req.headers && req.headers.cookie;
    if (!header || !req.secret) {
        return [];
    }

    return header.split(';')
        .map(part => part.trim())
        .filter(part => part.indexOf('_csrf=') === 0)
        .map(part => part.slice('_csrf='.length))
        .map(value => {
            try {
                return decodeURIComponent(value);
            } catch (_err) {
                return value;
            }
        })
        .filter(value => value.indexOf('s:') === 0)
        .map(value => cookieParser.signedCookie(value, req.secret))
        .filter(value => typeof value === 'string');
}

exports.init = function csrfInit (domain) {
    return function (req, res, next) {
        var secret = req.signedCookies._csrf;
        if (!secret) {
            secret = tokens.secretSync();
            res.cookie("_csrf", secret, getCookieOptions(domain, req));
        }

        var token;

        req.csrfToken = function csrfToken() {
            if (token) {
                return token;
            }

            token = tokens.create(secret);
            return token;
        };

        next();
    };
};

exports.verify = function csrfVerify(req) {
    var secrets = getSignedCSRFCookies(req);
    if (req.signedCookies._csrf) {
        secrets.unshift(req.signedCookies._csrf);
    }

    var token = (req.body && req.body._csrf) ||
                (req.query && req.query._csrf) ||
                req.header('x-csrf-token');

    if (!secrets.some(secret => tokens.verify(secret, token))) {
        throw new CSRFError('Invalid CSRF token');
    }
};
