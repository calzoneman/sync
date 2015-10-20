import Promise from 'bluebird';

export default class NullClusterClient {
    constructor(ioConfig) {
        this.ioConfig = ioConfig;
    }

    getSocketURL(channel) {
        return Promise.resolve(this.ioConfig.getSocketURL());
    }
}
