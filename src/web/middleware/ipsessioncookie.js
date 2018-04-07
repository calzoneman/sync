const NO_EXPIRATION = new Date('Fri, 31 Dec 9999 23:59:59 GMT');

export function createIPSessionCookie(ip, date) {
    return [
        ip,
        date.getTime()
    ].join(':');
}

export function verifyIPSessionCookie(ip, cookie) {
    const parts = cookie.split(':');
    if (parts.length !== 2) {
        return null;
    }

    if (parts[0] !== ip) {
        return null;
    }

    const unixtime = parseInt(parts[1], 10);
    const date = new Date(unixtime);
    if (isNaN(date.getTime())) {
        return null;
    }

    return { date };
}

export function ipSessionCookieMiddleware(req, res, next) {
    let firstSeen = new Date();
    let hasSession = false;
    if (req.signedCookies && req.signedCookies['ip-session']) {
        const sessionMatch = verifyIPSessionCookie(req.realIP, req.signedCookies['ip-session']);
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
