class PartitionConfig {
    constructor(config) {
        this.config = config;
    }

    getIdentity() {
        return this.config.identity;
    }

    getRedisConfig() {
        return this.config.redis;
    }
}

export { PartitionConfig };
