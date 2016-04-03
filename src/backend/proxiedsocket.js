import logger from 'cytube-common/lib/logger';
import { EventEmitter } from 'events';

export default class ProxiedSocket extends EventEmitter {
    constructor(socketID, socketIP, socketUser, socketEmitter, frontendConnection) {
        super();
        this.id = socketID;
        this.ip = socketIP;
        this._realip = socketIP;
        if (socketUser) {
            this.user = {
                name: socketUser.name,
                global_rank: socketUser.globalRank
            };
        }
        this.socketEmitter = socketEmitter;
        this.frontendConnection = frontendConnection;
    }

    emit() {
        const target = this.socketEmitter.to(this.id);
        target.emit.apply(target, arguments);
    }

    onProxiedEventReceived() {
        try {
            EventEmitter.prototype.emit.apply(this, arguments);
        } catch (error) {
            logger.error(`Emit failed: ${error.stack}`);
        }
    }

    join(channel) {
        this.frontendConnection.write(
                this.frontendConnection.protocol.newSocketJoinRoomsEvent(
                        this.id, [channel]
                )
        );
    }

    leave(room) {
        this.frontendConnection.write(
                this.frontendConnection.protocol.newSocketLeaveRoomsEvent(
                        this.id, [room]
                )
        );
    }

    disconnect() {
        this.frontendConnection.write(
                this.frontendConnection.protocol.newSocketKickEvent(this.id)
        );
    }
}
