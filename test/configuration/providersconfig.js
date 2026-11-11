const assert = require('assert');
const { ProvidersConfig } = require('../../lib/configuration/providersconfig');

describe('ProvidersConfig', () => {
    describe('#constructor', () => {
        it('applies defaults', () => {
            const config = new ProvidersConfig();
            assert.strictEqual(config.getYoutubeV3Key(), '');
            assert.strictEqual(config.getTwitchClientId(), null);
            assert.strictEqual(config.getDailymotionPlayerId(), 'x8lr5');
            assert.deepStrictEqual(config.getPeertubeDomainExtras(), []);
            assert.strictEqual(config.getVimeoWorkaround(), false);
        });

        it('accepts overrides', () => {
            const config = new ProvidersConfig({
                'youtube-v3-key': 'yt-key',
                'twitch-client-id': 'twitch-id',
                'dailymotion-player-id': 'xabc',
                'peertube-domain-extras': ['pony.tube'],
                'vimeo-workaround': true
            });
            assert.strictEqual(config.getYoutubeV3Key(), 'yt-key');
            assert.strictEqual(config.getTwitchClientId(), 'twitch-id');
            assert.strictEqual(config.getDailymotionPlayerId(), 'xabc');
            assert.deepStrictEqual(config.getPeertubeDomainExtras(), ['pony.tube']);
            assert.strictEqual(config.getVimeoWorkaround(), true);
        });

        it('rejects a non-array peertube-domain-extras', () => {
            assert.throws(
                () => new ProvidersConfig({ 'peertube-domain-extras': 'nope' }),
                /peertube-domain-extras/
            );
        });
    });

    describe('#getPeertubeDomainExtras', () => {
        it('returns a copy', () => {
            const extras = ['a.example'];
            const config = new ProvidersConfig({
                'peertube-domain-extras': extras
            });
            const got = config.getPeertubeDomainExtras();
            got.push('b.example');
            assert.deepStrictEqual(config.getPeertubeDomainExtras(), ['a.example']);
        });
    });
});
