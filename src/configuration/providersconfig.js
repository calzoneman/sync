const DEFAULTS = {
    'youtube-v3-key': '',
    'twitch-client-id': null,
    'dailymotion-player-id': 'x8lr5',
    'peertube-domain-extras': [],
    'vimeo-workaround': false
};

class ProvidersConfig {
    /**
     * @param {Object} [config] Flat provider settings from conf/providers.hjson
     *   or legacy top-level keys in config.yaml
     */
    constructor(config = {}) {
        this.config = Object.assign({}, DEFAULTS, config || {});
        this.validate();
    }

    validate() {
        if (typeof this.config['youtube-v3-key'] !== 'string') {
            throw new Error("Providers config key 'youtube-v3-key' must be a string");
        }

        const twitchId = this.config['twitch-client-id'];
        if (twitchId != null && typeof twitchId !== 'string') {
            throw new Error(
                "Providers config key 'twitch-client-id' must be a string or null"
            );
        }

        if (typeof this.config['dailymotion-player-id'] !== 'string' ||
                !this.config['dailymotion-player-id']) {
            throw new Error(
                "Providers config key 'dailymotion-player-id' must be a non-empty string"
            );
        }

        if (!Array.isArray(this.config['peertube-domain-extras'])) {
            throw new Error(
                "Providers config key 'peertube-domain-extras' must be an array"
            );
        }

        if (typeof this.config['vimeo-workaround'] !== 'boolean') {
            throw new Error(
                "Providers config key 'vimeo-workaround' must be a boolean"
            );
        }
    }

    getYoutubeV3Key() {
        return this.config['youtube-v3-key'];
    }

    getTwitchClientId() {
        return this.config['twitch-client-id'];
    }

    getDailymotionPlayerId() {
        return this.config['dailymotion-player-id'];
    }

    getPeertubeDomainExtras() {
        return this.config['peertube-domain-extras'].slice();
    }

    getVimeoWorkaround() {
        return this.config['vimeo-workaround'];
    }
}

export { ProvidersConfig, DEFAULTS as PROVIDERS_CONFIG_DEFAULTS };
