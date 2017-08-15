import { setAuthCookie } from '../webserver';
const STATIC_RESOURCE = /\..+$/;

export default function initialize(app, session) {
    app.use(async (req, res, next) => {
        if (STATIC_RESOURCE.test(req.path)) {
            return next();
        } else if (!req.signedCookies || !req.signedCookies.auth) {
            return next();
        } else {
            const [
                name, expiration, salt, hash, global_rank
            ] = req.signedCookies.auth.split(':');

            if (!name || !expiration || !salt || !hash) {
                // Invalid auth cookie
                return next();
            }

            let rank;
            if (!global_rank) {
                try {
                    rank = await backfillRankIntoAuthCookie(
                        session,
                        new Date(parseInt(expiration, 10)),
                        req,
                        res
                    );
                } catch (error) {
                    return next();
                }
            } else {
                rank = parseInt(global_rank, 10);
            }

            res.locals.loggedIn = true;
            res.locals.loginName = name;
            res.locals.superadmin = rank >= 255;
            next();
        }
    });
}

async function backfillRankIntoAuthCookie(session, expiration, req, res) {
    return new Promise((resolve, reject) => {
        session.verifySession(req.signedCookies.auth, (err, account) => {
            if (err) {
                reject(err);
                return;
            }

            session.genSession(account, expiration, (err2, auth) => {
                if (err2) {
                    // genSession never returns an error, but it still
                    // has a callback parameter for one, so just in case...
                    reject(new Error('This should never happen: ' + err2));
                    return;
                }

                setAuthCookie(req, res, expiration, auth);

                resolve(parseInt(auth.split(':')[4], 10));
            });
        });
    });
}
