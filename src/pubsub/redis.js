import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

const LOGGER = require('@calzoneman/jsli')('redis-messagebus');

class RedisMessageBus extends EventEmitter {
    constructor(pubClient, subClient, channel) {
        super();

        this.pubClient = pubClient;
        this.subClient = subClient;
        this.channel = channel;
        this.publisherID = uuidv4();

        subClient.once('ready', this.subscribe.bind(this));
    }

    subscribe() {
        this.subClient.subscribe(this.channel);
        this.subClient.on('message', this.onMessage.bind(this));

        LOGGER.info('Subscribed to Redis messages on channel %s', this.channel);
    }

    onMessage(channel, message) {
        if (channel !== this.channel) {
            LOGGER.warn('Ignoring message from mismatched channel "%s"', channel);
            return;
        }

        try {
            const { event, payload } = JSON.parse(message);

            this._emit(event, payload);
        } catch (error) {
            if (error instanceof SyntaxError) {
                LOGGER.error(
                        'Malformed message received: %s (message: "%s")',
                        message,
                        error
                );
            } else {
                LOGGER.error('Unexpected error decoding message: %s', error.stack);
            }

            return;
        }
    }

    async emit(event, payload) {
        try {
            const message = JSON.stringify({
                time: new Date(),
                publisher: this.publisherID,
                event,
                payload
            });

            await this.pubClient.publish(this.channel, message);
        } catch (error) {
            LOGGER.error('Unable to send event %s: %s', event, error);
        }
    }
}

Object.assign(RedisMessageBus.prototype, {
    _emit: EventEmitter.prototype.emit
});

export { RedisMessageBus };
