import { EventEmitter } from 'events';
import { Multimap } from '../util/multimap';
import clone from 'clone';
import uws from 'uws';

const rooms = new Multimap();

class UWSContext {
    constructor(upgradeReq) {
        this.upgradeReq = upgradeReq;
        this.ipAddress = null;
        this.torConnection = null;
        this.ipSessionFirstSeen = null;
        this.user = null;
    }
}

class UWSWrapper extends EventEmitter {
    constructor(socket) {
        super();

        this._uwsSocket = socket;
        this._joined = new Set();
        this._connected = true;

        this.context = new UWSContext({
            connection: {
                remoteAddress: socket._socket.remoteAddress
            },
            headers: clone(socket.upgradeReq.headers)
        });
        // socket.io metrics compatibility
        this.client = {
            conn: {
                on: function(){},
                transport: {
                    name: 'uws'
                }
            }
        };

        this._uwsSocket.on('message', message => {
            this._emit.apply(this, this._decode(message));
        });

        this._uwsSocket.on('close', () => {
            this._connected = false;

            for (let room of this._joined) {
                rooms.delete(room, this);
            }

            this._joined.clear();
            this._emit('disconnect');
        });
    }

    disconnect() {
        this._uwsSocket.terminate();
    }

    get disconnected() {
        return !this._connected;
    }

    emit(frame, ...args) {
        this._uwsSocket.send(encode(frame, args));
    }

    join(room) {
        this._joined.add(room);
        rooms.set(room, this);
    }

    leave(room) {
        this._joined.delete(room);
        rooms.delete(room, this);
    }

    typecheckedOn(frame, typeDef, cb) {
        this.on(frame, cb);
    }

    typecheckedOnce(frame, typeDef, cb) {
        this.once(frame, cb);
    }

    _decode(message) {
        // TODO: handle error and kill clients with protocol violations
        return JSON.parse(message);
    }
}

Object.assign(UWSWrapper.prototype, { _emit: EventEmitter.prototype.emit });

class UWSServer extends EventEmitter {
    constructor() {
        super();

        this._server = new uws.Server({ port: 3000, host: '127.0.0.1' });
        this._middleware = [];

        this._server.on('connection', socket => this._onConnection(socket));
        this._server.on('listening', () => this.emit('listening'));
        this._server.on('error', e => this.emit('error', e));
    }

    use(cb) {
        this._middleware.push(cb);
    }

    _onConnection(uwsSocket) {
        const socket = new UWSWrapper(uwsSocket);

        if (this._middleware.length === 0) {
            this._acceptConnection(socket);
            return;
        }

        let i = 0;
        const self = this;
        function next(error) {
            if (error) {
                socket.emit('error', error.message);
                socket.disconnect();
                return;
            }

            if (i >= self._middleware.length) {
                self._acceptConnection(socket);
                return;
            }

            process.nextTick(self._middleware[i], socket, next);
            i++;
        }

        process.nextTick(next, null);
    }

    _acceptConnection(socket) {
        socket.emit('connect');
        this.emit('connection', socket);
    }

    shutdown() {
        this._server.close();
    }
}

function encode(frame, args) {
    return JSON.stringify([frame].concat(args));
}

function inRoom(room) {
    return {
        emit(frame, ...args) {
            const encoded = encode(frame, args);

            for (let wrapper of rooms.get(room)) {
                wrapper._uwsSocket.send(encoded);
            }
        }
    };
}

export { UWSServer };
exports['in'] = inRoom;
