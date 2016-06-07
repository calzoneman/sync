import { murmurHash1 } from '../util/murmur';

class PartitionDecider {
    constructor(config) {
        this.identity = config.getIdentity();
        this.partitionMap = config.getPartitionMap();
        this.pool = config.getPool();
        this.overrideMap = config.getOverrideMap();
    }

    getPartitionForChannel(channel) {
        return this.partitionMap[this.getPartitionIdentityForChannel(channel)];
    }

    getPartitionIdentityForChannel(channel) {
        if (this.overrideMap.hasOwnProperty(channel)) {
            return this.overrideMap[channel];
        } else {
            const i = murmurHash1(channel) % this.pool.length;
            return this.pool[i];
        }
    }

    isChannelOnThisPartition(channel) {
        return this.getPartitionIdentityForChannel(channel) === this.identity;
    }
}

export { PartitionDecider };
