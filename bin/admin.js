#!/usr/bin/env node

const Config = require('../lib/config');
Config.load('config.yaml');

if (!Config.get('service-socket.enabled')){
    console.error('The Service Socket is not enabled.');
    process.exit(1);
}

const net = require('net');
const path = require('path');
const readline = require('node:readline/promises');

const socketPath = path.resolve(__dirname, '..', Config.get('service-socket.socket'));
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function doCommand(params) {
    return new Promise((resolve, reject) => {
        const client = net.createConnection(socketPath);

        client.on('connect', () => {
            client.write(JSON.stringify(params) + '\n');
        });

        client.on('data', data => {
            client.end();
            resolve(JSON.parse(data));
        });

        client.on('error', error => {
            reject(error);
        });
    });
}

let commands = [
    {
        command: 'ban-channel',
        handler: async args => {
            if (args.length !== 3) {
                console.log('Usage: ban-channel <name> <externalReason> <internalReason>');
                process.exit(1);
            }

            let [name, externalReason, internalReason] = args;
            let answer = await rl.question(`Ban ${name} with external reason "${externalReason}" and internal reason "${internalReason}"? `);


            if (/^[yY]$/.test(answer)) {
                let res = await doCommand({
                    command: 'ban-channel',
                    name,
                    externalReason,
                    internalReason
                });

                console.log(`Status: ${res.status}`);
                if (res.status === 'error') {
                    console.log('Error:', res.error);
                    process.exit(1);
                } else {
                    process.exit(0);
                }
            } else {
                console.log('Aborted.');
            }
        }
    }
];

let found = false;
commands.forEach(cmd => {
    if (cmd.command === process.argv[2]) {
        found = true;
        cmd.handler(process.argv.slice(3)).then(() => {
            process.exit(0);
        }).catch(error => {
            console.log('Error in command:', error.stack);
        });
    }
});

if (!found) {
    console.log('Available commands:');
    commands.forEach(cmd => {
        console.log(`  * ${cmd.command}`);
    });
    process.exit(1);
}
