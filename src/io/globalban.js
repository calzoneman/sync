import { getIPRange, getWideIPRange } from '../utilities';

const LOGGER = require('@calzoneman/jsli')('CachingGlobalBanlist');

class CachingGlobalBanlist {
    constructor(globalBanDB) {
        this.globalBanDB = globalBanDB;
        this.cache = new Set();
        this.cacheTimer = null;
    }

    refreshCache() {
        return this.globalBanDB.listGlobalBans().then(bans => {
            this.cache.clear();
            bans.forEach(ban => {
                this.cache.add(ban.ip);
            });
        }).catch(error => {
            LOGGER.error('Unable to refresh global banlist cache: %s', error.stack);
        });
    }

    startCacheTimer(interval) {
        clearInterval(this.cacheTimer);
        this.cacheTimer = setInterval(this.refreshCache.bind(this), interval);
    }

    isIPGlobalBanned(ip) {
        return this.cache.has(ip)
                || this.cache.has(getIPRange(ip))
                || this.cache.has(getWideIPRange(ip));
    }
}

export { CachingGlobalBanlist };
