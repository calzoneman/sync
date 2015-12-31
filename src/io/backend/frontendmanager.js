import ioServer from '../ioserver';
import ProxiedSocket from './proxiedsocket';

export default class FrontendManager {
    constructor(socketEmitter) {
        this.socketEmitter = socketEmitter;
        this.frontendConnections = {};
        this.frontendProxiedSockets = {};
    }

    onConnection(socket) {
        if (this.frontendConnections.hasOwnProperty(socket.endpoint)) {
            // TODO: do some validation, maybe check if the socket is still connected?
            throw new Error();
        }

        this.frontendConnections[socket.endpoint] = socket;
        socket.on('SocketConnectEvent', this.onSocketConnect.bind(this, socket));
        socket.on('SocketFrameEvent', this.onSocketFrame.bind(this, socket));
    }

    onSocketConnect(frontendConnection, socketID, socketIP, socketUser) {
        const mapKey = frontendConnection.endpoint;
        const proxiedSocket = new ProxiedSocket(
                socketID,
                socketIP,
                socketUser,
                this.socketEmitter,
                frontendConnection);

        if (!this.frontendProxiedSockets.hasOwnProperty(mapKey)) {
            this.frontendProxiedSockets[mapKey] = {};
        } else if (this.frontendProxiedSockets[mapKey].hasOwnProperty(socketID)) {
            // TODO: Handle this gracefully
            throw new Error();
        }

        this.frontendProxiedSockets[mapKey][socketID] = proxiedSocket;
        ioServer.handleConnection(proxiedSocket);
    }

    onSocketFrame(frontendConnection, socketID, event, args) {
        const mapKey = frontendConnection.endpoint;
        const socketMap = this.frontendProxiedSockets[mapKey];
        if (!socketMap || !socketMap.hasOwnProperty(socketID)) {
            // TODO
            throw new Error();
        }

        const socket = socketMap[socketID];
        socket.onProxiedEventReceived.apply(socket, [event].concat(args));
    }
}
