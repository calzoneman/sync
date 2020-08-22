const assert = require('assert');
const PasswordResetDB = require('../../lib/db/password-reset').PasswordResetDB;
const testDB = require('../testutil/db').testDB;
const { o } = require('../testutil/o');

const passwordResetDB = new PasswordResetDB(testDB);

function cleanup() {
    return testDB.knex.table('password_reset').del();
}

describe('PasswordResetDB', () => {
    describe('#insert', () => {
        beforeEach(cleanup);

        const params = {
            ip: '1.2.3.4',
            name: 'testing',
            email: 'test@example.com',
            hash: 'abcdef',
            expire: 5678
        };

        it('adds a new password reset', () => {
            return passwordResetDB.insert(params).then(() => {
                return testDB.knex.table('password_reset')
                        .where({ name: 'testing' })
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 1);
                assert.deepStrictEqual(o(rows[0]), params);
            });
        });

        it('overwrites an existing reset for the same name', () => {
            return passwordResetDB.insert(params).then(() => {
                params.ip = '5.6.7.8';
                params.email = 'somethingelse@example.com';
                params.hash = 'qwertyuiop';
                params.expire = 9999;

                return passwordResetDB.insert(params);
            }).then(() => {
                return testDB.knex.table('password_reset')
                        .where({ name: 'testing' })
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 1);
                assert.deepStrictEqual(o(rows[0]), params);
            });
        });
    });

    describe('#get', () => {
        const reset = {
            ip: '1.2.3.4',
            name: 'testing',
            email: 'test@example.com',
            hash: 'abcdef',
            expire: 5678
        };

        beforeEach(() => cleanup().then(() => {
            return testDB.knex.table('password_reset').insert(reset);
        }));

        it('gets a password reset by hash', () => {
            return passwordResetDB.get(reset.hash).then(result => {
                assert.deepStrictEqual(o(result), reset);
            });
        });

        it('throws when no reset exists for the input', () => {
            return passwordResetDB.get('lalala').then(() => {
                assert.fail('Expected not found error');
            }).catch(error => {
                assert.strictEqual(
                        error.message,
                        'No password reset found for hash lalala'
                );
            });
        });
    });

    describe('#delete', () => {
        const reset = {
            ip: '1.2.3.4',
            name: 'testing',
            email: 'test@example.com',
            hash: 'abcdef',
            expire: 5678
        };

        beforeEach(() => cleanup().then(() => {
            return testDB.knex.table('password_reset').insert(reset);
        }));

        it('deletes a password reset by hash', () => {
            return passwordResetDB.delete(reset.hash).then(() => {
                return testDB.knex.table('password_reset')
                        .where({ name: 'testing' })
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 0);
            });
        });
    });

    describe('#cleanup', () => {
        const now = Date.now();

        const reset1 = {
            ip: '1.2.3.4',
            name: 'testing',
            email: 'test@example.com',
            hash: 'abcdef',
            expire: now - 25 * 60 * 60 * 1000
        };

        const reset2 = {
            ip: '5.6.7.8',
            name: 'testing2',
            email: 'test@example.com',
            hash: 'abcdef',
            expire: now
        };

        beforeEach(() => cleanup().then(() => {
            return testDB.knex.table('password_reset')
                    .insert([reset1, reset2]);
        }));

        it('cleans up old password resets', () => {
            return passwordResetDB.cleanup().then(() => {
                return testDB.knex.table('password_reset')
                        .whereIn('name', ['testing1', 'testing2'])
                        .select();
            }).then(rows => {
                assert.strictEqual(rows.length, 1);
                assert.deepStrictEqual(o(rows[0]), reset2);
            });
        });
    });
});
