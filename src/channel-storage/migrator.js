import Config from '../config';
import Promise from 'bluebird';
import db from '../database';
import { FileStore } from './filestore';
import { DatabaseStore } from './dbstore';

const QUERY_CHANNEL_NAMES = 'SELECT name FROM channels WHERE 1';

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
    return data;
}

function migrate(src, dest) {
    return src.listChannels().then(names => {
        return Promise.reduce(names, (_, name) => {
            // A long time ago there was a bug where CyTube would save a different
            // chandump depending on the capitalization of the channel name in the URL.
            // This was fixed, but there are still some really old chandumps with
            // uppercase letters in the name.
            //
            // If another chandump exists which is all lowercase, then that one is
            // canonical.  Otherwise, it's safe to just lowercase the name and convert
            // it.
            if (name !== name.toLowerCase()) {
                if (names.indexOf(name.toLowerCase()) >= 0) {
                    return Promise.resolve();
                } else {
                    name = name.toLowerCase();
                }
            }

            return src.load(name).then(data => {
                data = fixOldChandump(data);
                return dest.save(name, data);
            }).then(() => {
                console.log(`Migrated /r/${name}`);
            }).catch(err => {
                console.error(`Failed to migrate /r/${name}: ${err.stack}`);
            });
        });
    });
}

function main() {
    Config.load('config.yaml');
    db.init();
    const src = new FileStore();
    const dest = new DatabaseStore();

    migrate(src, dest).then(() => {
        console.log('Migration complete');
        process.exit(0);
    }).catch(err => {
        console.error(`Migration failed: ${err.stack}`);
        process.exit(1);
    });
}

main();
