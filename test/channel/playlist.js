const PlaylistModule = require('../../lib/channel/playlist');
const assert = require('assert');
const Config = require('../../lib/config');

describe('PlaylistModule', () => {
    describe('#handleClean', () => {
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
                    canDeleteVideo() {
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
        let playlistModule = new PlaylistModule(fakeChannel);

        it('rejects invalid regexes', () => {
            let sentError = false;

            fakeUser.socket.emit = (event, payload) => {
                assert.strictEqual(event, 'errorMsg');
                assert.deepStrictEqual(payload, {
                    msg: "Invalid target: -i * -m"
                });
                sentError = true;
            };

            playlistModule.handleClean(fakeUser, "/clean -i * -m", {});

            assert(sentError, 'Expected error due to invalid regex');
        });
    });
});
