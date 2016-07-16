#!/usr/bin/env node
/*
**  CyTube Service Socket Commandline
*/

var Config = require("./lib/config");
Config.load("config.yaml");

if(!Config.get("service-socket.enabled")){
    console.error('The Service Socket is not enabled.');
    process.exit(1);
}

const SOCKETFILE = Config.get("service-socket.socket");
var net = require('net');

var client = net.createConnection(SOCKETFILE)
    .on('connect', () => {
        console.log("Connected.");
    })
    .on('data', (msg) => {
        msg = msg.toString();

        if(msg === '__disconnect'){
            console.log('Server shutting down.');
            return cleanup();
        }

        // Generic message handler
        console.info('Server:', data)
    })
    .on('error', (data) => {
        console.error('Unable to connect to Service Socket.');
        process.exit(1);
    })
    ;

var inputbuffer = "";
process.stdin.on("data", (data) => {
    inputbuffer += data;
    if (inputbuffer.indexOf("\n") !== -1) {
        var line = inputbuffer.substring(0, inputbuffer.indexOf("\n"));
        inputbuffer = inputbuffer.substring(inputbuffer.indexOf("\n") + 1);
        // Let the client escape
        if(line === 'exit'){ return cleanup(); }
        if(line === 'quit'){ return cleanup(); }
        client.write(line);
    }
});

function cleanup(){
    console.log('\n',"Terminating.",'\n');
    client.end();
    process.exit(0);
}
process.on('SIGINT', cleanup);
