import Promise from 'bluebird';

import Config from '../config';
import db from '../database';
import { DatabaseStore } from './dbstore';
import { syslog } from '../logger';
syslog.log = () => undefined;

function main() {
    Config.load('config.yaml');
    db.init();
    const dbStore = new DatabaseStore();

    Promise.delay(1000).then(() => {
        return dbStore.load(process.argv[2]);
    }).then((data) => {
        console.log(JSON.stringify(data, null, 4));
        process.exit(0);
    }).catch((err) => {
        console.error(`Error retrieving channel data: ${err.stack}`);
        process.exit(1);
    });
}

main();
