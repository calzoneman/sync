import Config from './config';
import * as Switches from './switches';
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

let profileName = null;

// TODO: this can probably just be part of servsock.js
// servsock should also be refactored to send replies instead of
// relying solely on tailing logs
function handleLine(line) {
    if (line === '/reload') {
        LOGGER.info('Reloading config');
        Config.load('config.yaml');
        require('./web/pug').clearCache();
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
            require('./database').globalBanIP(ip, comment, function (err, _res) {
                if (!err) {
                    eventlog.log('[acp] ' + 'SYSTEM' + ' global banned ' + ip);
                }
            });
        }
    } else if (line.indexOf('/unglobalban') === 0) {
        var args = line.split(/\s+/); args.shift();
        if (args.length >= 1 && validIP(args[0]) !== 0) {
            var ip = args.shift();
            // TODO: this is broken by the knex refactoring
            require('./database').globalUnbanIP(ip, function (err, _res) {
                if (!err) {
                    eventlog.log('[acp] ' + 'SYSTEM' + ' un-global banned ' + ip);
                }
            });
        }
    } else if (line.indexOf('/save') === 0) {
        sv.forceSave();
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
    } else if (line.indexOf('/profile') === 0) {
        try {
            const fs = require('fs');
            const path = require('path');
            const profiler = require('v8-profiler');

            if (profileName !== null) {
                const filename = path.resolve(
                    __dirname,
                    '..',
                    `${profileName}.cpuprofile`
                );
                const profile = profiler.stopProfiling(profileName);
                profileName = null;

                const stream = profile.export();
                stream.on('error', error => {
                    LOGGER.error('Error exporting profile: %s', error);
                    profile.delete();
                });
                stream.on('finish', () => {
                    LOGGER.info('Exported profile to %s', filename);
                    profile.delete();
                });

                stream.pipe(fs.createWriteStream(filename));
            } else {
                profileName = `prof_${Date.now()}`;
                profiler.startProfiling(profileName, true);
                LOGGER.info('Started CPU profile');
            }
        } catch (error) {
            LOGGER.error('Unable to record CPU profile: %s', error);
        }
    }
}

// Go Go Gadget Service Socket
if (Config.get('service-socket.enabled')) {
    LOGGER.info('Opening service socket');
    const ServiceSocket = require('./servsock');
    const sock = new ServiceSocket();
    sock.init(
        line => {
            try {
                handleLine(line);
            } catch (error) {
                LOGGER.error(
                    'Error in UNIX socket command handler: %s',
                    error.stack
                );
            }
        },
        Config.get('service-socket.socket')
    );
}

let stdinbuf = '';
process.stdin.on('data', function (data) {
    stdinbuf += data;
    if (stdinbuf.indexOf('\n') !== -1) {
        let line = stdinbuf.substring(0, stdinbuf.indexOf('\n'));
        stdinbuf = stdinbuf.substring(stdinbuf.indexOf('\n') + 1);
        try {
            handleLine(line);
        } catch (error) {
            LOGGER.error('Command line input handler failed: %s', error.stack);
        }
    }
});

// Hi I'm Mr POSIX! Look at me!
process.on('SIGUSR2', () => {
    sv.reloadCertificateData();
});

require('bluebird');
process.on('unhandledRejection', function (reason, _promise) {
    LOGGER.error('Unhandled rejection: %s', reason.stack);
});
