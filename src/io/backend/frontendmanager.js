import ioServer from '../ioserver';
import ProxiedSocket from './proxiedsocket';

export default class FrontendManager {
    constructor(socketEmitter) {
        this.socketEmitter = socketEmitter;
        this.frontendConnections = {};
        this.frontendProxiedSockets = {};
    }

    onConnection(socket) {
        if (this.frontendConnections.hasOwnProperty(socket.remoteAddressAndPort)) {
            // TODO: do some validation, maybe check if the socket is still connected?
            throw new Error();
        }

        this.frontendConnections[socket.remoteAddressAndPort] = socket;
        socket.on('data', this.onData.bind(this, socket));
    }

    onData(socket, data) {
        switch (data.$type) {
            case 'socketConnect':
                this.onSocketConnect(socket, data);
                break;
            case 'socketFrame':
                this.onSocketFrame(socket, data);
                break;
        }
    }

    onSocketConnect(frontendConnection, data) {
        const mapKey = frontendConnection.remoteAddressAndPort;
        const proxiedSocket = new ProxiedSocket(
                data.socketID,
                data.socketData,
                this.socketEmitter,
                frontendConnection);

        if (!this.frontendProxiedSockets.hasOwnProperty(mapKey)) {
            this.frontendProxiedSockets[mapKey] = {};
        } else if (this.frontendProxiedSockets[mapKey].hasOwnProperty(data.socketID)) {
            // TODO: Handle this gracefully
            throw new Error();
        }

        this.frontendProxiedSockets[mapKey][data.socketID] = proxiedSocket;
        ioServer.handleConnection(proxiedSocket);
    }

    onSocketFrame(frontendConnection, data) {
        const mapKey = frontendConnection.remoteAddressAndPort;
        const socketMap = this.frontendProxiedSockets[mapKey];
        if (!socketMap || !socketMap.hasOwnProperty(data.socketID)) {
            // TODO
            throw new Error();
        }

        const socket = socketMap[data.socketID];
        socket.onProxiedEventReceived.apply(socket, [data.event].concat(data.args));
    }
}
