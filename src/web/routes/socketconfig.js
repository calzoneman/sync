import IOConfiguration from '../../configuration/ioconfig';
import NullClusterClient from '../../io/cluster/nullclusterclient';
import Config from '../../config';
import CyTubeUtil from '../../utilities';
import Logger from '../../logger';

export default function initialize(app) {
    const ioConfig = IOConfiguration.fromOldConfig(Config);
    const clusterClient = new NullClusterClient(ioConfig);

    app.get('/socketconfig/:channel.json', (req, res) => {
        if (!req.params.channel || !CyTubeUtil.isValidChannelName(req.params.channel)) {
            return res.status(404).json({
                error: `Channel "${req.params.channel}" does not exist.`
            });
        }

        clusterClient.getSocketConfig(req.params.channel).then(config => {
            res.json(config);
        }).catch(err => {
            Logger.errlog.log(err.stack);
            return res.status(500).json({
                error: err.message
            });
        });
    });
}
