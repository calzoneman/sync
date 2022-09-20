import { eventlog } from '../logger';
import { SimpleCache } from '../util/simple-cache';
const LOGGER = require('@calzoneman/jsli')('BannedChannelsController');

export class BannedChannelsController {
    constructor(dbChannels, globalMessageBus) {
        this.dbChannels = dbChannels;
        this.globalMessageBus = globalMessageBus;
        this.cache = new SimpleCache({
            maxElem: 1000,
            maxAge: 5 * 60_000
        });
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

        this.cache.delete(name);

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
        this.cache.delete(name);

        this.globalMessageBus.emit(
            'ChannelUnbanned',
            { channel: name }
        );

        await this.dbChannels.removeBannedChannel(name);
    }

    async getBannedChannel(name) {
        name = name.toLowerCase();

        let info = this.cache.get(name);
        if (info === null) {
            info = await this.dbChannels.getBannedChannel(name);
            this.cache.put(name, info);
        }

        return info;
    }
}
