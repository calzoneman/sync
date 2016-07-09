import { murmurHash1 } from '../util/murmur';

class PartitionDecider {
    constructor(config) {
        this.config = config;
    }

    getPartitionForChannel(channel) {
        const partitionMap = this.config.getPartitionMap();
        return partitionMap[this.getPartitionIdentityForChannel(channel)];
    }

    getPartitionIdentityForChannel(channel) {
        channel = channel.toLowerCase();
        const overrideMap = this.config.getOverrideMap();
        if (overrideMap.hasOwnProperty(channel)) {
            return overrideMap[channel];
        } else {
            const pool = this.config.getPool();
            const i = murmurHash1(channel) % pool.length;
            return pool[i];
        }
    }

    isChannelOnThisPartition(channel) {
        return this.getPartitionIdentityForChannel(channel) ===
                this.config.getIdentity();
    }
}

export { PartitionDecider };
