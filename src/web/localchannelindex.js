import Promise from 'bluebird';

var SERVER = null;

export default class LocalChannelIndex {
    listPublicChannels() {
        if (SERVER === null) {
            SERVER = require('../server').getServer();
        }

        return Promise.resolve(SERVER.packChannelList(true));
    }
}
