import { loadFromToml } from 'cytube-common/lib/configuration/configloader';
import { PartitionConfig } from './partitionconfig';
import { PartitionDecider } from './partitiondecider';
import { PartitionClusterClient } from '../io/cluster/partitionclusterclient';
import RedisClientProvider from 'cytube-common/lib/redis/redisclientprovider';
import logger from 'cytube-common/lib/logger';
import LegacyConfig from '../config';
import path from 'path';
import { AnnouncementRefresher } from './announcementrefresher';

const PARTITION_CONFIG_PATH = path.resolve(__dirname, '..', '..', 'conf',
                                           'partitions.toml');

class PartitionModule {
    constructor() {
        this.initConfig();
    }

    onReady() {
        this.getAnnouncementRefresher();
    }

    initConfig() {
        logger.initialize(null, null, LegacyConfig.get('debug'));
        try {
            this.partitionConfig = this.loadPartitionMap();
        } catch (error) {
            process.exit(1);
        }
    }

    loadPartitionMap() {
        try {
            return loadFromToml(PartitionConfig, PARTITION_CONFIG_PATH);
        } catch (error) {
            if (typeof error.line !== 'undefined') {
                logger.error(`Error in ${PARTITION_CONFIG_PATH}: ${error} ` +
                             `(line ${error.line})`);
            } else {
                logger.error(`Error loading ${PARTITION_CONFIG_PATH}: ` +
                             `${error.stack}`);
            }
            throw error;
        }
    }

    getPartitionDecider() {
        if (!this.partitionDecider) {
            this.partitionDecider = new PartitionDecider(this.partitionConfig);
        }

        return this.partitionDecider;
    }

    getClusterClient() {
        if (!this.partitionClusterClient) {
            this.partitionClusterClient = new PartitionClusterClient(
                    this.getPartitionDecider());
        }

        return this.partitionClusterClient;
    }

    getRedisClientProvider() {
        if (!this.redisClientProvider) {
            this.redisClientProvider = new RedisClientProvider(
                    this.partitionConfig.getRedisConfig()
            );
        }

        return this.redisClientProvider;
    }

    getAnnouncementRefresher() {
        if (!this.announcementRefresher) {
            const provider = this.getRedisClientProvider();
            this.announcementRefresher = new AnnouncementRefresher(
                    provider.get(),
                    provider.get()
            );
        }

        return this.announcementRefresher;
    }
}

export { PartitionModule };
