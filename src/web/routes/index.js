import { sendPug } from '../pug';

export default function initialize(app, channelIndex, maxEntries) {
    app.get('/', (req, res) => {
        channelIndex.listPublicChannels().then((channels) => {
            channels.sort((a, b) => {
                if (a.usercount === b.usercount) {
                    return a.uniqueName > b.uniqueName ? -1 : 1;
                }

                return b.usercount - a.usercount;
            });

            channels = channels.slice(0, maxEntries);

            sendPug(res, 'index', {
                channels: channels
            });
        });
    });
}
