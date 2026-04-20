import CyTubeUtil from '../../utilities';
import Config from '../../config';
import { sanitizeText } from '../../xss';
import { sendPug } from '../pug';
import * as HTTPStatus from '../httpstatus';
import { HTTPError } from '../../errors';

export default function initialize(app, ioConfig, chanPath, getBannedChannel) {
    app.get(`/${chanPath}/:channel`, async (req, res) => {
        if (!req.params.channel || !CyTubeUtil.isValidChannelName(req.params.channel)) {
            throw new HTTPError(`"${sanitizeText(req.params.channel)}" is not a valid ` +
                    'channel name.', { status: HTTPStatus.NOT_FOUND });
        }

        let banInfo = await getBannedChannel(req.params.channel);
        if (banInfo !== null) {
            sendPug(res, 'banned_channel', {
                externalReason: banInfo.externalReason
            });
            return;
        }

        const endpoints = ioConfig.getSocketEndpoints();
        if (endpoints.length === 0) {
            throw new HTTPError('No socket.io endpoints configured');
        }
        const preferredSecure = req.realProtocol === 'https';
        const chosenEndpoint = endpoints.find((endpoint) => endpoint.secure === preferredSecure) ||
            endpoints[0];
        const socketBaseURL = chosenEndpoint.url;

        sendPug(res, 'channel', {
            channelName: req.params.channel,
            sioSource: `${socketBaseURL}/socket.io/socket.io.js`,
            maxMsgLen: Config.get("max-chat-message-length")
        });
    });
}
