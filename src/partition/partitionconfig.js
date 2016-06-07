class PartitionConfig {
    constructor(config) {
        this.config = config;
    }

    getPartitionMap() {
        return this.config.partitions;
    }

    getOverrideMap() {
        return this.config.overrides;
    }

    getPool() {
        return this.config.pool;
    }

    getIdentity() {
        return this.config.identity;
    }
}

export { PartitionConfig };
