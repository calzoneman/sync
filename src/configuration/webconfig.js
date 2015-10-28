import clone from 'clone';

const DEFAULT_TRUSTED_PROXIES = [
    '127.0.0.1',
    '::1'
];

export default class WebConfiguration {
    constructor(config) {
        this.config = config;
    }

    getEmailContacts() {
        return clone(this.config.contacts);
    }

    getTrustedProxies() {
        return DEFAULT_TRUSTED_PROXIES.slice();
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

    return new WebConfiguration(config);
};
