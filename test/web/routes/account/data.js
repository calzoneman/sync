const assert = require('assert');
const sinon = require('sinon');
const express = require('express');
const { AccountDB } = require('../../../../lib/db/account');
const { ChannelDB } = require('../../../../lib/db/channel');
const { AccountController } = require('../../../../lib/controller/account');
const { AccountDataRoute } = require('../../../../lib/web/routes/account/data');
const http = require('http');
const expressBabelDecorators = require('@calzoneman/express-babel-decorators');
const nodeurl = require('url');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const { CSRFError } = require('../../../../lib/errors');
const { EventEmitter } = require('events');

const TEST_PORT = 10111;
const URL_BASE = `http://localhost:${TEST_PORT}`;

function request(method, url, additionalOptions) {
    if (!additionalOptions) additionalOptions = {};

    const { body } = additionalOptions;
    if (body) {
        delete additionalOptions.body;

        if (!additionalOptions.headers) {
            additionalOptions.headers = {
                'Accept': 'application/json'
            };
        }

        additionalOptions.headers['Content-Type'] = 'application/json';
    }

    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'Accept': 'application/json'
            },
            method
        };

        Object.assign(options, nodeurl.parse(url), additionalOptions);

        const req = http.request(options);

        req.on('error', error => {
            reject(error);
        });

        req.on('response', res => {
            let buffer = '';
            res.setEncoding('utf8');

            res.on('data', data => {
                buffer += data;
            });

            res.on('end', () => {
                res.body = buffer;
                resolve(res);
            });
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

describe('AccountDataRoute', () => {
    let accountDB;
    let channelDB;
    let csrfVerify;
    let verifySessionAsync;
    let server;
    let app;
    let signedCookies;
    let accountDataRoute;

    beforeEach(() => {
        let realAccountDB = new AccountDB();
        let realChannelDB = new ChannelDB();
        accountDB = sinon.mock(realAccountDB);
        channelDB = sinon.mock(realChannelDB);
        csrfVerify = sinon.stub();
        verifySessionAsync = sinon.stub();
        verifySessionAsync.withArgs('test_auth_cookie').resolves({ name: 'test' });

        signedCookies = {
            auth: 'test_auth_cookie'
        };
        app = express();
        app.use((req, res, next) => {
            req.signedCookies = signedCookies;
            next();
        });
        app.use(bodyParser.json({
            limit: '1kb'
        }));

        accountDataRoute = new AccountDataRoute(
            new AccountController(realAccountDB, new EventEmitter()),
            realChannelDB,
            csrfVerify,
            verifySessionAsync
        );

        expressBabelDecorators.bind(app, accountDataRoute);

        server = http.createServer(app);
        server.listen(TEST_PORT);
    });

    afterEach(() => {
        server.close();
    });

    function checkDefaults(route, method) {
        it('rejects requests that don\'t accept JSON', () => {
            return request(method, `${URL_BASE}${route}`, {
                    headers: { 'Accept': 'text/plain' }
            }).then(res => {
                assert.strictEqual(res.statusCode, 406);

                assert.deepStrictEqual(
                    res.body,
                    'Not Acceptable'
                );
            });
        });

        it('rejects requests with no auth cookie', () => {
            signedCookies.auth = null;

            return request(method, `${URL_BASE}${route}`).then(res => {
                assert.strictEqual(res.statusCode, 401);

                const response = JSON.parse(res.body);

                assert.deepStrictEqual(
                    response,
                    { error: 'Authorization required' }
                );
            });
        });

        it('rejects requests with invalid auth cookie', () => {
            signedCookies.auth = 'invalid';
            verifySessionAsync.withArgs('invalid').rejects(new Error('Invalid'));

            return request(method, `${URL_BASE}${route}`).then(res => {
                assert.strictEqual(res.statusCode, 403);

                const response = JSON.parse(res.body);

                assert.deepStrictEqual(
                    response,
                    { error: 'Invalid' }
                );
                assert(verifySessionAsync.calledWith('invalid'));
            });
        });

        it('rejects requests with mismatched auth cookie', () => {
            signedCookies.auth = 'mismatch';
            verifySessionAsync.withArgs('mismatch').resolves({ name: 'not_test' });

            return request(method, `${URL_BASE}${route}`).then(res => {
                assert.strictEqual(res.statusCode, 403);

                const response = JSON.parse(res.body);

                assert.deepStrictEqual(
                    response,
                    { error: 'Session username does not match' }
                );
                assert(verifySessionAsync.calledWith('mismatch'));
            });
        });

        it('rejects requests with invalid CSRF tokens', () => {
            csrfVerify.throws(new CSRFError('CSRF'));

            return request(method, `${URL_BASE}${route}`).then(res => {
                assert.strictEqual(res.statusCode, 403);

                const response = JSON.parse(res.body);

                assert.deepStrictEqual(
                    response,
                    { error: 'Invalid CSRF token' }
                );
                assert(csrfVerify.called);
            });
        });

        it('rejects requests with an internal CSRF handling error', () => {
            csrfVerify.throws(new Error('broken'));

            return request(method, `${URL_BASE}${route}`).then(res => {
                assert.strictEqual(res.statusCode, 503);

                const response = JSON.parse(res.body);

                assert.deepStrictEqual(
                    response,
                    { error: 'Internal error' }
                );
                assert(csrfVerify.called);
            });
        });
    }

    describe('#getAccount', () => {
        it('serves a valid request', () => {
            accountDB.expects('getByName').withArgs('test').returns({
                name: 'test',
                email: 'test@example.com',
                profile: { text: 'blah', image: 'image.jpeg' },
                time: new Date('2017-09-01T00:00:00.000Z'),
                extraData: 'foo'
            });

            return request('GET', `${URL_BASE}/account/data/test`)
                    .then(res => {
                assert.strictEqual(res.statusCode, 200);

                const response = JSON.parse(res.body);

                assert.deepStrictEqual(
                    response,
                    {
                        result: {
                            name: 'test',
                            email: 'test@example.com',
                            profile: { text: 'blah', image: 'image.jpeg' },
                            time: '2017-09-01T00:00:00.000Z'
                        }
                    }
                );
                assert(verifySessionAsync.calledWith(signedCookies.auth));
                assert(csrfVerify.called);
                accountDB.verify();
            });
        });

        checkDefaults('/account/data/test', 'GET');
    });

    describe('#updateAccount', () => {
        it('updates email', () => {
            accountDB.expects('getByName').withArgs('test').returns({
                name: 'test',
                password: '$2a$10$c26sbtkVlYlFUBdSxzQGhenZvdPBI2fvTPOmVRyrBuaD.8j7iyoNm',
                email: 'test@example.com',
                profile: { text: 'blah', image: 'image.jpeg' },
                time: new Date('2017-09-01T00:00:00.000Z')
            });
            accountDB.expects('updateByName').withArgs(
                'test',
                { email: 'test_new@example.com' }
            );

            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    password: 'test',
                    updates: {
                        email: 'test_new@example.com'
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 204);

                accountDB.verify();
            });
        });

        it('updates profile', () => {
            accountDB.expects('updateByName').withArgs(
                'test',
                {
                    profile: {
                        text: 'testing',
                        image: 'https://example.com/image.jpg'
                    }
                }
            );

            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        profile: {
                            text: 'testing',
                            image: 'https://example.com/image.jpg'
                        }
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 204);

                accountDB.verify();
            });
        });

        it('rejects invalid email address', () => {
            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    password: 'test',
                    updates: {
                        email: 'not!!valid'
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Invalid email address'
                );

                accountDB.verify();
            });
        });

        it('rejects request to change email with no password', () => {
            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        email: 'test_new@example.com'
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Password required'
                );

                accountDB.verify();
            });
        });

        it('rejects invalid password', () => {
            accountDB.expects('getByName').withArgs('test').returns({
                name: 'test',
                password: '$2a$10$c26sbtkVlYlFUBdSxzQGhenZvdPBI2fvTPOmVRyrBuaD.8j7iyoNm',
                email: 'test@example.com',
                profile: { text: 'blah', image: 'image.jpeg' },
                time: new Date('2017-09-01T00:00:00.000Z')
            });

            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    password: 'wrong',
                    updates: {
                        email: 'test_new@example.com'
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Invalid password'
                );

                accountDB.verify();
            });
        });

        it('rejects non-existing user', () => {
            accountDB.expects('getByName').withArgs('test').returns(null);

            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    password: 'test',
                    updates: {
                        email: 'test_new@example.com'
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'User does not exist'
                );

                accountDB.verify();
            });
        });

        it('rejects invalid input', () => {
            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: ['not correct']
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Malformed input'
                );

                accountDB.verify();
            });
        });

        it('rejects invalid profile', () => {
            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        profile: 'not valid'
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Invalid profile'
                );

                accountDB.verify();
            });
        });

        it('rejects wrongly typed profile text', () => {
            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        profile: {
                            text: ['wrong'],
                            image: 'https://example.com'
                        }
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Invalid profile'
                );

                accountDB.verify();
            });
        });

        it('rejects too long profile text', () => {
            let longText = ''; for (let i = 0; i < 256; i++) longText += 'a';

            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        profile: {
                            text: longText,
                            image: 'https://example.com'
                        }
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Profile text must not exceed 255 characters'
                );

                accountDB.verify();
            });
        });

        it('rejects wrongly typed profile image', () => {
            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        profile: {
                            text: 'test',
                            image: 42
                        }
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Invalid profile'
                );

                accountDB.verify();
            });
        });

        it('rejects too long profile image', () => {
            let longText = 'https://'; for (let i = 0; i < 256; i++) longText += 'a';

            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        profile: {
                            text: 'test',
                            image: longText
                        }
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Profile image URL must not exceed 255 characters'
                );

                accountDB.verify();
            });
        });

        it('rejects non-https profile image', () => {
            return request('PATCH', `${URL_BASE}/account/data/test`, {
                body: {
                    updates: {
                        profile: {
                            text: 'test',
                            image: 'http://example.com/image.jpg'
                        }
                    }
                }
            }).then(res => {
                assert.strictEqual(res.statusCode, 400);
                assert.strictEqual(
                    JSON.parse(res.body).error,
                    'Profile image URL must start with "https:"'
                );

                accountDB.verify();
            });
        });

        checkDefaults('/account/data/test', 'PATCH');
    });

    describe('#createChannel', () => {
        checkDefaults('/account/data/test/channels/test_channel', 'POST');
    });

    describe('#deleteChannel', () => {
        checkDefaults('/account/data/test/channels/test_channel', 'DELETE');
    });

    describe('#listChannels', () => {
        it('serves a valid request', () => {
            channelDB.expects('listByOwner').withArgs('test').returns([{
                name: 'test_channel',
                owner: 'test',
                time: new Date('2017-09-01T00:00:00.000Z'),
                last_loaded: new Date('2017-09-01T01:00:00.000Z'),
                owner_last_seen: new Date('2017-09-01T02:00:00.000Z'),
                extraData: 'foo'
            }]);

            return request('GET', `${URL_BASE}/account/data/test/channels`)
                    .then(res => {
                assert.strictEqual(res.statusCode, 200);

                const response = JSON.parse(res.body);

                assert.deepStrictEqual(
                    response,
                    {
                        result: [{
                            name: 'test_channel',
                            owner: 'test',
                            time: '2017-09-01T00:00:00.000Z',
                            last_loaded: '2017-09-01T01:00:00.000Z',
                            owner_last_seen: '2017-09-01T02:00:00.000Z',
                        }]
                    }
                );
                assert(verifySessionAsync.calledWith(signedCookies.auth));
                assert(csrfVerify.called);
                channelDB.verify();
            });
        });

        checkDefaults('/account/data/test/channels', 'GET');
    });
});
