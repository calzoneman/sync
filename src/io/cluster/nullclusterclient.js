import Promise from 'bluebird';

export default class NullClusterClient {
    constructor(ioConfig) {
        this.ioConfig = ioConfig;
    }

    getSocketConfig(channel) {
        const url = this.ioConfig.getSocketURL();
        return Promise.resolve({
            url: url,
            secure: /^(https|wss)/.test(url)
        });
    }
}
