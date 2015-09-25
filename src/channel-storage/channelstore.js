import { FileStore } from './filestore';

const CHANNEL_STORE = new FileStore();

export function load(channelName) {
    return CHANNEL_STORE.load(channelName);
}

export function save(channelName, data) {
    return CHANNEL_STORE.save(channelName, data);
}
