#!/usr/bin/env node
/*
**  CyTube Service Socket Commandline
*/

const readline = require('readline');
const spawn = require('child_process').spawn;
const util = require('util');
const net = require('net');
const fs = require('fs');

const COMPLETIONS = [
    "/delete_old_tables",
    "/gc",
    "/globalban",
    "/reload",
    "/reloadcert",
    "/reload-partitions",
    "/switch",
    "/unglobalban",
    "/unloadchan"
];

var Config = require("./lib/config");
Config.load("config.yaml");

if(!Config.get("service-socket.enabled")){
    console.error('The Service Socket is not enabled.');
    process.exit(1);
}

const SOCKETFILE = Config.get("service-socket.socket");

// Wipe the TTY
process.stdout.write('\x1Bc');

var commandline, eventlog, syslog, errorlog;
var client = net.createConnection(SOCKETFILE).on('connect', () => {
        commandline = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            completer: tabcomplete
        });
        commandline.setPrompt("> ", 2);
        commandline.on("line", function(line) {
            if(line === 'exit'){ return cleanup(); }
            if(line === 'quit'){ return cleanup(); }
            if(line.match(/^\/globalban/) && line.split(/\s+/).length === 2){
                console.log('You must provide a reason')
                return commandline.prompt();
            }
            client.write(line);
            commandline.prompt();
        });
        commandline.on('close', function() {
            return cleanup();
        });
        commandline.on("SIGINT", function() {
            commandline.clearLine();
            commandline.question("Terminate connection? ", function(answer) {
                return answer.match(/^y(es)?$/i) ? cleanup() : commandline.output.write("> ");
            });
        });
        commandline.prompt();

        console.log = function() { cmdouthndlr("log", arguments); }
        console.warn = function() { cmdouthndlr("warn", arguments); }
        console.error = function() { cmdouthndlr("error", arguments); }
        // console.info is reserved in this script for the exit message
        // this prevents an extraneous final prompt from readline on terminate

        eventlog = spawn('tail', ['-f', 'events.log']);
        eventlog.stdout.on('data', function (data) {
            console.log(data.toString().replace(/^(.+)$/mg, 'events: $1'));
        });

        syslog = spawn('tail', ['-f', 'sys.log']);
        syslog.stdout.on('data', function (data) {
            console.log(data.toString().replace(/^(.+)$/mg, 'sys:    $1'));
        });

        errorlog = spawn('tail', ['-f', 'error.log']);
        errorlog.stdout.on('data', function (data) {
            console.log(data.toString().replace(/^(.+)$/mg, 'error:    $1'));
        });

    }).on('data', (msg) => {
        msg = msg.toString();

        if(msg === '__disconnect'){
            console.log('Server shutting down.');
            return cleanup();
        }

        // Generic message handler
        console.log('server: ', data)

    }).on('error', (data) => {
        console.error('Unable to connect to Service Socket.', data);
        process.exit(1);
    });

function cmdouthndlr(type, args) {
    var t = Math.ceil((commandline.line.length + 3) / process.stdout.columns);
    var text = util.format.apply(console, args);
    commandline.output.write("\n\x1B[" + t + "A\x1B[0J");
    commandline.output.write(text + "\n");
    commandline.output.write(Array(t).join("\n\x1B[E"));
    commandline._refreshLine();
}

function cleanup(){
    console.info('\n',"Terminating.",'\n');
    eventlog.kill('SIGTERM');
    syslog.kill('SIGTERM');
    client.end();
    process.exit(0);
}

function tabcomplete(line) {
    return [COMPLETIONS.filter((cv)=>{ return cv.indexOf(line) == 0; }), line];
}
