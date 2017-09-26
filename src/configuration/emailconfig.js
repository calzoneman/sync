class EmailConfig {
    constructor(config) {
        this.config = config;
    }

    getPasswordReset() {
        const reset = this.config['password-reset'];

        return {
            getHTML() {
                return reset['html-template'];
            },

            getText() {
                return reset['text-template'];
            },

            getFrom() {
                return reset['from'];
            },

            getSubject() {
                return reset['subject'];
            }
        };
    }
}

export { EmailConfig };
