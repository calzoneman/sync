const LOGGER = require('@calzoneman/jsli')('BannedChannelsController');

export class BannedChannelsController {
    constructor(dbChannels, globalMessageBus) {
        this.dbChannels = dbChannels;
        this.globalMessageBus = globalMessageBus;
    }

    async banChannel({ name, externalReason, internalReason, bannedBy }) {
        LOGGER.info(`Banning channel ${name} (banned by ${bannedBy})`);

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
}
