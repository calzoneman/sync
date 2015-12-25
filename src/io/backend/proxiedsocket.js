import { EventEmitter } from 'events';

export default class ProxiedSocket extends EventEmitter {
    constructor(socketID, socketData, socketEmitter, frontendConnection) {
        super();
        this.id = socketID;
        this.ip = socketData.ip;
        this._realip = socketData.ip;
        this.socketEmitter = socketEmitter;
        this.frontendConnection = frontendConnection;
    }

    emit() {
        const target = socketEmitter.to(this.id);
        target.emit.apply(target, arguments);
    }

    onProxiedEventReceived() {
        EventEmitter.prototype.emit.apply(this, arguments);
    }

    join(channel) {
        this.frontendConnection.write(
                this.frontendConnection.protocol.socketJoinSocketChannels(
                        this.id, [channel]
                )
        );
    }

    disconnect() {
        this.frontendConnection.write(
                this.frontendConnection.protocol.socketKick(this.id)
        );
    }
}
