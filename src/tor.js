import https from 'https';
import path from 'path';
import fs from 'fs';
import Promise from 'bluebird';

Promise.promisifyAll(fs);

const LOGGER = require('@calzoneman/jsli')('torlist');
const TOR_EXIT_LIST_URL = 'https://check.torproject.org/exit-addresses';
const TOR_EXIT_LIST_FILE = path.join(__dirname, '..', 'tor-exit-list.json');
const ONE_DAY = 24 * 3600 * 1000;
const TOR_EXIT_IPS = new Set();

function loadTorList() {
    return fs.statAsync(TOR_EXIT_LIST_FILE).then(stats => {
        if (new Date() - stats.mtime > ONE_DAY) {
            LOGGER.info('Tor exit node list is older than 24h, re-downloading from %s',
                    TOR_EXIT_LIST_URL);
            return loadTorListFromWebsite();
        } else {
            return loadTorListFromFile();
        }
    }).catch(error => {
        if (error.code === 'ENOENT') {
            LOGGER.info('File %s not found, downloading from %s',
                    TOR_EXIT_LIST_FILE,
                    TOR_EXIT_LIST_URL);
            return loadTorListFromWebsite();
        } else {
            throw error;
        }
    });
}

function loadTorListFromWebsite() {
    return new Promise((resolve, reject) => {
        https.get(TOR_EXIT_LIST_URL, res => {
            if (res.statusCode !== 200) {
                reject(new Error(`${res.statusCode} ${res.statusMessage}`));
                return;
            }

            let buffer = '';
            res.on('data', data => buffer += data);
            res.on('end', () => {
                const exitNodes = buffer.split('\n').filter(line => {
                    return /^ExitAddress/.test(line);
                }).map(line => {
                    return line.split(' ')[1];
                });

                fs.writeFileAsync(TOR_EXIT_LIST_FILE, JSON.stringify(exitNodes))
                        .then(() => {
                            LOGGER.info('Saved %s', TOR_EXIT_LIST_FILE);
                        }).catch(error => {
                            LOGGER.error('Unable to save %s: %s',
                                    TOR_EXIT_LIST_FILE,
                                    error.message);
                        });
                resolve(exitNodes);
            });
        }).on('error', error => {
            reject(error);
        });
    });
}

function loadTorListFromFile() {
    LOGGER.info('Loading Tor exit list from %s', TOR_EXIT_LIST_FILE);
    return fs.readFileAsync(TOR_EXIT_LIST_FILE).then(contents => {
        return JSON.parse(String(contents));
    });
}

loadTorList().then(exits => {
    TOR_EXIT_IPS.clear();
    exits.forEach(exit => {
        TOR_EXIT_IPS.add(exit);
    });
}).catch(error => {
    LOGGER.error('Unable to load Tor exit list: %s', error.stack);
});

export function isTorExit(ip) {
    return TOR_EXIT_IPS.has(ip);
}
