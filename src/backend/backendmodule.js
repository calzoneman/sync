import { RedisClusterClient } from '../io/cluster/redisclusterclient';
import { FrontendPool } from 'cytube-common/lib/redis/frontendpool';
import RedisClientProvider from 'cytube-common/lib/redis/redisclientprovider';
import { loadFromToml } from 'cytube-common/lib/configuration/configloader';
import path from 'path';
import { BackendConfiguration } from './backendconfiguration';
import logger from 'cytube-common/lib/logger';
import redisAdapter from 'socket.io-redis';

const BACKEND_CONFIG_PATH = path.resolve(__dirname, '..', '..', 'backend.toml');

class BackendModule {
    constructor() {
        this.initConfig();
    }

    initConfig() {
        try {
            this.backendConfig = loadFromToml(BackendConfiguration, BACKEND_CONFIG_PATH);
        } catch (error) {
            if (typeof error.line !== 'undefined') {
                logger.error(`Error in configuration file: ${error} (line ${error.line})`);
            } else {
                logger.error(`Error loading configuration: ${error.stack}`);
            }

            process.exit(1);
        }
    }

    onReady() {
        const redisClientProvider = this.getRedisClientProvider();
        this.redisAdapter = redisAdapter({
            pubClient: redisClientProvider.get(),
            subClient: redisClientProvider.get()
        });
        this.sioEmitter = require('socket.io').instance;
        this.sioEmitter.adapter(this.redisAdapter);
        const IOBackend = require('./iobackend');
        this.ioBackend = new IOBackend(
                this.backendConfig.getListenerConfig()[0],
                this.sioEmitter,
                redisClientProvider.get()
        )
    }

    getFrontendPool() {
        if (!this.frontendPool) {
            this.frontendPool = new FrontendPool(this.getRedisClientProvider().get());
        }

        return this.frontendPool;
    }

    getRedisClientProvider() {
        if (!this.redisClientProvider) {
            this.redisClientProvider = new RedisClientProvider(
                    this.backendConfig.getRedisConfig()
            );
        }

        return this.redisClientProvider;
    }

    getClusterClient() {
        if (!this.redisClusterClient) {
            this.redisClusterClient = new RedisClusterClient(this.getFrontendPool());
        }

        return this.redisClusterClient;
    }
}

export { BackendModule }
