class RedisClusterClient {
    constructor(frontendPool) {
        this.frontendPool = frontendPool;
    }

    getSocketConfig(channel) {
        return this.frontendPool.getFrontends(channel).then(result => {
            if (!Array.isArray(result)) {
                result = [];
            }

            return { servers: result };
        });
    }
}

export { RedisClusterClient };
