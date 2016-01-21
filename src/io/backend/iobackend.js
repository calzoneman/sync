import Server from 'cytube-common/lib/proxy/server';
import FrontendManager from './frontendmanager';
import uuid from 'uuid';
import PoolEntryUpdater from 'cytube-common/lib/redis/poolentryupdater';
import JSONProtocol from 'cytube-common/lib/proxy/protocol';

const BACKEND_POOL = 'backend-hosts';

export default class IOBackend {
    constructor(proxyListenerConfig, socketEmitter, poolRedisClient) {
        this.proxyListenerConfig = proxyListenerConfig;
        this.socketEmitter = socketEmitter;
        this.poolRedisClient = poolRedisClient;
        this.protocol = new JSONProtocol();
        this.initFrontendManager();
        this.initProxyListener();
        this.initBackendPoolUpdater();
    }

    initFrontendManager() {
        this.frontendManager = new FrontendManager(this.socketEmitter);
    }

    initProxyListener() {
        this.proxyListener = new Server(this.proxyListenerConfig, this.protocol);
        this.proxyListener.on('connection',
                this.frontendManager.onConnection.bind(this.frontendManager));
    }

    initBackendPoolUpdater() {
        const entry = {
            address: this.proxyListenerConfig.getHost() + '/' + this.proxyListenerConfig.getPort()
        }
        this.poolEntryUpdater = new PoolEntryUpdater(
                this.poolRedisClient,
                BACKEND_POOL,
                uuid.v4(),
                entry
        );
        this.poolEntryUpdater.start();
    }
}
