export default class IOConfiguration {
    constructor(config) {
        this.config = config;
    }

    getSocketURL() {
        return this.config.urls[0];
    }
}

IOConfiguration.fromOldConfig = function (oldConfig) {
    const config = {
        urls: []
    };

    ['ipv4-ssl', 'ipv4-nossl', 'ipv6-ssl', 'ipv6-nossl'].forEach(key => {
        if (oldConfig.get('io.' + key)) {
            config.urls.push(oldConfig.get('io.' + key));
        }
    });

    return new IOConfiguration(config);
};
