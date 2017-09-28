class EmailConfig {
    constructor(config = { 'password-reset': { enabled: false }, smtp: {} }) {
        this.config = config;

        const smtp = config.smtp;
        this._smtp = {
            getHost() {
                return smtp.host;
            },

            getPort() {
                return smtp.port;
            },

            isSecure() {
                return smtp.secure;
            },

            getUser() {
                return smtp.user;
            },

            getPassword() {
                return smtp.password;
            }
        }

        const reset = config['password-reset'];
        this._reset = {
            isEnabled() {
                return reset.enabled;
            },

            getHTML() {
                return reset['html-template'];
            },

            getText() {
                return reset['text-template'];
            },

            getFrom() {
                return reset.from;
            },

            getSubject() {
                return reset.subject;
            }
        };
    }

    getSmtp() {
        return this._smtp;
    }

    getPasswordReset() {
        return this._reset;
    }
}

export { EmailConfig };
