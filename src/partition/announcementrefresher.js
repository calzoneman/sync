import Logger from '../logger';
import uuid from 'uuid';

var SERVER;
const SERVER_ANNOUNCEMENTS = 'serverAnnouncements';

class AnnouncementRefresher {
    constructor(pubClient, subClient) {
        this.pubClient = pubClient;
        this.subClient = subClient;
        this.uuid = uuid.v4();
        process.nextTick(this.init.bind(this));
    }

    init() {
        SERVER = require('../server').getServer();
        SERVER.on('announcement', this.sendAnnouncement.bind(this));

        this.subClient.once('ready', () => {
            this.subClient.on('message', this.handleMessage.bind(this));
            this.subClient.subscribe(SERVER_ANNOUNCEMENTS);
        });
    }

    handleMessage(channel, message) {
        if (channel !== SERVER_ANNOUNCEMENTS) {
            return;
        }

        var data;
        try {
            data = JSON.parse(message);
        } catch (error) {
            Logger.errlog.log('Unable to unmarshal server announcement: ' + error.stack
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
        this.pubClient.publish(SERVER_ANNOUNCEMENTS, message);
    }
}

export { AnnouncementRefresher };
