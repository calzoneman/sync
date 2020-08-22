const assert = require('assert');
const GlobalBanDB = require('../../lib/db/globalban').GlobalBanDB;
const testDB = require('../testutil/db').testDB;
const { o } = require('../testutil/o');

const globalBanDB = new GlobalBanDB(testDB);
const testBan = { ip: '8.8.8.8', reason: 'test' };

function cleanupTestBan() {
    return testDB.knex.table('global_bans')
            .where({ ip: testBan.ip })
            .del();
}

function setupTestBan() {
    return testDB.knex.table('global_bans')
            .insert(testBan)
            .catch(error => {
        if (error.code === 'ER_DUP_ENTRY') {
            return testDB.knex.table('global_bans')
                    .where({ ip: testBan.ip })
                    .update({ reason: testBan.reason });
        }

        throw error;
    });
}

describe('GlobalBanDB', () => {
    describe('#listGlobalBans', () => {
        beforeEach(setupTestBan);
        afterEach(cleanupTestBan);

        it('lists existing IP bans', () => {
            return globalBanDB.listGlobalBans().then(bans => {
                assert.deepStrictEqual([{
                    ip: '8.8.8.8',
                    reason: 'test'
                }], bans.map(o));
            });
        });
    });

    describe('#addGlobalIPBan', () => {
        beforeEach(cleanupTestBan);
        afterEach(cleanupTestBan);

        it('adds a new ban', () => {
            return globalBanDB.addGlobalIPBan('8.8.8.8', 'test').then(() => {
                return testDB.knex.table('global_bans')
                        .where({ ip: '8.8.8.8' })
                        .select()
                        .then(rows => {
                    assert.strictEqual(rows.length, 1, 'Expected 1 row');
                    assert.strictEqual(rows[0].ip, '8.8.8.8');
                    assert.strictEqual(rows[0].reason, 'test');
                });
            });
        });

        it('updates the reason on an existing ban', () => {
            return globalBanDB.addGlobalIPBan('8.8.8.8', 'test').then(() => {
                return globalBanDB.addGlobalIPBan('8.8.8.8', 'different').then(() => {
                    return testDB.knex.table('global_bans')
                            .where({ ip: '8.8.8.8' })
                            .select()
                            .then(rows => {
                        assert.strictEqual(rows.length, 1, 'Expected 1 row');
                        assert.strictEqual(rows[0].ip, '8.8.8.8');
                        assert.strictEqual(rows[0].reason, 'different');
                    });
                });
            });
        });
    });

    describe('#removeGlobalIPBan', () => {
        beforeEach(setupTestBan);
        afterEach(cleanupTestBan);

        it('removes a ban', () => {
            return globalBanDB.removeGlobalIPBan('8.8.8.8').then(() => {
                return testDB.knex.table('global_bans')
                        .where({ ip: '8.8.8.8' })
                        .select()
                        .then(rows => {
                    assert.strictEqual(rows.length, 0, 'Expected 0 rows');
                });
            });
        });
    });
});
