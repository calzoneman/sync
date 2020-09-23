class CaptchaConfig {
    constructor() {
        this.load();
    }

    load(config = { hcaptcha: {}, register: { enabled: false } }) {
        this.config = config;

        const hcaptcha = config.hcaptcha;
        this._hcaptcha = {
            getSiteKey() {
                return hcaptcha['site-key'];
            },

            getSecret() {
                return hcaptcha.secret;
            }
        };
    }

    getHcaptcha() {
        return this._hcaptcha;
    }

    isEnabled() {
        return this.config.register.enabled;
    }
}

export { CaptchaConfig };
