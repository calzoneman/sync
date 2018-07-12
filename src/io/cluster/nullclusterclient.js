import Promise from 'bluebird';

export default class NullClusterClient {
    constructor(ioConfig) {
        this.ioConfig = ioConfig;
    }

    getSocketConfig(_channel) {
        const servers = this.ioConfig.getSocketEndpoints();
        const uwsServers = this.ioConfig.getUWSEndpoints();
        return Promise.resolve({
            servers: servers,
            uwsServers: uwsServers
        });
    }
}
