import Config from '../../config';
import CyTubeUtil from '../../utilities';
import Logger from '../../logger';
import * as HTTPStatus from '../httpstatus';

export default function initialize(app, clusterClient) {
    app.get('/socketconfig/:channel.json', (req, res) => {
        if (!req.params.channel || !CyTubeUtil.isValidChannelName(req.params.channel)) {
            return res.status(HTTPStatus.NOT_FOUND).json({
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
