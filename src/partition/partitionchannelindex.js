import Promise from 'bluebird';
import uuid from 'uuid';
import { runLuaScript } from 'cytube-common/lib/redis/lualoader';
import path from 'path';
import Logger from '../logger';

var SERVER = null;
const CHANNEL_INDEX = 'publicChannelList';
const CACHE_REFRESH_INTERVAL = 30 * 1000;
const CACHE_EXPIRE_DELAY = 40 * 1000;
const READ_CHANNEL_LIST = path.join(__dirname, 'read_channel_list.lua')

class PartitionChannelIndex {
    constructor(redisClient) {
        this.redisClient = redisClient;
        this.uid = uuid.v4();
        this.cachedList = [];
        this.redisClient.on('error', error => {
            Logger.errlog.log(`Redis error: ${error}`);
        });

        process.nextTick(() => {
            SERVER = require('../server').getServer();
            this.refreshCache();
            setInterval(this.refreshCache.bind(this), CACHE_REFRESH_INTERVAL);
        });
    }

    refreshCache() {
        this.publishLocalChannels();
        runLuaScript(this.redisClient, READ_CHANNEL_LIST, [
            0,
            Date.now() - CACHE_EXPIRE_DELAY
        ]).then(result => {
            this.cachedList = JSON.parse(result);
        }).catch(error => {
            Logger.errlog.log(`Failed to refresh channel list: ${error.stack}`);
        });
    }

    publishLocalChannels() {
        const channels = SERVER.packChannelList(true).map(channel => {
            return {
                name: channel.name,
                mediatitle: channel.mediatitle,
                pagetitle: channel.pagetitle,
                usercount: channel.usercount
            };
        });

        const entry = JSON.stringify({
            timestamp: Date.now(),
            channels
        });

        this.redisClient.hsetAsync(CHANNEL_INDEX, this.uid, entry).catch(error => {
            Logger.errlog.log(`Failed to publish local channel list: ${error.stack}`);
        });
    }

    listPublicChannels() {
        return Promise.resolve(this.cachedList);
    }
}

export { PartitionChannelIndex };
