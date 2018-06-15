import { EventEmitter } from 'events';
import { Multimap } from '../util/multimap';
import User from '../user';

const rooms = new Multimap();

class UWSWrapper extends EventEmitter {
    constructor(socket, context) {
        super();

        this._uwsSocket = socket;
        this._joined = new Set();
        this._connected = true;
        this.context = context;

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

export { UWSWrapper };
exports['in'] = inRoom;

export function init() {
    const uws = require('uws');

    const server = new uws.Server({ port: 3000 });

    server.on('connection', socket => {
        const context = {
            aliases: [],
            ipSessionFirstSeen: new Date(),
            torConnection: false,
            ipAddress: null
        };
        const wrap = new UWSWrapper(socket, context);
        new User(wrap, '127.0.0.1', null);
    });
}
