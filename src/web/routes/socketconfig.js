import IOConfiguration from '../../configuration/ioconfig';
import NullClusterClient from '../../io/cluster/nullclusterclient';
import Config from '../../config';
import CyTubeUtil from '../../utilities';

export default function initialize(app) {
    const ioConfig = IOConfiguration.fromOldConfig(Config);
    const clusterClient = new NullClusterClient(ioConfig);

    app.get('/socketconfig/:channel.json', (req, res) => {
        if (!req.params.channel || !CyTubeUtil.isValidChannelName(req.params.channel)) {
            return res.status(400).json({
                error: `Channel "${req.params.channel}" does not exist.`
            });
        }

        clusterClient.getSocketConfig(req.params.channel).then(config => {
            res.json(config);
        });
    });
}
