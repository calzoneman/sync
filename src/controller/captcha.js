const https = require('https');
const querystring = require('querystring');
const { Counter } = require('prom-client');

const LOGGER = require('@calzoneman/jsli')('captcha-controller');

const captchaCount = new Counter({
    name: 'cytube_captcha_count',
    help: 'Count of captcha checks'
});
const captchaFailCount = new Counter({
    name: 'cytube_captcha_failed_count',
    help: 'Count of rejected captcha responses'
});

class CaptchaController {
    constructor(config) {
        this.config = config;
    }

    async verifyToken(token) {
        return new Promise((resolve, reject) => {
            let params = querystring.stringify({
                secret: this.config.getHcaptcha().getSecret(),
                response: token
            });
            let req = https.request(
                'https://hcaptcha.com/siteverify',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': params.length
                    }
                }
            );

            req.setTimeout(10000, () => {
                const error = new Error('Request timed out.');
                error.code = 'ETIMEDOUT';
                reject(error);
            });

            req.on('error', error => {
                reject(error);
            });

            req.on('response', res => {
                if (res.statusCode !== 200) {
                    req.abort();

                    reject(new Error(
                        `HTTP ${res.statusCode} ${res.statusMessage}`
                    ));

                    return;
                }

                let buffer = '';
                res.setEncoding('utf8');

                res.on('data', data => {
                    buffer += data;
                });

                res.on('end', () => {
                    resolve(buffer);
                });
            });

            req.write(params);
            req.end();
        }).then(body => {
            captchaCount.inc(1);
            let res = JSON.parse(body);

            if (!res.success) {
                captchaFailCount.inc(1);
                if (res['error-codes'].length > 0) {
                    switch (res['error-codes'][0]) {
                        case 'missing-input-secret':
                            throw new Error('hCaptcha is misconfigured: missing secret');
                        case 'invalid-input-secret':
                            throw new Error('hCaptcha is misconfigured: invalid secret');
                        case 'sitekey-secret-mismatch':
                            throw new Error('hCaptcha is misconfigured: secret does not match site-key');
                        case 'invalid-input-response':
                        case 'invalid-or-already-seen-response':
                            throw new Error('Invalid captcha response');
                        default:
                            LOGGER.error('Unknown hCaptcha error; response: %j', res);
                            throw new Error('Unknown hCaptcha error: ' + res['error-codes'][0]);
                    }
                } else {
                    throw new Error('Captcha verification failed');
                }
            }
        });
    }
}

export { CaptchaController };
