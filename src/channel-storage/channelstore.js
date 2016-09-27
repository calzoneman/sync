import { FileStore } from './filestore';
import { DatabaseStore } from './dbstore';
import Config from '../config';
import Promise from 'bluebird';

var CHANNEL_STORE = null;

export function init() {
    CHANNEL_STORE = loadChannelStore();
}

export function load(id, channelName) {
    if (CHANNEL_STORE === null) {
        return Promise.reject(new Error('ChannelStore not initialized yet'));
    }

    return CHANNEL_STORE.load(id, channelName);
}

export function save(id, channelName, data) {
    if (CHANNEL_STORE === null) {
        return Promise.reject(new Error('ChannelStore not initialized yet'));
    }

    return CHANNEL_STORE.save(id, channelName, data);
}

function loadChannelStore() {
    switch (Config.get('channel-storage.type')) {
        case 'database':
            return new DatabaseStore();
        case 'file':
        default:
            return new FileStore();
    }
}
