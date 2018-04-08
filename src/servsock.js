var fs = require('fs');
var net = require('net');

/* eslint no-console: off */

export default class ServiceSocket {

    constructor() {
        this.connections = {};
    }

    init(handler, socket){
        this.handler = handler;
        this.socket = socket;

        fs.stat(this.socket, (err, _stats) => {
            if (err) {
                return this.openServiceSocket();
            }
            fs.unlink(this.socket, (err) => {
                if(err){
                    console.error(err); process.exit(0);
                }
                return this.openServiceSocket();
            });
        });
    }

    openServiceSocket(){
        this.server = net.createServer((stream) => {
            let id = Date.now();
            this.connections[id] = stream;
            stream.on('end', () => {
                delete this.connections[id];
            });
            stream.on('data', (msg) => {
                this.handler(msg.toString());
            });
        }).listen(this.socket);
        process.on('exit', this.closeServiceSocket.bind(this));
    }

    closeServiceSocket() {
        if(Object.keys(this.connections).length){
            let clients = Object.keys(this.connections);
            while(clients.length){
                let client = clients.pop();
                this.connections[client].write('__disconnect');
                this.connections[client].end();
            }
        }
        this.server.close();
    }

}
