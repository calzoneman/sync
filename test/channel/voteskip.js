const VoteskipModule = require('../../lib/channel/voteskip');
const assert = require('assert');
const Flags = require('../../lib/flags');

describe('VoteskipModule', () => {
    let fakeUser;
    let fakeChannel;
    let voteskipModule;

    beforeEach(() => {
        fakeUser = {
            socket: {
                emit() {

                }
            },
            is() {
                return false
            }
        };
        fakeChannel = {
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
                    _playNext() {
                    },

                    meta: {
                        count: 1
                    }
                }
            },
            users: [fakeUser],
            broadcastAll() {
            }
        };

        voteskipModule = new VoteskipModule(fakeChannel);
    });

    describe('#update', () => {
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
                toUpdateFrame() {
                    return { counts: [1] };
                }
            };
            voteskipModule.update();
            assert.equal(voteskipModule.poll, false, 'Expected voteskip poll to be reset to false');
            assert(reset, 'Expected voteskip to be reset');
            assert(playNext, 'Expected playlist to be advanced');
        });

        it('broadcasts a message', () => {
            let sentMessage = false;
            fakeChannel.broadcastAll = (frame, data) => {
                assert.strictEqual(frame, 'chatMsg');
                assert(/voteskip passed/i.test(data.msg), 'Expected voteskip passed message')
                sentMessage = true;
            };
            voteskipModule.poll = {
                toUpdateFrame() {
                    return { counts: [1] };
                }
            };
            voteskipModule.update();
            assert(sentMessage, 'Expected voteskip passed message');
        });
    });

    describe('#calcUsercounts', () => {
        it('calculates correctly', () => {
            fakeChannel.users = [
                // 1 with permission and not AFK
                { is(f) { return false; }, _has_permission: true },
                // 1 without permission and not AFK
                { is(f) { return false; }, _has_permission: false },
                // 1 afk with permission
                { is(f) { return f === Flags.U_AFK; }, _has_permission: true },
                // 1 afk without permission
                { is(f) { return f === Flags.U_AFK; }, _has_permission: false }
            ]

            fakeChannel.modules.permissions.canVoteskip = u => u._has_permission;

            const {
                total,
                eligible,
                afk,
                noPermission
            } = voteskipModule.calcUsercounts();

            assert.strictEqual(total, 4, 'mismatch: total');
            assert.strictEqual(eligible, 1, 'mismatch: eligible');
            // Permission is checked before AFK; if user is AFK and also does
            // not have permission, they should be counted in noPermission
            // but not afk
            assert.strictEqual(afk, 1, 'mismatch: afk');
            assert.strictEqual(noPermission, 2, 'mismatch: noPermission');
        });
    });
});
