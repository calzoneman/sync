const assert = require('assert');
const AccountDB = require('../../lib/db/account').AccountDB;
const testDB = require('../testutil/db').testDB;
const { InvalidRequestError } = require('../../lib/errors');

const accountDB = new AccountDB(testDB);

function cleanup() {
    return testDB.knex.table('users').del();
}

function insert(user) {
    return testDB.knex.table('users').insert(user);
}

function fetch(params) {
    return testDB.knex.table('users').where(params).first();
}

describe('AccountDB', () => {
    let account, expected;

    beforeEach(() => {
        account = {
            name: 'test',
            password: '',
            global_rank: 1,
            email: 'test@example.com',
            profile: '{"image":"image.jpeg","text":"blah"}',
            ip: '1.2.3.4',
            time: 1500000000000,
            name_dedupe: 'test'
        };

        expected = {
            name: 'test',
            password: '',
            global_rank: 1,
            email: 'test@example.com',
            profile: {
                image: 'image.jpeg',
                text: 'blah'
            },
            ip: '1.2.3.4',
            time: new Date(1500000000000),
            name_dedupe: 'test'
        };
    });

    beforeEach(cleanup);

    describe('#getByName', () => {
        it('retrieves an account by name', () => {
            return insert(account).then(() => {
                return accountDB.getByName('test');
            }).then(retrieved => {
                delete retrieved.id;

                assert.deepStrictEqual(retrieved, expected);
            });
        });

        it('defaults a blank profile', () => {
            account.profile = '';
            expected.profile = { image: '', text: '' };

            return insert(account).then(() => {
                return accountDB.getByName('test');
            }).then(retrieved => {
                delete retrieved.id;

                assert.deepStrictEqual(retrieved, expected);
            });
        });

        it('defaults an erroneous profile', () => {
            account.profile = '{not real json';
            expected.profile = { image: '', text: '' };

            return insert(account).then(() => {
                return accountDB.getByName('test');
            }).then(retrieved => {
                delete retrieved.id;

                assert.deepStrictEqual(retrieved, expected);
            });
        });

        it('returns null when no account is found', () => {
            return accountDB.getByName('test').then(retrieved => {
                assert.deepStrictEqual(retrieved, null);
            });
        });
    });

    describe('#updateByName', () => {
        it('updates the password hash', () => {
            return insert(account).then(() => {
                return accountDB.updateByName(
                    account.name,
                    { password: 'secret hash' }
                );
            }).then(() => {
                return fetch({ name: account.name });
            }).then(retrieved => {
                assert.strictEqual(retrieved.password, 'secret hash');
            });
        });

        it('updates the email', () => {
            return insert(account).then(() => {
                return accountDB.updateByName(
                    account.name,
                    { email: 'bar@example.com' }
                );
            }).then(() => {
                return fetch({ name: account.name });
            }).then(retrieved => {
                assert.strictEqual(retrieved.email, 'bar@example.com');
            });
        });

        it('updates the profile', () => {
            return insert(account).then(() => {
                return accountDB.updateByName(
                    account.name,
                    { profile: { image: 'shiggy.jpg', text: 'Costanza' } }
                );
            }).then(() => {
                return fetch({ name: account.name });
            }).then(retrieved => {
                assert.deepStrictEqual(
                    retrieved.profile,
                    '{"image":"shiggy.jpg","text":"Costanza"}'
                );
            });
        });

        it('raises an error if the username does not exist', () => {
            return accountDB.updateByName(
                account.name,
                { password: 'secret hash' }
            ).then(() => {
                throw new Error('Expected failure due to missing user');
            }).catch(error => {
                assert(
                    error instanceof InvalidRequestError,
                    'Expected InvalidRequestError'
                );
                assert.strictEqual(
                    error.message,
                    'Cannot update: name "test" does not exist'
                );
            });
        });
    });
});
