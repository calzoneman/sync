const { EventEmitter } = require('events');
const assert = require('assert');
const { UWSServer } = require('../../lib/io/uws');
const inRoom = require('../../lib/io/uws')['in'];
const WebSocket = require('uws');
const http = require('http');

describe('UWSServer', () => {
    const endpoint = 'ws://127.0.0.1:3000';

    let httpServer;
    let server;
    let socket;
    beforeEach(done => {
        httpServer = http.createServer();
        httpServer.listen(3000);

        server = new UWSServer();
        server.attach(httpServer);
        server.on('error', e => { throw e; });
        server.once('listening', done);
    });

    function connect() {
        let socket = new WebSocket(endpoint);
        socket.test = new EventEmitter();

        socket.onmessage = message => {
            const { type, frame, payload, ackId } = JSON.parse(message.data);

            if (type === 0) {
                socket.test.emit(frame, payload);
            } else if (type === 1) {
                socket.test.emit('ack', ackId, payload);
            }
        };
        socket.onerror = e => { throw e; };

        return socket;
    }

    afterEach(() => {
        if (socket) socket.terminate();
        socket = null;
        if (server) server.shutdown();
        server = null;
        if (httpServer) httpServer.close();
        httpServer = null;
    });

    it('accepts a connection immediately if there is no middleware', done => {
        socket = connect();
        socket.test.on('connect', done);
    });

    it('accepts a connection with middleware', done => {
        let m1 = false, m2 = false;
        server.use((socket, next) => {
            m1 = true;
            next();
        });
        server.use((socket, next) => {
            m2 = true;
            next();
        });

        socket = connect();
        socket.test.on('connect', () => {
            assert(m1);
            assert(m2);
            done();
        });
    });

    it('rejects a connection with middleware', done => {
        let m1 = false, m2 = false;
        server.use((socket, next) => {
            m1 = true;
            next(new Error('broken'));
        });
        server.use((socket, next) => {
            m2 = true;
            next();
        });

        socket = connect();
        socket.test.on('connect', () => {
            throw new Error('Unexpected connect callback');
        });
        socket.test.on('error', e => {
            assert.strictEqual(e, 'broken');
            assert(!m2);
            done();
        });
    });

    it('receives a normal frame', done => {
        server.on('connection', s => {
            s.on('test', data => {
                assert.deepStrictEqual(data, {foo: 'bar'});
                done();
            });
        });

        socket = connect();
        socket.onopen = () => {
            socket.send(JSON.stringify({
                type: 0,
                frame: 'test',
                payload: { foo: 'bar' }
            }));
        };
    });

    it('sends a normal frame', done => {
        server.on('connection', s => {
            s.emit('test', { foo: 'bar' });
        });

        socket = connect();
        socket.test.on('test', data => {
            assert.deepStrictEqual(data, { foo: 'bar' });
            done();
        });
    });

    it('broadcasts to a room', done => {
        server.on('connection', s => {
            s.join('testroom');
            inRoom('testroom').emit('test', { foo: 'bar' });
        });

        socket = connect();
        socket.test.on('test', data => {
            assert.deepStrictEqual(data, { foo: 'bar' });
            done();
        });
    });

    it('responds with an ack frame', done => {
        server.on('connection', s => {
            s.on('test', (data, ack) => {
                assert.deepStrictEqual(data, {foo: 'bar'});
                ack({ baz: 'quux' });
            });
        });

        socket = connect();
        socket.onopen = () => {
            socket.send(JSON.stringify({
                type: 0,
                frame: 'test',
                payload: { foo: 'bar' },
                ackId: 1
            }));

            socket.test.on('ack', (ackId, payload) => {
                assert.strictEqual(ackId, 1);
                assert.deepStrictEqual(payload, { baz: 'quux' });
                done();
            });
        };
    });

    it('typechecks input frames', done => {
        server.on('connection', s => {
            s.typecheckedOn('test', { foo: 'string' }, data => {
                assert.fail('Should not have reached callback');
            });
        });

        socket = connect();
        socket.onopen = () => {
            socket.send(JSON.stringify({
                type: 0,
                frame: 'test',
                payload: { foo: 123 }
            }));

            socket.test.on('errorMsg', payload => {
                assert.equal(
                    payload.msg,
                    'Unexpected error for message test: ' +
                    'Expected key foo to be of type string, instead got number'
                );
                done();
            });
        };
    });

    it('catches errors during socket.emit()', done => {
        server.on('connection', s => {
            s.join('testroom');
            s._uwsSocket.send = () => { throw new Error('well darn'); };

            s.emit('test', { foo: 'bar' });
            done();
        });

        socket = connect();
    });

    it('catches errors during inRoom().emit()', done => {
        server.on('connection', s => {
            s.join('testroom');
            s._uwsSocket.send = () => { throw new Error('well darn'); };

            inRoom('testroom').emit('test', { foo: 'bar' });
            done();
        });

        socket = connect();
    });

    it('sets disconnected = true after a disconnect', done => {
        server.on('connection', s => {
            assert.strictEqual(s.disconnected, false);

            s.on('disconnect', () => {
                assert.strictEqual(s.disconnected, true);
                done();
            });

            s.disconnect();
        });

        socket = connect();
    });
});
