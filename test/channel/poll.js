const PollModule = require('../../lib/channel/poll');
const assert = require('assert');
const Config = require('../../lib/config');

describe('PollModule', () => {
    describe('#validatePollInput', () => {
        let pollModule = new PollModule({ uniqueName: 'testChannel', modules: {} });

        it('accepts valid input', () => {
            let title = '';
            for (let i = 0; i < 20; i++) {
                title += 'x';
            }

            pollModule.validatePollInput(title, ['ab', 'cd']);
        });

        it('rejects non-string titles', () => {
            assert.throws(() => {
                pollModule.validatePollInput(null, []);
            }, /title/);
        });

        it('rejects invalidly long titles', () => {
            let title = '';
            for (let i = 0; i < 256; i++) {
                title += 'x';
            }

            assert.throws(() => {
                pollModule.validatePollInput(title, []);
            }, /title/);
        });

        it('rejects non-array option parameter', () => {
            assert.throws(() => {
                pollModule.validatePollInput('poll', 1234);
            }, /options/);
        });

        it('rejects too many options', () => {
            const limit = Config.get('poll.max-options');
            Config.set('poll.max-options', 2);
            try {
                assert.throws(() => {
                    pollModule.validatePollInput('poll', ['1', '2', '3', '4']);
                }, /maximum of 2 options/);
            } finally {
                Config.set('poll.max-options', limit);
            }
        });

        it('rejects non-string options', () => {
            assert.throws(() => {
                pollModule.validatePollInput('poll', [null]);
            }, /options must be strings/);
        });

        it('rejects invalidly long options', () => {
            let option = '';
            for (let i = 0; i < 256; i++) {
                option += 'x';
            }

            assert.throws(() => {
                pollModule.validatePollInput('poll', [option]);
            }, /options must be 1-255 characters/);
        });
    });

    describe('#handleNewPoll', () => {
        let fakeChannel = {
            uniqueName: 'testChannel',
            logger: {
                log() {

                }
            },
            broadcastToRoom() {
            },
            broadcastAll() {
            },
            modules: {
                permissions: {
                    canControlPoll() {
                        return true;
                    }
                }
            }
        };
        let fakeUser = {
            getName() {
                return 'testUser';
            },
            socket: {
                emit() {
                }
            }
        };
        let pollModule;
        beforeEach(() => {
            pollModule = new PollModule(fakeChannel);
        });

        it('creates a valid poll', () => {
           let sentNewPoll = false;
           let sentClosePoll = false;
           fakeChannel.broadcastToRoom = (event, data, room) => {
               if (room === 'testChannel:viewHidden' && event === 'newPoll') {
                   sentNewPoll = true;
               }
           };
           fakeChannel.broadcastAll = (event) => {
               if (event === 'closePoll') {
                   sentClosePoll = true;
               }
           };
           pollModule.handleNewPoll(fakeUser, {
               title: 'test poll',
               opts: [
                   'option 1',
                   'option 2'
               ],
               obscured: false
           }, (ackResult) => {
               assert(!ackResult.error, `Unexpected error: ${ackResult.error}`);
           });
           assert(!sentClosePoll, 'Unexpected broadcast of closePoll event');
           assert(sentNewPoll, 'Expected broadcast of newPoll event');
        });

        it('closes an existing poll when a new one is created', () => {
           let sentNewPoll = 0;
           let sentClosePoll = 0;
           let sentUpdatePoll = 0;
           fakeChannel.broadcastToRoom = (event, data, room) => {
               if (room === 'testChannel:viewHidden' && event === 'newPoll') {
                   sentNewPoll++;
               }
           };
           fakeChannel.broadcastAll = (event, data) => {
               if (event === 'closePoll') {
                   sentClosePoll++;
               } else if (event === 'updatePoll') {
                   sentUpdatePoll++;
                   assert.deepStrictEqual(data.counts, [0, 0]);
               }
           };
           pollModule.handleNewPoll(fakeUser, {
               title: 'test poll',
               opts: [
                   'option 1',
                   'option 2'
               ],
               obscured: true
           }, (ackResult) => {
               assert(!ackResult.error, `Unexpected error: ${ackResult.error}`);
           });

           pollModule.handleNewPoll(fakeUser, {
               title: 'poll 2',
               opts: [
                   'option 3',
                   'option 4'
               ],
               obscured: false
           }, (ackResult) => {
               assert(!ackResult.error, `Unexpected error: ${ackResult.error}`);
           });

           assert.strictEqual(sentClosePoll, 1, 'Expected 1 broadcast of closePoll event');
           assert.strictEqual(sentUpdatePoll, 1, 'Expected 1 broadcast of updatePoll event');
           assert.strictEqual(sentNewPoll, 2, 'Expected 2 broadcasts of newPoll event');
        });

        it('rejects an invalid poll', () => {
            fakeChannel.broadcastToRoom = (event, data, room) => {
                assert(false, 'Expected no events to be sent');
            };
            fakeChannel.broadcastAll = (event) => {
                assert(false, 'Expected no events to be sent');
            };
            const options = [];
            for (let i = 0; i < 200; i++) {
                options.push('option ' + i);
            }
            pollModule.handleNewPoll(fakeUser, {
                title: 'test poll',
                opts: options,
                obscured: false
            }, (ackResult) => {
                assert.equal(ackResult.error.message, 'Polls are limited to a maximum of 50 options.');
            });
        });

        it('handles a rejection with no ack provided by socket.io', () => {
            fakeChannel.broadcastToRoom = (event, data, room) => {
                assert(false, 'Expected no events to be sent');
            };
            fakeChannel.broadcastAll = (event) => {
                assert(false, 'Expected no events to be sent');
            };
            let sentErrorMsg = false;
            fakeUser.socket.emit = (event, data) => {
                if (event === 'errorMsg') {
                    sentErrorMsg = true;
                }
            };
            const options = [];
            for (let i = 0; i < 200; i++) {
                options.push('option ' + i);
            }
            pollModule.handleNewPoll(fakeUser, {
                title: 'test poll',
                opts: options,
                obscured: false
            });
            assert(sentErrorMsg, 'Expected to send errorMsg since ack was missing');
        });
    })
});
