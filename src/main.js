import Config from './config';
import Switches from './switches';
import { isIP as validIP } from 'net';
import { eventlog } from './logger';
require('source-map-support').install();

const LOGGER = require('@calzoneman/jsli')('main');

Config.load('config.yaml');

const sv = require('./server').init();

if (!Config.get('debug')) {
    process.on('uncaughtException', error => {
        LOGGER.fatal('Uncaught exception: %s', error.stack);
    });

    process.on('SIGINT', () => {
        LOGGER.info('Caught SIGINT; shutting down');
        sv.shutdown();
    });
}

// TODO: this can probably just be part of servsock.js
// servsock should also be refactored to send replies instead of
// relying solely on tailing logs
function handleLine(line) {
    if (line === '/reload') {
        LOGGER.info('Reloading config');
        Config.load('config.yaml');
    } else if (line === '/gc') {
        if (global && global.gc) {
            LOGGER.info('Running GC');
            global.gc();
        } else {
            LOGGER.info('Failed to invoke GC: node started without --expose-gc');
        }
    } else if (line === '/delete_old_tables') {
        require('./database/update').deleteOldChannelTables(function (err) {
            if (!err) {
                LOGGER.info('Deleted old channel tables');
            }
        });
    } else if (line.indexOf('/switch') === 0) {
        const args = line.split(' ');
        args.shift();
        if (args.length === 1) {
            LOGGER.info('Switch ' + args[0] + ' is ' +
                    (Switches.isActive(args[0]) ? 'ON' : 'OFF'));
        } else if (args.length === 2) {
            Switches.setActive(args[0], args[1].toLowerCase() === 'on' ? true : false);
            LOGGER.info('Switch ' + args[0] + ' is now ' +
                    (Switches.isActive(args[0]) ? 'ON' : 'OFF'));
        }
    } else if (line.indexOf('/reload-partitions') === 0) {
        sv.reloadPartitionMap();
    } else if (line.indexOf('/globalban') === 0) {
        const args = line.split(/\s+/); args.shift();
        if (args.length >= 2 && validIP(args[0]) !== 0) {
            const ip = args.shift();
            const comment = args.join(' ');
            // TODO: this is broken by the knex refactoring
            require('./database').globalBanIP(ip, comment, function (err, res) {
                if (!err) {
                    eventlog.log('[acp] ' + 'SYSTEM' + ' global banned ' + ip);
                }
            })
        }
    } else if (line.indexOf('/unglobalban') === 0) {
        var args = line.split(/\s+/); args.shift();
        if (args.length >= 1 && validIP(args[0]) !== 0) {
            var ip = args.shift();
            // TODO: this is broken by the knex refactoring
            require('./database').globalUnbanIP(ip, function (err, res) {
                if (!err) {
                    eventlog.log('[acp] ' + 'SYSTEM' + ' un-global banned ' + ip);
                }
            })
        }
    } else if (line.indexOf('/unloadchan') === 0) {
        const args = line.split(/\s+/); args.shift();
        if (args.length) {
            const name = args.shift();
            const chan = sv.getChannel(name);
            const users = Array.prototype.slice.call(chan.users);
            chan.emit('empty');
            users.forEach(function (u) {
                u.kick('Channel shutting down');
            });
            eventlog.log('[acp] ' + 'SYSTEM' + ' forced unload of ' + name);
        }
    } else if (line.indexOf('/reloadcert') === 0) {
        sv.reloadCertificateData();
    }
}

// Go Go Gadget Service Socket
if (Config.get('service-socket.enabled')) {
    LOGGER.info('Opening service socket');
    const ServiceSocket = require('./servsock');
    const sock = new ServiceSocket();
    sock.init(handleLine, Config.get('service-socket.socket'));
}

let stdinbuf = '';
process.stdin.on('data', function (data) {
    stdinbuf += data;
    if (stdinbuf.indexOf('\n') !== -1) {
        let line = stdinbuf.substring(0, stdinbuf.indexOf('\n'));
        stdinbuf = stdinbuf.substring(stdinbuf.indexOf('\n') + 1);
        handleLine(line);
    }
});

// Hi I'm Mr POSIX! Look at me!
process.on('SIGUSR2', () => {
    sv.reloadCertificateData();
});

require('bluebird');
process.on('unhandledRejection', function (reason, promise) {
    LOGGER.fatal('Unhandled rejection: %s', reason.stack);
});
