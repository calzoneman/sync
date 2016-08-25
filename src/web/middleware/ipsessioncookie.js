import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const STATE_FOLDER_PATH = path.resolve(__dirname, '..', '..', '..', 'state');
const SALT_PATH = path.resolve(__dirname, '..', '..', '..', 'state', 'ipsessionsalt.json');

const NO_EXPIRATION = new Date('Fri, 31 Dec 9999 23:59:59 GMT');
var SALT;
try {
    SALT = require(SALT_PATH);
} catch (error) {
    SALT = crypto.randomBytes(32).toString('base64');
    try {
        fs.mkdirSync(STATE_FOLDER_PATH);
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
    fs.writeFileSync(SALT_PATH, JSON.stringify(SALT));
}

function sha256(input) {
    var hash = crypto.createHash("sha256");
    hash.update(input);
    return hash.digest("base64");
}

export function createIPSessionCookie(ip, date) {
    const hashInput = [
        ip,
        date.getTime(),
        SALT
    ].join(':');

    return [
        date.getTime(),
        sha256(hashInput)
    ].join(':');
}

export function verifyIPSessionCookie(ip, cookie) {
    const parts = cookie.split(':');
    if (parts.length !== 2) {
        return false;
    }

    const timestamp = parseInt(parts[0], 10);
    if (isNaN(timestamp)) {
        return false;
    }

    const date = new Date(timestamp);
    const expected = createIPSessionCookie(ip, date);
    if (expected !== cookie) {
        return false;
    }

    return {
        date: date,
    };
}

export function ipSessionCookieMiddleware(req, res, next) {
    var firstSeen = new Date();
    var hasSession = false;
    if (req.signedCookies && req.signedCookies['ip-session']) {
        var sessionMatch = verifyIPSessionCookie(req.realIP, req.signedCookies['ip-session']);
        if (sessionMatch) {
            hasSession = true;
            firstSeen = sessionMatch.date;
        }
    }

    if (!hasSession) {
        res.cookie('ip-session', createIPSessionCookie(req.realIP, firstSeen), {
            signed: true,
            httpOnly: true,
            expires: NO_EXPIRATION
        });
    }

    req.ipSessionFirstSeen = firstSeen;
    next();
}
