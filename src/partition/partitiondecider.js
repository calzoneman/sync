import { murmurHash1 } from '../util/murmur';

class PartitionDecider {
    constructor(config, partitionMap) {
        this.config = config;
        this.partitionMap = partitionMap;
    }

    getPartitionForChannel(channel) {
        return this.partitionMap.getPartitions()[this.getPartitionIdentityForChannel(channel)];
    }

    getPartitionIdentityForChannel(channel) {
        channel = channel.toLowerCase();
        const overrideMap = this.partitionMap.getOverrides();
        if (overrideMap.hasOwnProperty(channel)) {
            return overrideMap[channel];
        } else if (this.partitionMap.getPool().length > 0) {
            const pool = this.partitionMap.getPool();
            const i = murmurHash1(channel) % pool.length;
            return pool[i];
        } else {
            return { servers: [] };
        }
    }

    isChannelOnThisPartition(channel) {
        return this.getPartitionIdentityForChannel(channel) ===
                this.config.getIdentity();
    }

    setPartitionMap(newMap) {
        this.partitionMap = newMap;
    }
}

export { PartitionDecider };
