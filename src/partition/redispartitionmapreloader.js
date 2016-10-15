import { PartitionMap } from './partitionmap';
import logger from 'cytube-common/lib/logger';
import { EventEmitter } from 'events';

class RedisPartitionMapReloader extends EventEmitter {
    constructor(redisClient, subClient) {
        super();
        this.redisClient = redisClient;
        this.subClient = subClient;
        this.partitionMap = PartitionMap.empty();
        redisClient.once('ready', () => this.reload());
        subClient.once('ready', () => this.subscribe());
    }

    subscribe() {
        this.subClient.subscribe('partitionMap');
        this.subClient.on('message', (channel, message) => {
            if (channel !== 'partitionMap') {
                logger.warn('RedisPartitionMapReloader received unexpected message '
                        + `on redis channel ${channel}`);
                return;
            }

            this.reload();
        });
    }

    reload() {
        this.redisClient.getAsync('partitionMap').then(result => {
            var newMap = null;
            try {
                newMap = PartitionMap.fromJSON(JSON.parse(result));
            } catch (error) {
                logger.error(`Failed to decode received partition map: ${error}`,
                        { payload: result });
                return;
            }

            if (this.partitionMap.getHash() !== newMap.getHash()) {
                logger.info(`Partition map changed (hash=${newMap.getHash()})`);
                this.partitionMap = newMap;
                this.emit('partitionMapChange', newMap);
            }
        }).catch(error => {
            logger.error(`Failed to retrieve partition map from redis: ${error}`);
        });
    }

    getPartitionMap() {
        return this.partitionMap;
    }
}

export { RedisPartitionMapReloader };
