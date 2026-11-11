/**
 * Playback-rate sync for leaders (#941).
 *
 * Only providers whose embeds expose a reliable rate API are listed here.
 * Changing media to an unsupported type forces rate back to 1.
 */

const PLAYBACK_RATE_SUPPORTED_TYPES = new Set([
    'yt', // YouTube IFrame API setPlaybackRate
    'cm', // Video.js / HTML5
    'fi', // FilePlayer extends Video.js
    'vi', // Vimeo Player SDK setPlaybackRate (also Video.js when meta.direct)
    'dm'  // Dailymotion Web SDK setPlaybackSpeed
]);

const MIN_PLAYBACK_RATE = 0.25;
// YouTube's embed UI goes to 4x (incl. a 3x preset). Cap there so leader/follower
// stay aligned; providers that only allow ≤2 clamp themselves in their SDK.
const MAX_PLAYBACK_RATE = 4;
const DEFAULT_PLAYBACK_RATE = 1;

function supportsPlaybackRate(type) {
    return PLAYBACK_RATE_SUPPORTED_TYPES.has(type);
}

/**
 * Clamp and lightly quantize a rate from the leader.
 * @param {*} rate
 * @returns {number}
 */
function normalizePlaybackRate(rate) {
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
        return DEFAULT_PLAYBACK_RATE;
    }

    const clamped = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
    // Hundredths keep YouTube's 1.25 / 1.5 / etc. exact enough.
    return Math.round(clamped * 100) / 100;
}

export {
    PLAYBACK_RATE_SUPPORTED_TYPES,
    MIN_PLAYBACK_RATE,
    MAX_PLAYBACK_RATE,
    DEFAULT_PLAYBACK_RATE,
    supportsPlaybackRate,
    normalizePlaybackRate
};
