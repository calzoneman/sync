class PrometheusConfig {
    constructor(config = { prometheus: { enabled: false } }) {
        this.config = config.prometheus;
    }

    isEnabled() {
        return this.config.enabled;
    }

    getPort() {
        return this.config.port;
    }

    getHost() {
        return this.config.host;
    }

    getPath() {
        return this.config.path;
    }
}

export { PrometheusConfig };
