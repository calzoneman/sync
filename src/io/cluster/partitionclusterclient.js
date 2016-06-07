import Promise from 'bluebird';

class PartitionClusterClient {
    constructor(partitionDecider) {
        this.partitionDecider = partitionDecider;
    }

    getSocketConfig(channel) {
        return Promise.resolve({
            servers: this.partitionDecider.getPartitionForChannel(channel)
        });
    }
}

export { PartitionClusterClient };
