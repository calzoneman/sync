const assert = require('assert');
const KickbanModule = require('../../lib/channel/kickban');
const database = require('../../lib/database');
const dbChannels = require('../../lib/database/channels');
const Promise = require('bluebird');
const ChannelModule = require('../../lib/channel/module');
const Flags = require('../../lib/flags');
const testDB = require('../testutil/db').testDB;

function randomString(length) {
    const chars = 'abcdefgihkmnpqrstuvwxyz0123456789';
    let str = '';
    for (let i = 0; i < length; i++) {
        str += chars[Math.floor(Math.random() * chars.length)];
    }
    return str;
}

database.init(testDB);

describe('onPreUserJoin Ban Check', () => {
    const channelName = `test_${randomString(20)}`;
    const bannedIP = '1.1.1.1';
    const bannedName = 'troll';
    const mockChannel = {
        name: channelName,
        modules: {},
        is(flag) {
            return flag === Flags.C_REGISTERED;
        }
    };
    const module = new KickbanModule(mockChannel);
    before(done => {
        dbChannels.ban(channelName, bannedIP, bannedName, '', '', () => {
            dbChannels.ban(channelName, bannedIP, '', '', '', () => {
                dbChannels.ban(channelName, '*', bannedName, '', '', () => {
                    done();
                });
            });
        });
    });
    after(done => {
        dbChannels.deleteBans(channelName, null, () => {
            done();
        });
    });

    it('handles a banned IP with a different name', done => {
        const user = {
            getName() {
                return 'anotherTroll';
            },

            realip: bannedIP,

            kick() {
            }
        };

        module.onUserPreJoin(user, null, (error, res) => {
            assert.equal(error, null, `Unexpected error: ${error}`);
            assert.equal(res, ChannelModule.DENY, 'Expected user to be banned');
            done();
        });
    });

    it('handles a banned name with a different IP', done => {
        const user = {
            getName() {
                return 'troll';
            },

            realip: '5.5.5.5',

            kick() {
            }
        };

        module.onUserPreJoin(user, null, (error, res) => {
            assert.equal(error, null, `Unexpected error: ${error}`);
            assert.equal(res, ChannelModule.DENY, 'Expected user to be banned');
            done();
        });
    });

    it('handles a banned IP with a blank name', done => {
        const user = {
            getName() {
                return '';
            },

            realip: bannedIP,

            kick() {
            }
        };

        module.onUserPreJoin(user, null, (error, res) => {
            assert.equal(error, null, `Unexpected error: ${error}`);
            assert.equal(res, ChannelModule.DENY, 'Expected user to be banned');
            done();
        });
    });

    it('handles a non-banned IP with a blank name', done => {
        const user = {
            getName() {
                return '';
            },

            realip: '5.5.5.5'
        };

        module.onUserPreJoin(user, null, (error, res) => {
            assert.equal(error, null, `Unexpected error: ${error}`);
            assert.equal(res, ChannelModule.PASSTHROUGH, 'Expected user not to be banned');
            done();
        });
    });

    it('handles a non-banned IP with a non-banned name', done => {
        const user = {
            getName() {
                return 'some_user';
            },

            realip: '5.5.5.5'
        };

        module.onUserPreJoin(user, null, (error, res) => {
            assert.equal(error, null, `Unexpected error: ${error}`);
            assert.equal(res, ChannelModule.PASSTHROUGH, 'Expected user not to be banned');
            done();
        });
    });
});
