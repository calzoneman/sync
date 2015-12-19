import Config from '../config';
import Promise from 'bluebird';
import db from '../database';
import { FileStore } from './filestore';
import { DatabaseStore } from './dbstore';
import { sanitizeHTML } from '../xss';
import { ChannelNotFoundError } from '../errors';

const QUERY_CHANNEL_NAMES = 'SELECT name FROM channels WHERE 1';
const EXPECTED_KEYS = [
    'chatbuffer',
    'chatmuted',
    'css',
    'emotes',
    'filters',
    'js',
    'motd',
    'openPlaylist',
    'opts',
    'permissions',
    'playlist',
    'poll'
];

function queryAsync(query, substitutions) {
    return new Promise((resolve, reject) => {
        db.query(query, substitutions, (err, res) => {
            if (err) {
                if (!(err instanceof Error)) {
                    err = new Error(err);
                }
                reject(err);
            } else {
                resolve(res);
            }
        });
    });
}

function fixOldChandump(data) {
    const converted = {};
    EXPECTED_KEYS.forEach(key => {
        converted[key] = data[key];
    });

    if (data.queue) {
        converted.playlist = {
            pl: data.queue.map(item => {
                return {
                    media: {
                        id: item.id,
                        title: item.title,
                        seconds: item.seconds,
                        duration: item.duration,
                        type: item.type,
                        meta: {}
                    },
                    queueby: item.queueby,
                    temp: item.temp
                };
            }),
            pos: data.position,
            time: data.currentTime
        };
    }

    if (data.hasOwnProperty('openqueue')) {
        converted.openPlaylist = data.openqueue;
    }

    if (data.hasOwnProperty('playlistLock')) {
        converted.openPlaylist = !data.playlistLock;
    }

    if (data.chatbuffer) {
        converted.chatbuffer = data.chatbuffer.map(entry => {
            return {
                username: entry.username,
                msg: entry.msg,
                meta: entry.meta || {
                    addClass: entry.msgclass ? entry.msgclass : undefined
                },
                time: entry.time
            };
        });
    }

    if (data.motd && data.motd.motd) {
        converted.motd = sanitizeHTML(data.motd.motd).replace(/\n/g, '<br>\n');
    }

    if (data.opts && data.opts.customcss) {
        converted.opts.externalcss = data.opts.customcss;
    }

    if (data.opts && data.opts.customjs) {
        converted.opts.externaljs = data.opts.customjs;
    }

    if (data.filters && data.filters.length > 0 && Array.isArray(data.filters[0])) {
        converted.filters = data.filters.map(filter => {
            let [source, replace, active] = filter;
            return {
                source: source,
                replace: replace,
                flags: 'g',
                active: active,
                filterlinks: false
            };
        });
    }

    return converted;
}

function migrate(src, dest, opts) {
    return src.listChannels().then(names => {
        return Promise.reduce(names, (_, name) => {
            // A long time ago there was a bug where CyTube would save a different
            // chandump depending on the capitalization of the channel name in the URL.
            // This was fixed, but there are still some really old chandumps with
            // uppercase letters in the name.
            //
            // If another chandump exists which is all lowercase, then that one is
            // canonical.  Otherwise, it's safe to load the existing capitalization,
            // convert it, and save.
            if (name !== name.toLowerCase()) {
                if (names.indexOf(name.toLowerCase()) >= 0) {
                    return Promise.resolve();
                }
            }

            return src.load(name).then(data => {
                data = fixOldChandump(data);
                Object.keys(data).forEach(key => {
                    if (opts.keyWhitelist.length > 0 &&
                            opts.keyWhitelist.indexOf(key) < 0) {
                        delete data[key];
                    } else if (opts.keyBlacklist.length > 0 &&
                            opts.keyBlacklist.indexOf(key) >= 0) {
                        delete data[key];
                    }
                });
                return dest.save(name, data);
            }).then(() => {
                console.log(`Migrated /r/${name}`);
            }).catch(ChannelNotFoundError, err => {
                console.log(`Skipping /r/${name} (not present in the database)`);
            }).catch(err => {
                console.error(`Failed to migrate /r/${name}: ${err.stack}`);
            });
        }, 0);
    });
}

function loadOpts(argv) {
    const opts = {
        keyWhitelist: [],
        keyBlacklist: []
    };

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '-w') {
            opts.keyWhitelist = (argv[i+1] || '').split(',');
            i++;
        } else if (argv[i] === '-b') {
            opts.keyBlacklist = (argv[i+1] || '').split(',');
            i++;
        }
    }

    return opts;
}

function main() {
    Config.load('config.yaml');
    db.init();
    const src = new FileStore();
    const dest = new DatabaseStore();
    const opts = loadOpts(process.argv.slice(2));

    Promise.delay(1000).then(() => {
        return migrate(src, dest, opts);
    }).then(() => {
        console.log('Migration complete');
        process.exit(0);
    }).catch(err => {
        console.error(`Migration failed: ${err.stack}`);
        process.exit(1);
    });
}

main();
