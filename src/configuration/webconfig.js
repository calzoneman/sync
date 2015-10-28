import clone from 'clone';

export default class WebConfiguration {
    constructor(config) {
        this.config = config;
    }

    getEmailContacts() {
        return clone(this.config.contacts);
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
