const assert = require('assert');
const KickbanModule = require('../../lib/channel/kickban');
const database = require('../../lib/database');
const Promise = require('bluebird');
const testDB = require('../testutil/db').testDB;

database.init(testDB);

describe('KickbanModule', () => {
    const channelName = `test_${Math.random().toString(31).substring(2)}`;

    let mockChannel;
    let mockUser;
    let kickban;

    beforeEach(() => {
        mockChannel = {
            name: channelName,
            refCounter: {
                ref() { },
                unref() { }
            },
            logger: {
                log() { }
            },
            modules: {
                permissions: {
                    canBan() {
                        return true;
                    }
                }
            }
        };

        mockUser = {
            getName() {
                return 'The_Admin';
            },

            getLowerName() {
                return 'the_admin';
            },

            socket: {
                emit(frame) {
                    if (frame === 'errorMsg') {
                        throw new Error(arguments[1].msg);
                    }
                }
            },

            account: {
                effectiveRank: 3
            }
        };

        kickban = new KickbanModule(mockChannel);
    });

    afterEach(async () => {
        await database.getDB().runTransaction(async tx => {
            await tx.table('channel_bans')
                    .where({ channel: channelName })
                    .del();
            await tx.table('channel_ranks')
                    .where({ channel: channelName })
                    .del();
        });
    });

    describe('#handleCmdBan', () => {
        it('inserts a valid ban', done => {
            mockChannel.refCounter.unref = () => {
                database.getDB().runTransaction(async tx => {
                    const ban = await tx.table('channel_bans')
                            .where({
                                channel: channelName,
                                name: 'test_user'
                            })
                            .first();

                    assert.strictEqual(ban.ip, '*');
                    assert.strictEqual(ban.reason, 'because reasons');
                    assert.strictEqual(ban.bannedby, mockUser.getName());

                    done();
                });
            };

            kickban.handleCmdBan(
                mockUser,
                '/ban test_user because reasons',
                {}
            );
        });

        it('rejects if the user does not have ban permission', done => {
            mockUser.socket.emit = (frame, obj) => {
                if (frame === 'errorMsg') {
                    assert.strictEqual(
                        obj.msg,
                        'You do not have ban permissions on this channel'
                    );

                    done();
                }
            };

            mockChannel.modules.permissions.canBan = () => false;

            kickban.handleCmdBan(
                mockUser,
                '/ban test_user because reasons',
                {}
            );
        });

        it('rejects if the user tries to ban themselves', done => {
            let costanza = false;

            mockUser.socket.emit = (frame, obj) => {
                if (frame === 'errorMsg') {
                    assert.strictEqual(
                        obj.msg,
                        'You cannot ban yourself'
                    );

                    if (!costanza) {
                        throw new Error('Expected costanza for banning self');
                    }

                    done();
                } else if (frame === 'costanza') {
                    assert.strictEqual(
                        obj.msg,
                        "You can't ban yourself"
                    );

                    costanza = true;
                }
            };

            kickban.handleCmdBan(
                mockUser,
                '/ban the_Admin because reasons',
                {}
            );
        });

        it('rejects if the user is ranked below the ban recipient', done => {
            database.getDB().runTransaction(tx => {
                return tx.table('channel_ranks')
                        .insert({
                            channel: channelName,
                            name: 'test_user',
                            rank: 5
                        });
            }).then(() => {
                mockUser.socket.emit = (frame, obj) => {
                    if (frame === 'errorMsg') {
                        assert.strictEqual(
                            obj.msg,
                            "You don't have permission to ban test_user"
                        );

                        done();
                    }
                };

                kickban.handleCmdBan(
                    mockUser,
                    '/ban test_user because reasons',
                    {}
                );
            });
        });

        it('rejects if the the ban recipient is already banned', done => {
            database.getDB().runTransaction(tx => {
                return tx.table('channel_bans')
                        .insert({
                            channel: channelName,
                            name: 'test_user',
                            ip: '*',
                            bannedby: 'somebody',
                            reason: 'I dunno'
                        });
            }).then(() => {
                mockUser.socket.emit = (frame, obj) => {
                    if (frame === 'errorMsg') {
                        assert.strictEqual(
                            obj.msg,
                            'test_user is already banned'
                        );

                        done();
                    }
                };

                kickban.handleCmdBan(
                    mockUser,
                    '/ban test_user because reasons',
                    {}
                );
            });
        });
    });
});
