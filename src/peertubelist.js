import { fetchPeertubeDomains, setDomains } from '@cytube/mediaquery/lib/provider/peertube';
import { stat, readFile, writeFile } from 'node:fs/promises';
import path from 'path';

const LOGGER = require('@calzoneman/jsli')('peertubelist');
const ONE_DAY = 24 * 3600 * 1000;
const FILENAME = path.join(__dirname, '..', 'peertube-hosts.json');

export async function setupPeertubeDomains() {
    try {
        let mtime;
        try {
            mtime = (await stat(FILENAME)).mtime;
        } catch (_error) {
            mtime = 0;
        }

        if (Date.now() - mtime > ONE_DAY) {
            LOGGER.info('Updating peertube host list');
            const hosts = await fetchPeertubeDomains();
            await writeFile(FILENAME, JSON.stringify(hosts));
        }

        const hosts = JSON.parse(await readFile(FILENAME));
        setDomains(hosts);
    } catch (error) {
        LOGGER.error('Failed to initialize peertube host list: %s', error.stack);
    }
}
