import logger from 'cytube-common/lib/logger';
import * as Switches from '../../switches';

class DualClusterClient {
    constructor(authoritativeClient, altClient) {
        this.authoritativeClient = authoritativeClient;
        this.altClient = altClient;
    }

    getSocketConfig(channel) {
        return this.authoritativeClient.getSocketConfig(channel).then(result => {
            if (!Switches.isActive(Switches.DUAL_BACKEND)) {
                return result;
            }

            return this.altClient.getSocketConfig(channel).then(altResult => {
                result.alt = altResult.servers;
                return result;
            }).catch(error => {
                logger.warn(`Error loading alt servers: ${error}`);
                return result;
            });
        })
    }
}

export { DualClusterClient };
