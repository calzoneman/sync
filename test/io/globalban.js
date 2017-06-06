const assert = require('assert');
const sinon = require('sinon');
const GlobalBanDB = require('../../lib/db/globalban').GlobalBanDB;
const CachingGlobalBanlist = require('../../lib/io/globalban').CachingGlobalBanlist;

describe('CachingGlobalBanlist', () => {
    let banlist = null;
    let banDB = null;
    beforeEach(() => {
        banDB = new GlobalBanDB();
        banlist = new CachingGlobalBanlist(banDB);
    });

    describe('refreshCache', () => {
        it('caches bans', () => {
            const bans = [{ ip: '1.1.1.1', reason: 'test' }];
            sinon.stub(banDB, 'listGlobalBans').resolves(bans);
            return banlist.refreshCache().then(() => {
                assert(banlist.cache.has(bans[0].ip), 'Cache was not populated');
            });
        });

        it('clears removed bans', () => {
            banlist.cache.add('1.1.1.1');
            sinon.stub(banDB, 'listGlobalBans').resolves([]);
            return banlist.refreshCache().then(() => {
                assert(!banlist.cache.has('1.1.1.1'), 'Cache was not updated');
            });
        });

        it('fails open', () => {
            sinon.stub(banDB, 'listGlobalBans').rejects(new Error('Broken'));
            return banlist.refreshCache();
        });
    });

    describe('isIPGlobalBanned', () => {
        it('checks the full IP', () => {
            banlist.cache.add('1.2.3.4');
            assert(banlist.isIPGlobalBanned('1.2.3.4'), 'Expected IP to be banned');
        });

        it('checks the range IP', () => {
            banlist.cache.add('1.2.3');
            assert(banlist.isIPGlobalBanned('1.2.3.4'), 'Expected IP to be banned');
        });

        it('checks the wrange IP', () => {
            banlist.cache.add('1.2');
            assert(banlist.isIPGlobalBanned('1.2.3.4'), 'Expected IP to be banned');
        });
    });
});
