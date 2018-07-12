export default class IOConfiguration {
    constructor(config) {
        this.config = config;
    }

    getSocketEndpoints() {
        return this.config.endpoints.slice();
    }

    getUWSEndpoints() {
        return this.config.uwsEndpoints.slice();
    }
}

function getUWSEndpoints(oldConfig) {
    const uwsEndpoints = oldConfig.get('listen').filter(it => it.uws)
            .map(it => {
                let domain;
                if (it.https) {
                    domain = oldConfig.get('https.domain')
                            .replace(/^https/, 'wss');
                } else {
                    domain = oldConfig.get('io.domain')
                            .replace(/^http/, 'ws');
                }

                return {
                    secure: !!it.https,
                    url: `${domain}:${it.port}`
                };
            });

    uwsEndpoints.sort((a, b) => {
        if (a.secure && !b.secure) {
            return -1;
        } else if (b.secure && !a.secure) {
            return 1;
        } else {
            return 0;
        }
    });

    return uwsEndpoints;
}

IOConfiguration.fromOldConfig = function (oldConfig) {
    const config = {
        endpoints: [],
        uwsEndpoints: getUWSEndpoints(oldConfig)
    };

    if (oldConfig.get('io.ipv4-ssl')) {
        config.endpoints.push({
            url: oldConfig.get('io.ipv4-ssl'),
            secure: true
        });
    }

    if (oldConfig.get('io.ipv4-nossl')) {
        config.endpoints.push({
            url: oldConfig.get('io.ipv4-nossl'),
            secure: false
        });
    }

    if (oldConfig.get('io.ipv6-ssl')) {
        config.endpoints.push({
            url: oldConfig.get('io.ipv4-ssl'),
            secure: true,
            ipv6: true
        });
    }

    if (oldConfig.get('io.ipv6-nossl')) {
        config.endpoints.push({
            url: oldConfig.get('io.ipv4-nossl'),
            secure: false,
            ipv6: true
        });
    }

    return new IOConfiguration(config);
};
