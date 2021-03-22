import Promise from 'bluebird';
import { v4 as uuidv4 } from 'uuid';

const LOGGER = require('@calzoneman/jsli')('partitionchannelindex');

var SERVER = null;
const CACHE_REFRESH_INTERVAL = 30 * 1000;
const CACHE_EXPIRE_DELAY = 40 * 1000;

class PartitionChannelIndex {
    constructor(pubClient, subClient, channel) {
        this.id = uuidv4();
        this.pubClient = pubClient;
        this.subClient = subClient;
        this.channel = channel;
        this.id2instance = new Map();
        this._cache = [];

        this.pubClient.on('error', error => {
            LOGGER.error('pubClient error: %s', error.stack);
        });
        this.subClient.on('error', error => {
            LOGGER.error('subClient error: %s', error.stack);
        });

        this.subClient.once('ready', () => {
            this.subClient.on(
                'message',
                (channel, message) => this._handleMessage(channel, message)
            );
            this.subClient.subscribe(this.channel);
            this._bootstrap();
        });
    }

    _bootstrap() {
        LOGGER.info('Bootstrapping partition channel index (id=%s)', this.id);
        SERVER = require('../server').getServer();
        setInterval(() => this._broadcastMyList(), CACHE_REFRESH_INTERVAL);

        const bootstrap = JSON.stringify({
            operation: 'bootstrap',
            instanceId: this.id,
            payload: {}
        });

        this.pubClient.publishAsync(this.channel, bootstrap).catch(error => {
            LOGGER.error('Failed to send bootstrap request: %s', error.stack);
        });

        this._broadcastMyList();
    }

    _handleMessage(channel, message) {
        if (channel !== this.channel) {
            LOGGER.warn('Unexpected message from channel "%s"', channel);
            return;
        }

        try {
            const { operation, instanceId, payload } = JSON.parse(message);
            if (instanceId === this.id) {
                return;
            }

            switch (operation) {
                case 'bootstrap':
                    LOGGER.info(
                        'Received bootstrap request from %s',
                        instanceId
                    );
                    this._broadcastMyList();
                    break;
                case 'put-list':
                    LOGGER.info(
                        'Received put-list request from %s',
                        instanceId
                    );
                    this._putList(instanceId, payload);
                    break;
                default:
                    LOGGER.warn(
                        'Unknown channel index sync operation "%s" from %s',
                        operation,
                        instanceId
                    );
                    break;
            }
        } catch (error) {
            LOGGER.error('Error handling channel index sync message: %s', error.stack);
        }
    }

    _broadcastMyList() {
        const channels = SERVER.packChannelList(true).map(channel => {
            return {
                name: channel.name,
                mediatitle: channel.mediatitle,
                pagetitle: channel.pagetitle,
                usercount: channel.usercount
            };
        });

        this._putList(this.id, { channels });

        const message = JSON.stringify({
            operation: 'put-list',
            instanceId: this.id,
            payload: {
                channels
            }
        });

        this.pubClient.publishAsync(this.channel, message).catch(error => {
            LOGGER.error('Failed to publish local channel list: %s', error.stack);
        });
    }

    _putList(instanceId, payload) {
        const { channels } = payload;
        this.id2instance.set(
            instanceId,
            {
                lastUpdated: new Date(),
                channels
            }
        );

        this._updateCache();
    }

    _updateCache() {
        let cache = [];
        for (let [id, instance] of this.id2instance) {
            if (Date.now() - instance.lastUpdated.getTime() > CACHE_EXPIRE_DELAY) {
                LOGGER.warn('Removing expired channel list instance: %s', id);
                this.id2instance.delete(id);
            } else {
                cache = cache.concat(instance.channels);
            }
        }

        this._cache = cache;
    }

    listPublicChannels() {
        return Promise.resolve(this._cache);
    }
}

export { PartitionChannelIndex };
