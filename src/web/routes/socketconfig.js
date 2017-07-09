import CyTubeUtil from '../../utilities';
import * as HTTPStatus from '../httpstatus';

const LOGGER = require('@calzoneman/jsli')('web/routes/socketconfig');

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
            LOGGER.error(err.stack);
            return res.status(500).json({
                error: err.message
            });
        });
    });
}
