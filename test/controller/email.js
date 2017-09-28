const assert = require('assert');
const { createTransport } = require('nodemailer');
const { EmailController } = require('../../lib/controller/email');
const { EmailConfig } = require('../../lib/configuration/emailconfig');

describe('EmailController', () => {
    describe('sendPasswordReset', () => {
        it('sends a password reset email', () => {
            const mailer = createTransport({
                jsonTransport: true
            });
            const config = new EmailConfig({
                'password-reset': {
                    from: 'Test <test@example.com>',
                    subject: 'Password Reset',
                    'html-template': 'Reset <a href="$url$">here</a> $user$',
                    'text-template': 'Text is better than HTML $user$ $url$'
                }
            });

            const controller = new EmailController(mailer, config);

            return controller.sendPasswordReset({
                address: 'some-user@example.com',
                username: 'SomeUser',
                url: 'http://localhost/password-reset/blah'
            }).then(info => {
                const sentMessage = JSON.parse(info.message);

                assert.strictEqual(sentMessage.subject, 'Password Reset');
                assert.deepStrictEqual(
                    sentMessage.from,
                    { name: 'Test', address: 'test@example.com' }
                );
                assert.deepStrictEqual(
                    sentMessage.to,
                    [{ name: 'SomeUser', address: 'some-user@example.com' }]
                );
                assert.strictEqual(
                    sentMessage.html,
                    'Reset <a href="http://localhost/password-reset/blah">here</a> SomeUser'
                );
                assert.strictEqual(
                    sentMessage.text,
                    'Text is better than HTML SomeUser http://localhost/password-reset/blah'
                );
            });
        });
    });
});
