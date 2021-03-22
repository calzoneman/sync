import { v4 as uuidv4 } from 'uuid';

const LOGGER = require('@calzoneman/jsli')('announcementrefresher');

var SERVER;

class AnnouncementRefresher {
    constructor(pubClient, subClient, channel) {
        this.pubClient = pubClient;
        this.subClient = subClient;
        this.channel = channel;
        this.uuid = uuidv4();
        process.nextTick(this.init.bind(this));
    }

    init() {
        SERVER = require('../server').getServer();
        SERVER.on('announcement', this.sendAnnouncement.bind(this));

        this.subClient.once('ready', () => {
            this.subClient.on('message', this.handleMessage.bind(this));
            this.subClient.subscribe(this.channel);
        });
    }

    handleMessage(channel, message) {
        if (channel !== this.channel) {
            LOGGER.warn('Unexpected message from channel "%s"', channel);
            return;
        }

        var data;
        try {
            data = JSON.parse(message);
        } catch (error) {
            LOGGER.error('Unable to unmarshal server announcement: ' + error.stack
                    + '\nMessage was: ' + message);
            return;
        }

        if (data.partitionID === this.uuid) {
            return;
        }

        SERVER.setAnnouncement(data.data);
    }

    sendAnnouncement(data) {
        const message = JSON.stringify({
            data: data,
            partitionID: this.uuid
        });
        this.pubClient.publish(this.channel, message);
    }
}

export { AnnouncementRefresher };
