const { EventEmitter } = require('events');
const assert = require('assert');
const { UWSServer } = require('../../lib/io/uws');
const WebSocket = require('uws');

describe('UWSServer', () => {
    const endpoint = 'ws://127.0.0.1:3000';

    let server;
    let socket;
    beforeEach(done => {
        server = new UWSServer();
        server.on('error', e => { throw e; });
        server.once('listening', done);
    });

    function connect() {
        let socket = new WebSocket(endpoint);
        socket.test = new EventEmitter();

        socket.onmessage = message => {
            const args = JSON.parse(message.data);
            const frame = args.shift();
            socket.test.emit(frame, ...args);
        };
        socket.onerror = e => { throw e; };

        return socket;
    }

    afterEach(() => {
        if (socket) socket.terminate();
        socket = null;
        if (server) server.shutdown();
        server = null;
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
});
