const assert = require('assert');
const { BannedChannelsController } = require('../../lib/controller/banned-channels');
const dbChannels = require('../../lib/database/channels');
const testDB = require('../testutil/db').testDB;
const { EventEmitter } = require('events');

require('../../lib/database').init(testDB);

const testBan = {
    name: 'ban_test_1',
    externalReason: 'because I said so',
    internalReason: 'illegal content',
    bannedBy: 'admin'
};

async function cleanupTestBan() {
    return dbChannels.removeBannedChannel(testBan.name);
}

describe('BannedChannelsController', () => {
    let controller;
    let messages;

    beforeEach(async () => {
        await cleanupTestBan();
        messages = new EventEmitter();
        controller = new BannedChannelsController(
            dbChannels,
            messages
        );
    });

    afterEach(async () => {
        await cleanupTestBan();
    });

    it('bans a channel', async () => {
        assert.strictEqual(await controller.getBannedChannel(testBan.name), null);

        let received = null;
        messages.once('ChannelBanned', cb => {
            received = cb;
        });

        await controller.banChannel(testBan);
        let info = await controller.getBannedChannel(testBan.name);
        for (let field of Object.keys(testBan)) {
            // Consider renaming parameter to avoid this branch
            if (field === 'name') {
                assert.strictEqual(info.channelName, testBan.name);
            } else {
                assert.strictEqual(info[field], testBan[field]);
            }
        }

        assert.notEqual(received, null);
        assert.strictEqual(received.channel, testBan.name);
        assert.strictEqual(received.externalReason, testBan.externalReason);
    });

    it('updates an existing ban', async () => {
        let received = [];
        messages.on('ChannelBanned', cb => {
            received.push(cb);
        });

        await controller.banChannel(testBan);

        let testBan2 = { ...testBan, externalReason: 'because of reasons' };
        await controller.banChannel(testBan2);

        let info = await controller.getBannedChannel(testBan2.name);
        for (let field of Object.keys(testBan2)) {
            // Consider renaming parameter to avoid this branch
            if (field === 'name') {
                assert.strictEqual(info.channelName, testBan2.name);
            } else {
                assert.strictEqual(info[field], testBan2[field]);
            }
        }

        assert.deepStrictEqual(received, [
            {
                channel: testBan.name,
                externalReason: testBan.externalReason
            },
            {
                channel: testBan2.name,
                externalReason: testBan2.externalReason
            },
        ]);
    });

    it('unbans a channel', async () => {
        let received = null;
        messages.once('ChannelUnbanned', cb => {
            received = cb;
        });

        await controller.banChannel(testBan);
        await controller.unbanChannel(testBan.name, testBan.bannedBy);

        let info = await controller.getBannedChannel(testBan.name);
        assert.strictEqual(info, null);

        assert.notEqual(received, null);
        assert.strictEqual(received.channel, testBan.name);
    });
});
