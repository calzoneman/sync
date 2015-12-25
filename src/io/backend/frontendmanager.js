export default class FrontendManager {
    constructor() {
        this.frontendConnections = {};
    }

    onConnection(socket) {
        if (this.frontendConnections.hasOwnProperty(socket.remoteAddress)) {
            // TODO: do some validation, maybe check if the socket is still connected?
            throw new Error();
        }

        this.frontendConnections[socket.remoteAddressAndPort] = socket;
        console.log(socket.remoteAddressAndPort);
        socket.on('data', this.onData.bind(this, socket));
    }

    onData(socket, data) {
        console.log(data);
    }
}
