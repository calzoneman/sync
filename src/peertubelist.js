import { fetchPeertubeDomains, setDomains } from '@cytube/mediaquery/lib/provider/peertube';
import { stat, readFile, writeFile } from 'node:fs/promises';
import path from 'path';
import Config from './config';

const LOGGER = require('@calzoneman/jsli')('peertubelist');
const ONE_DAY = 24 * 3600 * 1000;
const FILENAME = path.join(__dirname, '..', 'peertube-hosts.json');

function normalizeHost(host) {
    if (typeof host !== 'string') {
        return '';
    }

    let value = host.trim().toLowerCase();
    // Allow pasting full URLs in config by accident.
    value = value.replace(/^https?:\/\//, '');
    value = value.replace(/[/?#].*$/, '');
    value = value.replace(/:\d+$/, '');
    return value;
}

/**
 * Merge operator-configured hosts into the upstream joinpeertube.org list.
 * Extras are applied at load time only (not written into the cache file), so a
 * refresh of the upstream list cannot drop them.
 */
function applyExtraHosts(hosts) {
    const extras = Config.getProvidersConfig().getPeertubeDomainExtras();
    if (!Array.isArray(extras) || extras.length === 0) {
        return hosts;
    }

    const merged = new Set(hosts);
    let added = 0;
    for (const raw of extras) {
        const host = normalizeHost(raw);
        if (!host || merged.has(host)) {
            continue;
        }
        merged.add(host);
        added++;
    }

    if (added > 0) {
        LOGGER.info(
            'Added %d peertube host(s) from peertube-domain-extras',
            added
        );
    }

    return Array.from(merged);
}

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

        const hosts = applyExtraHosts(JSON.parse(await readFile(FILENAME)));
        setDomains(hosts);
        LOGGER.info('PeerTube allowlist ready (%d hosts)', hosts.length);
    } catch (error) {
        LOGGER.error('Failed to initialize peertube host list: %s', error.stack);
    }
}
