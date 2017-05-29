class CamoConfig {
    constructor(config = { camo: { enabled: false } }) {
        this.config = config.camo;
        if (this.config.server) {
            this.config.server = this.config.server.replace(/\/+$/, '');
        }
    }

    isEnabled() {
        return this.config.enabled;
    }

    getKey() {
        return this.config.key;
    }

    getServer() {
        return this.config.server;
    }

    getWhitelistedDomains() {
        return this.config['whitelisted-domains'] || [];
    }
}

export { CamoConfig };
