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

    function getForwardedProto(req) {
        const xForwardedProto = req.header('x-forwarded-proto');
        if (xForwardedProto && xForwardedProto.match(/^https?$/)) {
            return xForwardedProto;
        } else {
            return req.protocol;
        }
    }

    app.use((req, res, next) => {
        if (isTrustedProxy(req.ip)) {
            req.realIP = getForwardedIP(req);
            req.realProtocol = getForwardedProto(req);
        } else {
            req.realIP = req.ip;
            req.realProtocol = req.protocol;
        }

        next();
    });
}
