import clone from 'clone';
import redis from 'redis';
import Promise from 'bluebird';
Promise.promisifyAll(redis.RedisClient.prototype);
Promise.promisifyAll(redis.Multi.prototype);

/**
 * Provider for RedisClients.
 */
class RedisClientProvider {
    /**
     * Create a new RedisClientProvider.
     *
     * @param {Object} redisConfig default configuration to use
     * @see {@link https://www.npmjs.com/package/redis}
     */
    constructor(redisConfig) {
        this.redisConfig = redisConfig;
    }

    /**
     * Get a RedisClient.
     *
     * @param {Object} options optional override configuration for the RedisClient
     * @return {RedisClient} redis client using the provided configuration
     */
    get(options = {}) {
        const config = clone(this.redisConfig);
        for (const key in options) {
            config[key] = options[key];
        }

        const client = redis.createClient(config);
        client.on('error', this._defaultErrorHandler);

        return client;
    }

    /**
     * Handle an <code>'error'</code> event from a provided client.
     *
     * @param {Error} err error from the client
     * @private
     */
    _defaultErrorHandler(_err) {
    }
}

export default RedisClientProvider;
