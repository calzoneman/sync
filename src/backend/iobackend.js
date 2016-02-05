import Server from 'cytube-common/lib/proxy/server';
import ProxyInterceptor from './proxyinterceptor';
import uuid from 'uuid';
import PoolEntryUpdater from 'cytube-common/lib/redis/poolentryupdater';
import JSONProtocol from 'cytube-common/lib/proxy/protocol';
import { formatProxyAddress } from 'cytube-common/lib/util/addressutil';

const BACKEND_POOL = 'backend-hosts';

export default class IOBackend {
    constructor(proxyListenerConfig, socketEmitter, poolRedisClient) {
        this.proxyListenerConfig = proxyListenerConfig;
        this.socketEmitter = socketEmitter;
        this.poolRedisClient = poolRedisClient;
        this.protocol = new JSONProtocol();
        this.initProxyInterceptor();
        this.initProxyListener();
        this.initBackendPoolUpdater();
    }

    initProxyInterceptor() {
        this.proxyInterceptor = new ProxyInterceptor(this.socketEmitter);
    }

    initProxyListener() {
        this.proxyListener = new Server(this.proxyListenerConfig, this.protocol);
        this.proxyListener.on('connection',
                this.proxyInterceptor.onConnection.bind(this.proxyInterceptor));
    }

    initBackendPoolUpdater() {
        const hostname = this.proxyListenerConfig.getHost();
        const port = this.proxyListenerConfig.getPort();
        const entry = {
            address: formatProxyAddress(hostname, port)
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
