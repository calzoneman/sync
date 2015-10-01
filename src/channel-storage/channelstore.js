import { FileStore } from './filestore';
import { DatabaseStore } from './dbstore';
import Config from '../config';

const CHANNEL_STORE = loadChannelStore();

export function load(channelName) {
    return CHANNEL_STORE.load(channelName);
}

export function save(channelName, data) {
    return CHANNEL_STORE.save(channelName, data);
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
