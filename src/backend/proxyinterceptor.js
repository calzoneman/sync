import logger from 'cytube-common/lib/logger';
import ioServer from '../io/ioserver';
import ProxiedSocket from './proxiedsocket';

export default class ProxyInterceptor {
    constructor(socketEmitter) {
        this.socketEmitter = socketEmitter;
        this.frontendConnections = {};
        this.frontendProxiedSockets = {};
    }

    /**
     * Handle a new frontend proxy connection.
     *
     * @param {Connection} socket frontend proxy connection
     */
    onConnection(socket) {
        if (this.frontendConnections.hasOwnProperty(socket.endpoint)) {
            logger.error(`Duplicate frontend connection: ${socket.endpoint}`);
            return;
        }

        logger.info(`Got proxy connection from ${socket.endpoint}`);
        this.frontendConnections[socket.endpoint] = socket;
        socket.on('close', this.onFrontendDisconnect.bind(this, socket));
        socket.on('SocketConnectEvent', this.onSocketConnect.bind(this, socket));
        socket.on('SocketFrameEvent', this.onSocketFrame.bind(this, socket));
        socket.on('SocketDisconnectEvent', this.onSocketDisconnect.bind(this, socket));
    }

    onFrontendDisconnect(socket) {
        const endpoint = socket.endpoint;
        if (this.frontendConnections.hasOwnProperty(endpoint)) {
            if (this.frontendProxiedSockets.hasOwnProperty(endpoint)) {
                logger.warn(`Frontend ${endpoint} disconnected`);
                for (const key in this.frontendProxiedSockets[endpoint]) {
                    const proxySocket = this.frontendProxiedSockets[endpoint][key];
                    proxySocket.onProxiedEventReceived('disconnect');
                }
                delete this.frontendProxiedSockets[endpoint];
            }
            delete this.frontendConnections[endpoint];
        }
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
            logger.error(`Duplicate SocketConnectEvent for ${socketID}`);
            return;
        }

        this.frontendProxiedSockets[mapKey][socketID] = proxiedSocket;
        ioServer.handleConnection(proxiedSocket);
    }

    onSocketFrame(frontendConnection, socketID, event, args) {
        const mapKey = frontendConnection.endpoint;
        const socketMap = this.frontendProxiedSockets[mapKey];
        if (!socketMap || !socketMap.hasOwnProperty(socketID)) {
            logger.error(`Received SocketFrameEvent for nonexistent socket`,
                    { socketID, event });
            return;
        }

        const socket = socketMap[socketID];
        socket.onProxiedEventReceived.apply(socket, [event].concat(args));
    }

    onSocketDisconnect(frontendConnection, socketID) {
        const mapKey = frontendConnection.endpoint;
        const socketMap = this.frontendProxiedSockets[mapKey];
        if (!socketMap || !socketMap.hasOwnProperty(socketID)) {
            logger.error(`Received SocketDisconnectEvent for nonexistent socket`,
                    { socketID });
            return;
        }

        const socket = socketMap[socketID];
        socket.onProxiedEventReceived.apply(socket, ['disconnect']);
    }
}
