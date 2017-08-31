const assert = require('assert');
const ChannelDB = require('../../lib/db/channel').ChannelDB;
const testDB = require('../testutil/db').testDB;
const { InvalidRequestError } = require('../../lib/errors');

const channelDB = new ChannelDB(testDB);

function cleanup() {
    return testDB.knex.table('channels').del().then(() => {
        return testDB.knex.table('channel_ranks').del();
    }).then(() => {
        return testDB.knex.table('channel_bans').del();
    }).then(() => {
        return testDB.knex.table('channel_libraries').del();
    }).then(() => {
        return testDB.knex.table('channel_data').del();
    });
}

function insert(channel) {
    return testDB.knex.table('channels').insert(channel);
}

function fetch(params) {
    return testDB.knex.table('channels').where(params).first();
}

describe('ChannelDB', () => {
    let channel, expected;

    beforeEach(() => {
        channel = {
            name: 'i_test',
            owner: 'test_user',
            time: 1500000000000,
            last_loaded: new Date('2017-08-29T00:00:00Z'),
            owner_last_seen: new Date('2017-08-29T01:00:00Z')
        };

        expected = {
            name: 'i_test',
            owner: 'test_user',
            time: new Date(1500000000000),
            last_loaded: new Date('2017-08-29T00:00:00Z'),
            owner_last_seen: new Date('2017-08-29T01:00:00Z')
        };
    });

    beforeEach(cleanup);

    describe('#getByName', () => {
        it('retrieves a channel by name', () => {
            return insert(channel).then(() => {
                return channelDB.getByName('i_test');
            }).then(retrieved => {
                delete retrieved.id;

                assert.deepStrictEqual(retrieved, expected);
            });
        });

        it('returns null if the channel is not found', () => {
            return channelDB.getByName('i_test').then(channel => {
                assert.strictEqual(channel, null);
            });
        });
    });

    describe('#listByUser', () => {
        it('retrieves channels by owner', () => {
            return insert(channel).then(() => {
                return channelDB.listByOwner('test_user');
            }).then(rows => {
                assert.strictEqual(rows.length, 1);

                delete rows[0].id;

                assert.deepStrictEqual(rows[0], expected);
            });
        });

        it('returns empty results if the owner has no channels', () => {
            return channelDB.listByOwner('test_user').then(rows => {
                assert.strictEqual(rows.length, 0);
            });
        });
    });

    describe('#insert', () => {
        it('creates a channel', () => {
            return channelDB.insert({ name: 'i_test', owner: 'test_user' }).then(() => {
                return fetch({ name: 'i_test' });
            }).then(inserted => {
                assert.strictEqual(inserted.name, 'i_test');
                assert.strictEqual(inserted.owner, 'test_user');

                const now = Date.now();

                assert(
                    Math.abs(inserted.time - now) < 1000,
                    'Wrong time'
                );
                assert(
                    Math.abs(inserted.last_loaded.getTime() - now) < 1000,
                    'Wrong last_loaded'
                );
                assert(
                    Math.abs(inserted.owner_last_seen.getTime() - now) < 1000,
                    'Wrong owner_last_seen'
                );
            });
        });

        it('inserts a rank 5 for the owner', () => {
            return channelDB.insert({ name: 'i_test', owner: 'test_user' }).then(() => {
                return testDB.knex.table('channel_ranks')
                        .where({ channel: 'i_test', name: 'test_user' })
                        .first();
            }).then(inserted => {
                assert.deepStrictEqual(inserted, {
                    name: 'test_user',
                    channel: 'i_test',
                    rank: 5
                });
            });
        });

        it('throws when the channel already exists', () => {
            return insert(channel).then(() => {
                return channelDB.insert({ name: 'i_test', owner: 'test_user' });
            }).then(() => {
                throw new Error('Expected error due to already existing channel');
            }).catch(error => {
                assert(
                    error instanceof InvalidRequestError,
                    'Expected InvalidRequestError'
                );
                assert.strictEqual(
                    error.message,
                    'Channel "i_test" is already registered.'
                );
            });
        });

        it('propagates other constraint errors', () => {
            return testDB.knex.table('channel_ranks')
                    .insert({ name: 'test_user', channel: 'i_test', rank: 5 })
                    .then(() => {
                return channelDB.insert({ name: 'i_test', owner: 'test_user' });
            }).then(() => {
                throw new Error('Expected error due to already existing channel');
            }).catch(error => {
                assert.strictEqual(
                    error.code,
                    'ER_DUP_ENTRY'
                );
            });
        });
    });

    describe('#deleteByName', () => {
        it('deletes a channel', () => {
            return insert(channel).then(() => {
                return channelDB.deleteByName('i_test');
            }).then(() => {
                return fetch({ name: 'i_test' });
            }).then(deleted => {
                assert.strictEqual(deleted, undefined);
            });
        });

        it('deletes other crap associated with a channel', () => {
            let channelId;

            return insert(channel).then(() => {
                return fetch({ name: 'i_test' });
            }).then(retrieved => {
                channelId = retrieved.id;
            }).then(() => {
                return testDB.knex.table('channel_ranks')
                        .insert({
                            channel: 'i_test',
                            name: 'test',
                            rank: 5
                        });
            }).then(() => {
                return testDB.knex.table('channel_bans')
                        .insert({
                            channel: 'i_test',
                            ip: '',
                            name: 'banned_dude',
                            reason: ''
                        });
            }).then(() => {
                return testDB.knex.table('channel_libraries')
                        .insert({
                            channel: 'i_test',
                            id: Math.random().toString(32),
                            title: 'testing',
                            seconds: 1,
                            type: 'tt',
                            meta: ''
                        });
            }).then(() => {
                return testDB.knex.table('channel_data')
                        .insert({
                            channel_id: channelId,
                            key: 'test',
                            value: 'test'
                        });
            }).then(() => {
                return channelDB.deleteByName('i_test');
            }).then(() => {
                return testDB.knex.table('channel_ranks')
                        .where({ channel: 'i_test' })
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 0);

                return testDB.knex.table('channel_bans')
                        .where({ channel: 'i_test' })
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 0);

                return testDB.knex.table('channel_libraries')
                        .where({ channel: 'i_test' })
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 0);

                return testDB.knex.table('channel_data')
                        .where({ channel_id: channelId })
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 0);
            });
        });
    });
});
