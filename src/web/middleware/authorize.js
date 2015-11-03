const STATIC_RESOURCE = /\..+$/;

export default function initialize(app, session) {
    app.use((req, res, next) => {
        if (STATIC_RESOURCE.test(req.path)) {
            return next();
        } else if (!req.signedCookies || !req.signedCookies.auth) {
            return next();
        } else {
            session.verifySession(req.signedCookies.auth, (err, account) => {
                if (!err) {
                    req.user = res.user = account;
                }

                next();
            });
        }
    });
}
