import { PartitionMap } from './partitionmap';
import { EventEmitter } from 'events';

const logger = require('@calzoneman/jsli')('RedisPartitionMapReloader');

class RedisPartitionMapReloader extends EventEmitter {
    constructor(config, redisClient, subClient) {
        super();
        this.config = config;
        this.redisClient = redisClient;
        this.subClient = subClient;
        this.partitionMap = PartitionMap.empty();
        redisClient.once('ready', () => this.reload());
        subClient.once('ready', () => this.subscribe());
    }

    subscribe() {
        this.subClient.subscribe(this.config.getPublishChannel());
        this.subClient.on('message', (channel, message) => {
            if (channel !== this.config.getPublishChannel()) {
                logger.warn('RedisPartitionMapReloader received unexpected message '
                        + `on redis channel ${channel}`);
                return;
            }

            logger.info(`Received partition map update message published at ${message}`);
            this.reload();
        });
    }

    reload() {
        this.redisClient.getAsync(this.config.getPartitionMapKey()).then(result => {
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
