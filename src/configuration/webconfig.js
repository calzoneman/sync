import clone from 'clone';

const DEFAULT_TRUSTED_PROXIES = Object.freeze([
    '127.0.0.1',
    '::1'
]);

export default class WebConfiguration {
    constructor(config) {
        this.config = config;
    }

    getEmailContacts() {
        return clone(this.config.contacts);
    }

    getTrustedProxies() {
        return DEFAULT_TRUSTED_PROXIES;
    }

    getCookieSecret() {
        return this.config.authCookie.cookieSecret;
    }

    getCookieDomain() {
        return this.config.authCookie.cookieDomain;
    }

    getEnableGzip() {
        return this.config.gzip.enabled;
    }

    getGzipThreshold() {
        return this.config.gzip.threshold;
    }

    getEnableMinification() {
        return this.config.enableMinification;
    }

    getCacheTTL() {
        return this.config.cacheTTL;
    }
}

WebConfiguration.fromOldConfig = function (oldConfig) {
    const config = {
        contacts: []
    };

    oldConfig.get('contacts').forEach(contact => {
        config.contacts.push({
            name: contact.name,
            email: contact.email,
            title: contact.title
        });
    });

    config.gzip = {
        enabled: oldConfig.get('http.gzip'),
        threshold: oldConfig.get('http.gzip-threshold')
    };

    config.authCookie = {
        cookieSecret: oldConfig.get('http.cookie-secret'),
        cookieDomain: oldConfig.get('http.root-domain-dotted')
    };

    config.enableMinification = oldConfig.get('http.minify');

    config.cacheTTL = oldConfig.get('http.max-age');

    return new WebConfiguration(config);
};
