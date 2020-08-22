const assert = require('assert');
const { testDB } = require('../testutil/db');
const accounts = require('../../lib/database/accounts');

require('../../lib/database').init(testDB);

describe('AccountsDatabase', () => {
    describe('#verifyLogin', () => {
        let ip = '169.254.111.111';
        let user;
        let password;

        beforeEach(async () => {
            return testDB.knex.table('users')
                    .where({ ip })
                    .delete();
        });

        beforeEach(done => {
            user = `u${Math.random().toString(31).substring(2)}`;
            password = 'int!gration_Test';

            accounts.register(
                user,
                password,
                '',
                ip,
                (error, res) => {
                    if (error) {
                        throw error;
                    }

                    console.log(`Created test user ${user}`);
                    done();
                }
            )
        });

        it('verifies a correct login', done => {
            accounts.verifyLogin(
                user,
                password,
                (error, res) => {
                    if (error) {
                        throw error;
                    }

                    assert.strictEqual(res.name, user);
                    done();
                }
            );
        });

        it('rejects an incorrect login', done => {
            accounts.verifyLogin(
                user,
                'not the right password',
                (error, res) => {
                    assert.strictEqual(error, 'Invalid username/password combination');
                    done();
                }
            );
        });
    });
});
