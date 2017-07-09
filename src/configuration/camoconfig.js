class CamoConfig {
    constructor(config = { camo: { enabled: false } }) {
        this.config = config.camo;
        if (this.config.server) {
            this.config.server = this.config.server.replace(/\/+$/, '');
        }
        this.validate();
    }

    validate() {
        if (this.config.encoding
                && !~['url', 'hex'].indexOf(this.config.encoding)) {
            throw new Error(`Value for key 'encoding' must be either 'url' or 'hex', not '${this.config.encoding}'`);
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

    getEncoding() {
        return this.config.encoding || 'url';
    }
}

export { CamoConfig };
