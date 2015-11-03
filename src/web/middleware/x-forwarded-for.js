import net from 'net';

export default function initialize(app, webConfig) {
    function isTrustedProxy(ip) {
        return webConfig.getTrustedProxies().indexOf(ip) >= 0;
    }

    function getForwardedIP(req) {
        const xForwardedFor = req.header('x-forwarded-for');
        if (!xForwardedFor) {
            return req.ip;
        }

        const ipList = xForwardedFor.split(',');
        for (let i = 0; i < ipList.length; i++) {
            const ip = ipList[i].trim();
            if (net.isIP(ip)) {
                return ip;
            }
        }

        return req.ip;
    }

    app.use((req, res, next) => {
        if (isTrustedProxy(req.ip)) {
            req.realIP = getForwardedIP(req);
        }

        next();
    });
}
