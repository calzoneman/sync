import Promise from 'bluebird';

export default class NullClusterClient {
    constructor(ioConfig) {
        this.ioConfig = ioConfig;
    }

    getSocketConfig(_channel) {
        const servers = this.ioConfig.getSocketEndpoints();
        return Promise.resolve({
            servers: servers
        });
    }
}
