#!/usr/bin/env node

if (/^v0/.test(process.version)) {
    console.error('node.js ' + process.version + ' is not supported.  ' +
            'For more information, visit ' +
            'https://github.com/calzoneman/sync/wiki/CyTube-3.0-Installation-Guide#nodejs');
    process.exit(1);
}

const args = parseArgs();

if (args.has('--daemonize')) {
    fork();
} else {
    try {
        require('./lib/main');
    } catch (err) {
        console.error('FATAL: Failed to require() lib/main.js');
        handleStartupError(err);
    }
}

function fork() {
    try {
        console.log('Warning: --daemonize support is experimental.  Use with caution.');

        const { spawn } = require('child_process');
        const path = require('path');
        const main = path.resolve(__dirname, 'lib', 'main.js');

        const child = spawn(process.argv[0], [main], {
            detached: true,
            stdio: 'ignore' // TODO: support setting stdout/stderr logfile
        });

        child.unref();
        console.log('Forked with PID ' + child.pid);
    } catch (error) {
        console.error('FATAL: Failed to fork lib/main.js');
        handleStartupError(error);
    }
}

function handleStartupError(err) {
    if (/module version mismatch/i.test(err.message)) {
        console.error('Module version mismatch, try running `npm rebuild` or ' +
                      'removing the node_modules folder and re-running ' +
                      '`npm install`');
    } else {
        console.error('Possible causes:\n' +
                      '  * You haven\'t run `npm run build-server` to regenerate ' +
                      'the runtime\n' +
                      '  * You\'ve upgraded node/npm and haven\'t rebuilt dependencies ' +
                      '(try `npm rebuild` or `rm -rf node_modules && npm install`)\n' +
                      '  * A dependency failed to install correctly (check the output ' +
                      'of `npm install` next time)');
    }

    console.error(err.stack);
    process.exit(1);
}

function parseArgs() {
    const args = new Map();
    for (let i = 2; i < process.argv.length; i++) {
        if (/^--/.test(process.argv[i])) {
            let val;
            if (i+1 < process.argv.length) val = process.argv[i+1];
            else val = null;

            args.set(process.argv[i], val);
        }
    }

    return args;
}
