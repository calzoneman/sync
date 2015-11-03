import CyTubeUtil from '../../utilities';
import { sanitizeText } from '../../xss';
import { sendJade } from '../jade';
import * as HTTPStatus from '../httpstatus';
import { HTTPError } from '../../errors';

export default function initialize(app, ioConfig) {
    app.get('/r/:channel', (req, res) => {
        if (!req.params.channel || !CyTubeUtil.isValidChannelName(req.params.channel)) {
            throw new HTTPError(`"${sanitizeText(req.params.channel)}" is not a valid ` +
                    'channel name.', { status: HTTPStatus.NOT_FOUND });
        }

        const endpoints = ioConfig.getSocketEndpoints();
        if (endpoints.length === 0) {
            throw new HTTPError('No socket.io endpoints configured');
        }
        const socketBaseURL = endpoints[0].url;

        sendJade(res, 'channel', {
            channelName: req.params.channel,
            sioSource: `${socketBaseURL}/socket.io/socket.io.js`
        });
    });
}
