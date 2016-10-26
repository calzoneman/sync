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

    getPublishChannel() {
        return this.config.redis.publishChannel;
    }

    getPartitionMapKey() {
        return this.config.redis.partitionMapKey;
    }
}

export { PartitionConfig };
