import { eventlog } from '../logger';
const LOGGER = require('@calzoneman/jsli')('BannedChannelsController');

export class BannedChannelsController {
    constructor(dbChannels, globalMessageBus) {
        this.dbChannels = dbChannels;
        this.globalMessageBus = globalMessageBus;
    }

    /*
     * TODO: add an audit log to the database
     */

    async banChannel({ name, externalReason, internalReason, bannedBy }) {
        LOGGER.info(`Banning channel ${name} (banned by ${bannedBy})`);
        eventlog.log(`[acp] ${bannedBy} banned channel ${name}`);

        let banInfo = await this.dbChannels.getBannedChannel(name);
        if (banInfo !== null) {
            LOGGER.warn(`Channel ${name} is already banned, updating ban reason`);
        }

        await this.dbChannels.putBannedChannel({
            name,
            externalReason,
            internalReason,
            bannedBy
        });

        this.globalMessageBus.emit(
            'ChannelBanned',
            { channel: name, externalReason }
        );
    }

    async unbanChannel(name, unbannedBy) {
        LOGGER.info(`Unbanning channel ${name}`);
        eventlog.log(`[acp] ${unbannedBy} unbanned channel ${name}`);

        this.globalMessageBus.emit(
            'ChannelUnbanned',
            { channel: name }
        );

        await this.dbChannels.removeBannedChannel(name);
    }

    async getBannedChannel(name) {
        // TODO: cache
        return this.dbChannels.getBannedChannel(name);
    }
}

class Cache {
    constructor({ maxElem, maxAge }) {
        this.maxElem = maxElem;
        this.maxAge = maxAge;
        this.cache = new Map();
    }

    put(key, value) {
        this.cache.set(key, { value: value, at: Date.now() });

        if (this.cache.size > this.maxElem) {
            this.cache.delete(this.cache.keys().next());
        }
    }

    get(key) {
        let val = this.cache.get(key);

        if (val != null) {
            return val.value;
        } else {
            return null;
        }
    }

    delete(key) {
        this.cache.delete(key);
    }

    cleanup() {
        let now = Date.now();

        for (let [key, value] of this.cache) {
            if (value.at < now - this.maxAge) {
                this.cache.delete(key);
            }
        }
    }
}
