class EmailController {
    constructor(mailer, config) {
        this.mailer = mailer;
        this.config = config;
    }

    async sendPasswordReset(params = {}) {
        const { address, username, url } = params;

        const resetConfig = this.config.getPasswordReset();

        const html = resetConfig.getHTML()
                .replace(/\$user\$/g, username)
                .replace(/\$url\$/g, url);
        const text = resetConfig.getText()
                .replace(/\$user\$/g, username)
                .replace(/\$url\$/g, url);

        const result = await this.mailer.sendMail({
            from: resetConfig.getFrom(),
            to: `${username} <${address}>`,
            subject: resetConfig.getSubject(),
            html,
            text
        });

        return result;
    }

    async sendAccountDeletion(params = {}) {
        const { address, username } = params;

        const deleteConfig = this.config.getDeleteAccount();

        const html = deleteConfig.getHTML()
                .replace(/\$user\$/g, username);
        const text = deleteConfig.getText()
                .replace(/\$user\$/g, username);

        const result = await this.mailer.sendMail({
            from: deleteConfig.getFrom(),
            to: `${username} <${address}>`,
            subject: deleteConfig.getSubject(),
            html,
            text
        });

        return result;
    }
}

export { EmailController };
