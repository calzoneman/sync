import Server from 'cytube-common/lib/tcpjson/server';
import FrontendManager from './frontendmanager';

export default class IOBackend {
    constructor(proxyListenerConfig) {
        this.proxyListenerConfig = proxyListenerConfig;
        this.initFrontendManager();
        this.initProxyListener();
    }

    initFrontendManager() {
        this.frontendManager = new FrontendManager();
    }

    initProxyListener() {
        this.proxyListener = new Server(this.proxyListenerConfig);
        this.proxyListener.on('connection',
                this.frontendManager.onConnection.bind(this.frontendManager));
    }
}
