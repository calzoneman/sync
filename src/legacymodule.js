import NullClusterClient from './io/cluster/nullclusterclient';

class LegacyModule {
    getClusterClient() {
        return new NullClusterClient();
    }

    onReady() {
        
    }
}

export { LegacyModule };
