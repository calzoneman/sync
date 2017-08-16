const assert = require('assert');
const { RedisMessageBus } = require('../../lib/pubsub/redis');
const { EventEmitter } = require('events');
const sinon = require('sinon');

describe('RedisMessageBus', () => {
    let pubClient, subClient, messageBus, publishSpy, subscribeSpy;

    beforeEach(() => {
        pubClient = { publish: () => {} };
        subClient = new EventEmitter();

        subClient.subscribe = () => {};
        subscribeSpy = sinon.spy(subClient, 'subscribe');

        publishSpy = sinon.spy(pubClient, 'publish');

        messageBus = new RedisMessageBus(pubClient, subClient, 'test');

        subClient.emit('ready');
    });

    describe('#onMessage', () => {
        it('processes a valid message', done => {
            messageBus.once('testEvent', payload => {
                assert(subscribeSpy.withArgs('test').calledOnce);
                assert.deepStrictEqual(payload, { foo: 'bar' });

                done();
            });

            messageBus.onMessage('test', '{"event":"testEvent","payload":{"foo":"bar"}}');
        });

        it('processes a syntactically invalid message', done => {
            messageBus.onMessage('test', 'not valid json lol');

            done();
        });
    });

    describe('#emit', () => {
        it('emits messages', () => {
            messageBus.emit('testEvent', { foo: 'bar' });

            assert(publishSpy.withArgs('test', sinon.match(arg => {
                arg = JSON.parse(arg);
                return arg.event === 'testEvent' && arg.payload.foo === 'bar';
            })).calledOnce);
        });
    });
});
