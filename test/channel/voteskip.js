const VoteskipModule = require('../../lib/channel/voteskip');
const assert = require('assert');

describe('VoteskipModule', () => {
    describe('#update', () => {
        let fakeUser = {
            socket: {
                emit() {

                }
            },
            is() {
                return false
            }
        };
        let fakeChannel = {
            logger: {
                log() {

                }
            },
            modules: {
                permissions: {
                    canSeeVoteskipResults() {
                        return true;
                    },
                    canVoteskip() {
                        return true;
                    }
                },
                options: {
                    get(key) {
                        if (key === 'voteskip_ratio') {
                            return 0.5;
                        } else if (key === 'allow_voteskip') {
                            return true;
                        }
                    }
                },
                playlist: {
                    meta: {
                        count: 1
                    }
                }
            },
            users: [fakeUser]
        };

        let voteskipModule = new VoteskipModule(fakeChannel);

        it('resets the vote before changing to the next video', () => {
            let reset = false, playNext = false;
            fakeChannel.modules.playlist._playNext = () => {
                if (!reset) {
                    assert(false, 'Expected voteskip reset prior to playlist._playNext');
                }

                playNext = true;
            };
            fakeUser.socket.emit = (event, data) => {
                if (event === 'voteskip') {
                    assert.deepEqual(data, { count: 0, need: 0 });
                    reset = true;
                }
            };

            voteskipModule.poll = {
                counts: [1]
            };
            voteskipModule.update();
            assert.equal(voteskipModule.poll, false, 'Expected voteskip poll to be reset to false');
            assert(reset, 'Expected voteskip to be reset');
            assert(playNext, 'Expected playlist to be advanced');
        });
    });
});
