import Server from 'cytube-common/lib/tcpjson/server';
import FrontendManager from './frontendmanager';

export default class IOBackend {
    constructor(proxyListenerConfig, socketEmitter) {
        this.proxyListenerConfig = proxyListenerConfig;
        this.socketEmitter = socketEmitter;
        this.initFrontendManager();
        this.initProxyListener();
    }

    initFrontendManager() {
        this.frontendManager = new FrontendManager(this.socketEmitter);
    }

    initProxyListener() {
        this.proxyListener = new Server(this.proxyListenerConfig);
        this.proxyListener.on('connection',
                this.frontendManager.onConnection.bind(this.frontendManager));
    }
}
