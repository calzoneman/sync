/*
 * Adapted from https://github.com/expressjs/csurf
 */

var csrf = require("csrf");
var createError = require("http-errors");

var tokens = csrf();

exports.init = function csrfInit (domain) {
    return function (req, res, next) {
        var secret = req.signedCookies._csrf;
        if (!secret) {
            secret = tokens.secretSync();
            res.cookie("_csrf", secret,  {
                domain: domain,
                signed: true,
                httpOnly: true
            });
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
    var secret = req.signedCookies._csrf;
    var token = req.body._csrf || req.query._csrf;

    if (!tokens.verify(secret, token)) {
        throw createError(403, 'invalid csrf token', {
            code: 'EBADCSRFTOKEN'
        });
    }
};
