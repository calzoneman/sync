const assert = require('assert');
const IOServer = require('../../lib/io/ioserver').IOServer;

describe('IOServer', () => {
    let server;
    let socket;
    beforeEach(() => {
        server = new IOServer();
        socket = {
            context: {
                ipAddress: '9.9.9.9'
            },
            handshake: {
                address: '127.0.0.1',
                headers: {
                    'x-forwarded-for': '1.2.3.4'
                }
            }
        };
    });

    describe('#ipProxyMiddleware', () => {
        it('proxies from a trusted address', done => {
            server.ipProxyMiddleware(socket, error => {
                assert(!error);
                assert.strictEqual(socket.context.ipAddress, '1.2.3.4');
                done();
            });
        });

        it('does not proxy from a non-trusted address', done => {
            socket.handshake.address = '5.6.7.8';
            server.ipProxyMiddleware(socket, error => {
                assert(!error);
                assert.strictEqual(socket.context.ipAddress, '5.6.7.8');
                done();
            });
        });

        it('sets context.torConnection = true for Tor exits', () => {
            // TODO
        });
    });

    describe('#ipBanMiddleware', () => {
        // TODO
    });

    describe('#ipThrottleMiddleware', () => {
        it('throttles connections', done => {
            let i = 0;
            function callback(error) {
                if (i < 5) {
                    assert(!error);
                } else {
                    assert.strictEqual(error.message, 'Rate limit exceeded');
                    done();
                }
            }

            function next() {
                server.ipThrottleMiddleware(socket, error => {
                    callback(error);
                    if (++i < 6) next();
                });
            }

            next();
        });
    });

    describe('#cookieParsingMiddleware', () => {
        it('parses cookies', done => {
            socket.handshake.headers.cookie = 'flavor=chocolate%20chip';

            server.cookieParsingMiddleware(socket, () => {
                assert.strictEqual(socket.handshake.cookies.flavor, 'chocolate chip');
                done();
            });
        });

        it('defaults to empty objects if no cookies', done => {
            server.cookieParsingMiddleware(socket, () => {
                assert.deepStrictEqual(socket.handshake.cookies, {});
                assert.deepStrictEqual(socket.handshake.signedCookies, {});
                done();
            });
        });
    });

    describe('#ipSessionCookieMiddleware', () => {
        // TODO
    });

    describe('#authUserMiddleware', () => {
        // TODO
    });
});
