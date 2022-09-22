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
            },
            users: []
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
            let kicked = false;

            mockChannel.refCounter.unref = () => {
                assert(kicked, 'Expected user to be kicked');

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

            mockChannel.users = [{
                getLowerName() {
                    return 'test_user';
                },

                kick(reason) {
                    assert.strictEqual(reason, "You're banned!");
                    kicked = true;
                }
            }];

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

    describe('#handleCmdIPBan', () => {
        beforeEach(async () => {
            await database.getDB().runTransaction(async tx => {
                await tx.table('aliases')
                        .insert([{
                            name: 'test_user',
                            ip: '1.2.3.4',
                            time: Date.now()
                        }]);
            });
        });

        afterEach(async () => {
            await database.getDB().runTransaction(async tx => {
                await tx.table('aliases')
                        .where({ name: 'test_user' })
                        .orWhere({ ip: '1.2.3.4' })
                        .del();
            });
        });

        it('inserts a valid ban', done => {
            let firstUserKicked = false;
            let secondUserKicked = false;

            mockChannel.refCounter.unref = () => {
                assert(firstUserKicked, 'Expected banned user to be kicked');
                assert(
                    secondUserKicked,
                    'Expected user with banned IP to be kicked'
                );

                database.getDB().runTransaction(async tx => {
                    const nameBan = await tx.table('channel_bans')
                            .where({
                                channel: channelName,
                                name: 'test_user',
                                ip: '*'
                            })
                            .first();

                    assert.strictEqual(nameBan.reason, 'because reasons');
                    assert.strictEqual(nameBan.bannedby, mockUser.getName());

                    const ipBan = await tx.table('channel_bans')
                            .where({
                                channel: channelName,
                                ip: '1.2.3.4'
                            })
                            .first();

                    assert.strictEqual(ipBan.name, 'test_user');
                    assert.strictEqual(ipBan.reason, 'because reasons');
                    assert.strictEqual(ipBan.bannedby, mockUser.getName());

                    done();
                });
            };

            mockChannel.users = [{
                getLowerName() {
                    return 'test_user';
                },

                realip: '1.2.3.4',

                kick(reason) {
                    assert.strictEqual(reason, "You're banned!");
                    firstUserKicked = true;
                }
            }, {
                getLowerName() {
                    return 'second_user_same_ip';
                },

                realip: '1.2.3.4',

                kick(reason) {
                    assert.strictEqual(reason, "You're banned!");
                    secondUserKicked = true;
                }
            }];

            kickban.handleCmdIPBan(
                mockUser,
                '/ipban test_user because reasons',
                {}
            );
        });

        it('inserts a valid range ban', done => {
            mockChannel.refCounter.unref = () => {
                database.getDB().runTransaction(async tx => {
                    const ipBan = await tx.table('channel_bans')
                            .where({
                                channel: channelName,
                                ip: '1.2.3'
                            })
                            .first();

                    assert.strictEqual(ipBan.name, 'test_user');
                    assert.strictEqual(ipBan.reason, 'because reasons');
                    assert.strictEqual(ipBan.bannedby, mockUser.getName());

                    done();
                });
            };

            kickban.handleCmdIPBan(
                mockUser,
                '/ipban test_user range because reasons',
                {}
            );
        });

        it('inserts a valid wide-range ban', done => {
            mockChannel.refCounter.unref = () => {
                database.getDB().runTransaction(async tx => {
                    const ipBan = await tx.table('channel_bans')
                            .where({
                                channel: channelName,
                                ip: '1.2'
                            })
                            .first();

                    assert.strictEqual(ipBan.name, 'test_user');
                    assert.strictEqual(ipBan.reason, 'because reasons');
                    assert.strictEqual(ipBan.bannedby, mockUser.getName());

                    done();
                });
            };

            kickban.handleCmdIPBan(
                mockUser,
                '/ipban test_user wrange because reasons',
                {}
            );
        });

        it('inserts a valid IPv6 ban', done => {
            const longIP = require('../../lib/utilities').expandIPv6('::abcd');

            mockChannel.refCounter.unref = () => {
                database.getDB().runTransaction(async tx => {
                    const ipBan = await tx.table('channel_bans')
                            .where({
                                channel: channelName,
                                ip: longIP
                            })
                            .first();

                    assert.strictEqual(ipBan.name, 'test_user');
                    assert.strictEqual(ipBan.reason, 'because reasons');
                    assert.strictEqual(ipBan.bannedby, mockUser.getName());

                    done();
                });
            };

            database.getDB().runTransaction(async tx => {
                await tx.table('aliases')
                        .insert({
                            name: 'test_user',
                            ip: longIP,
                            time: Date.now()
                        });
            }).then(() => {
                kickban.handleCmdIPBan(
                    mockUser,
                    '/ipban test_user because reasons',
                    {}
                );
            });
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

            kickban.handleCmdIPBan(
                mockUser,
                '/ipban test_user because reasons',
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

            kickban.handleCmdIPBan(
                mockUser,
                '/ipban the_Admin because reasons',
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
                            "You don't have permission to ban IP " +
                            "09l.TFb.5To.HBB"
                        );

                        done();
                    }
                };

                kickban.handleCmdIPBan(
                    mockUser,
                    '/ipban test_user because reasons',
                    {}
                );
            });
        });

        it('rejects if the user is ranked below an alias of the ban recipient', done => {
            database.getDB().runTransaction(async tx => {
                await tx.table('channel_ranks')
                        .insert({
                            channel: channelName,
                            name: 'another_user',
                            rank: 5
                        });
                await tx.table('aliases')
                        .insert({
                            name: 'another_user',
                            ip: '1.2.3.3', // different IP, same /24 range
                            time: Date.now()
                        });
            }).then(() => {
                mockUser.socket.emit = (frame, obj) => {
                    if (frame === 'errorMsg') {
                        assert.strictEqual(
                            obj.msg,
                            "You don't have permission to ban IP " +
                            "09l.TFb.5To.*"
                        );

                        done();
                    }
                };

                kickban.handleCmdIPBan(
                    mockUser,
                    '/ipban test_user range because reasons',
                    {}
                );
            });
        });

        it('rejects if the the ban recipient IP is already banned', done => {
            database.getDB().runTransaction(tx => {
                return tx.table('channel_bans')
                        .insert({
                            channel: channelName,
                            name: 'another_user',
                            ip: '1.2.3.4',
                            bannedby: 'somebody',
                            reason: 'I dunno'
                        });
            }).then(() => {
                mockUser.socket.emit = (frame, obj) => {
                    if (frame === 'errorMsg') {
                        assert.strictEqual(
                            obj.msg,
                            '09l.TFb.5To.HBB is already banned'
                        );

                        done();
                    }
                };

                kickban.handleCmdIPBan(
                    mockUser,
                    '/ipban test_user because reasons',
                    {}
                );
            });
        });

        it('still adds the IP ban even if the name is already banned', done => {
            mockChannel.refCounter.unref = () => {
                database.getDB().runTransaction(async tx => {
                    const ipBan = await tx.table('channel_bans')
                            .where({
                                channel: channelName,
                                ip: '1.2.3.4'
                            })
                            .first();

                    assert.strictEqual(ipBan.name, 'test_user');
                    assert.strictEqual(ipBan.reason, 'because reasons');
                    assert.strictEqual(ipBan.bannedby, mockUser.getName());

                    done();
                });
            };

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
                kickban.handleCmdIPBan(
                    mockUser,
                    '/ipban test_user because reasons',
                    {}
                );
            });
        });
    });
});
