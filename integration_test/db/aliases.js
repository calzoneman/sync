const assert = require('assert');
const AliasesDB = require('../../lib/db/aliases').AliasesDB;
const testDB = require('../testutil/db').testDB;

const aliasesDB = new AliasesDB(testDB);
const testIPs = ['111.111.111.111', '111.111.111.222'];
const testNames = ['itest1', 'itest2'];

function cleanup() {
    return testDB.knex.table('aliases')
            .where('ip', 'in', testIPs)
            .del()
            .then(() => {
        return testDB.knex.table('aliases')
                .where('name', 'in', testNames)
                .del();
    });
}

function addSomeAliases() {
    return cleanup().then(() => {
        return testDB.knex.table('aliases')
                .insert([
                    { ip: testIPs[0], name: testNames[0], time: Date.now() },
                    { ip: testIPs[0], name: testNames[1], time: Date.now() },
                    { ip: testIPs[1], name: testNames[1], time: Date.now() }
                ]);
    });
}

describe('AliasesDB', () => {
    describe('#addAlias', () => {
        beforeEach(cleanup);
        afterEach(cleanup);

        it('adds a new alias', () => {
            return aliasesDB.addAlias(testIPs[0], testNames[0])
                    .then(() => {
                return testDB.knex.table('aliases')
                        .where({ ip: testIPs[0], name: testNames[0] })
                        .select()
                        .then(rows => {
                    assert.strictEqual(rows.length, 1, 'expected 1 row');
                });
            });
        });
    });

    describe('#getAliasesByIP', () => {
        beforeEach(addSomeAliases);
        afterEach(cleanup);

        it('retrieves aliases by IP', () => {
            return aliasesDB.getAliasesByIP(testIPs[0])
                    .then(names => assert.deepStrictEqual(
                            names.sort(), testNames.sort()));
        });

        it('retrieves aliases by partial IP', () => {
            return aliasesDB.getAliasesByIP(testIPs[0].substring(4))
                    .then(names => assert.deepStrictEqual(
                            names.sort(), testNames.sort()));
        });
    });

    describe('#getIPsByName', () => {
        beforeEach(addSomeAliases);
        afterEach(cleanup);

        it('retrieves IPs by name', () => {
            return aliasesDB.getIPsByName(testNames[1])
                    .then(ips => assert.deepStrictEqual(
                            ips.sort(), testIPs.sort()));
        });
    });
});
