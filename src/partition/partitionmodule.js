import { loadConfig, resolveConfigFile } from '../configuration/configloader';
import { PartitionConfig } from './partitionconfig';
import { PartitionDecider } from './partitiondecider';
import { PartitionClusterClient } from '../io/cluster/partitionclusterclient';
import RedisClientProvider from '../redis/redisclientprovider';
import path from 'path';
import { AnnouncementRefresher } from './announcementrefresher';
import { RedisPartitionMapReloader } from './redispartitionmapreloader';
import { RedisMessageBus } from '../pubsub/redis';

const PARTITION_CONF_DIR = path.resolve(__dirname, '..', '..', 'conf');
const logger = require('@calzoneman/jsli')('PartitionModule');

class PartitionModule {
    constructor() {
        this.initConfig();
        this.cliMode = false;
    }

    onReady() {
        this.getAnnouncementRefresher();
    }

    initConfig() {
        try {
            this.partitionConfig = this.loadPartitionConfig();
        } catch (error) {
            process.exit(1);
        }
    }

    loadPartitionConfig() {
        const resolved = resolveConfigFile(PARTITION_CONF_DIR, 'partitions');
        const displayPath = resolved
            ? resolved.path
            : path.join(PARTITION_CONF_DIR, 'partitions.hjson');

        try {
            return loadConfig(PartitionConfig, PARTITION_CONF_DIR, 'partitions');
        } catch (error) {
            if (typeof error.line !== 'undefined') {
                logger.error(`Error in ${displayPath}: ${error} ` +
                             `(line ${error.line})`);
            } else {
                logger.error(`Error loading ${displayPath}: ` +
                             `${error.stack}`);
            }
            throw error;
        }
    }

    getPartitionMapReloader() {
        if (!this.partitionMapReloader) {
            const redisProvider = this.getRedisClientProvider();
            this.partitionMapReloader = new RedisPartitionMapReloader(
                    this.partitionConfig,
                    redisProvider.get(),  // Client for GET partitionMap
                    redisProvider.get()); // Subscribe client
        }

        return this.partitionMapReloader;
    }

    getPartitionDecider() {
        if (!this.partitionDecider) {
            const reloader = this.getPartitionMapReloader();
            this.partitionDecider = new PartitionDecider(this.partitionConfig,
                    reloader.getPartitionMap());
            reloader.on('partitionMapChange', newMap => {
                this.partitionDecider.setPartitionMap(newMap);
                if (!this.cliMode) {
                    require('../server').getServer().handlePartitionMapChange();
                }
            });
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
                    provider.get(),
                    this.partitionConfig.getAnnouncementChannel()
            );
        }

        return this.announcementRefresher;
    }

    getGlobalMessageBus() {
        if (!this.globalMessageBus) {
            const provider = this.getRedisClientProvider();
            this.globalMessageBus = new RedisMessageBus(
                provider.get(),
                provider.get(),
                this.partitionConfig.getGlobalMessageBusChannel()
            );
        }

        return this.globalMessageBus;
    }
}

export { PartitionModule };
