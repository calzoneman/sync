const assert = require('assert');
const Media = require('../lib/media');
const {
    supportsPlaybackRate,
    normalizePlaybackRate,
    DEFAULT_PLAYBACK_RATE
} = require('../lib/media-playback-rate');

describe('media-playback-rate', () => {
    it('marks yt/cm/fi/vi/dm as supporting rate', () => {
        assert.strictEqual(supportsPlaybackRate('yt'), true);
        assert.strictEqual(supportsPlaybackRate('cm'), true);
        assert.strictEqual(supportsPlaybackRate('fi'), true);
        assert.strictEqual(supportsPlaybackRate('vi'), true);
        assert.strictEqual(supportsPlaybackRate('dm'), true);
    });

    it('rejects providers without a rate API', () => {
        assert.strictEqual(supportsPlaybackRate('tw'), false);
        assert.strictEqual(supportsPlaybackRate('pt'), false);
    });

    it('allows DailyMotion rates', () => {
        const media = new Media('xabc', 't', 60, 'dm', {});
        assert.strictEqual(media.setPlaybackRate(1.75), 1.75);
    });

    it('clamps and rounds rates', () => {
        assert.strictEqual(normalizePlaybackRate(1.25), 1.25);
        assert.strictEqual(normalizePlaybackRate(0.1), 0.25);
        assert.strictEqual(normalizePlaybackRate(3), 3);
        assert.strictEqual(normalizePlaybackRate(4), 4);
        assert.strictEqual(normalizePlaybackRate(5), 4);
        assert.strictEqual(normalizePlaybackRate(NaN), DEFAULT_PLAYBACK_RATE);
    });
});

describe('Media#setPlaybackRate', () => {
    it('stores rate for youtube', () => {
        const media = new Media('abc', 't', 60, 'yt', {});
        assert.strictEqual(media.setPlaybackRate(1.5), 1.5);
        assert.strictEqual(media.playbackRate, 1.5);
    });

    it('forces 1x for unsupported types', () => {
        const media = new Media('abc', 't', 60, 'tw', {});
        media.playbackRate = 1.5;
        assert.strictEqual(media.setPlaybackRate(1.5), 1);
        assert.strictEqual(media.playbackRate, 1);
    });

    it('reset clears rate', () => {
        const media = new Media('abc', 't', 60, 'yt', {});
        media.setPlaybackRate(2);
        media.reset();
        assert.strictEqual(media.playbackRate, 1);
    });

    it('includes playbackRate in updates', () => {
        const media = new Media('abc', 't', 60, 'yt', {});
        media.setPlaybackRate(1.25);
        assert.strictEqual(media.getTimeUpdate().playbackRate, 1.25);
        assert.strictEqual(media.getFullUpdate().playbackRate, 1.25);
    });
});
