const assert = require('assert');
const sinon = require('sinon');
const express = require('express');
const { AccountDB } = require('../../../../lib/db/account');
const { ChannelDB } = require('../../../../lib/db/channel');
const { AccountDataRoute } = require('../../../../lib/web/routes/account/data');
const http = require('http');
const expressBabelDecorators = require('@calzoneman/express-babel-decorators');
const nodeurl = require('url');
const Promise = require('bluebird');
const bodyParser = require('body-parser');
const { CSRFError } = require('../../../../lib/errors');

const TEST_PORT = 10111;
const URL_BASE = `http://localhost:${TEST_PORT}`;

function request(method, url, additionalOptions) {
    if (!additionalOptions) additionalOptions = {};

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

                if (buffer.length > 100 * 1024) {
                    req.abort();
                    reject(new Error('Response size exceeds 100KB'));
                }
            });

            res.on('end', () => {
                res.body = buffer;
                resolve(res);
            });
        });

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
        app.use(bodyParser.urlencoded({
            extended: false,
            limit: '1kb'
        }));

        accountDataRoute = new AccountDataRoute(
            realAccountDB,
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
            });
        });

        checkDefaults('/account/data/test', 'GET');
    });

    describe('#updateAccount', () => {
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
            });
        });

        checkDefaults('/account/data/test/channels', 'GET');
    });
});
