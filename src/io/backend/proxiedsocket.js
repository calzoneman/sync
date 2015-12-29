import { EventEmitter } from 'events';

export default class ProxiedSocket extends EventEmitter {
    constructor(socketID, socketIP, socketEmitter, frontendConnection) {
        super();
        this.id = socketID;
        this.ip = socketIP;
        this._realip = socketIP;
        this.socketEmitter = socketEmitter;
        this.frontendConnection = frontendConnection;
    }

    emit() {
        const target = this.socketEmitter.to(this.id);
        target.emit.apply(target, arguments);
    }

    onProxiedEventReceived() {
        EventEmitter.prototype.emit.apply(this, arguments);
    }

    join(channel) {
        this.frontendConnection.write(
                this.frontendConnection.protocol.newSocketJoinRoomsEvent(
                        this.id, [channel]
                )
        );
    }

    disconnect() {
        this.frontendConnection.write(
                this.frontendConnection.protocol.newSocketKickEvent(this.id)
        );
    }
}
