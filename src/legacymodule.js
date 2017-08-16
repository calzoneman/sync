import NullClusterClient from './io/cluster/nullclusterclient';
import Config from './config';
import IOConfiguration from './configuration/ioconfig';
import { EventEmitter } from 'events';

class LegacyModule {
    getIOConfig() {
        if (!this.ioConfig) {
            this.ioConfig = IOConfiguration.fromOldConfig(Config);
        }

        return this.ioConfig;
    }

    getClusterClient() {
        return new NullClusterClient(this.getIOConfig());
    }

    getGlobalMessageBus() {
        return new EventEmitter();
    }

    onReady() {

    }
}

export { LegacyModule };
