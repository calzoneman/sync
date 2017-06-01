const assert = require('assert');
const sinon = require('sinon');
const TestUtilDB = require('../testutil/db');
const GlobalBanDB = require('../../lib/db/globalban').GlobalBanDB;

describe('GlobalBanDB', () => {
    let mockTx, mockDB, globalBanDB;

    beforeEach(() => {
        mockTx = new TestUtilDB.MockTx();
        mockDB = new TestUtilDB.MockDB(mockTx);
        globalBanDB = new GlobalBanDB(mockDB);
    });

    describe('#listGlobalBans', () => {
        it('lists bans from the database', () => {
            const expected = [
                { ip: '1.2.3.4', reason: 'spam' },
                { ip: '5.6', reason: 'ham' }
            ];

            sinon.stub(mockTx, 'table').withArgs('global_bans').returns(mockTx);
            sinon.stub(mockTx, 'select').resolves(expected);
            return globalBanDB.listGlobalBans().then(bans => {
                assert.deepStrictEqual(bans, expected);
            });
        });
    });

    describe('#addGlobalIPBan', () => {
        it('adds a new ban', () => {
            const input = { ip: '1.2.3.4', reason: 'spam' };

            sinon.stub(mockTx, 'table').withArgs('global_bans').returns(mockTx);
            const insert = sinon.stub(mockTx, 'insert').withArgs(input).resolves();
            return globalBanDB.addGlobalIPBan(input.ip, input.reason).then(() => {
                assert(insert.called, 'Expected insert to be called');
            });
        });

        it('updates the ban reason for an existing ban', () => {
            const input = { ip: '1.2.3.4', reason: 'spam' };

            sinon.stub(mockTx, 'table').withArgs('global_bans').returns(mockTx);
            const err = new Error();
            err.code = 'ER_DUP_ENTRY';
            const insert = sinon.stub(mockTx, 'insert').withArgs(input).rejects(err);
            const where = sinon.stub(mockTx, 'where').withArgs({ ip: input.ip }).returns(mockTx);
            const update = sinon.stub(mockTx, 'update').withArgs({ reason: input.reason }).resolves();
            return globalBanDB.addGlobalIPBan(input.ip, input.reason).then(() => {
                assert(insert.called, 'Expected insert to be called');
                assert(where.called, 'Expected where({ ip }) to be called');
                assert(update.called, 'Expected update({ reason }) to be called');
            });
        });

        it('doesn\'t call update for a non-ER_DUP_ENTRY error', () => {
            const input = { ip: '1.2.3.4', reason: 'spam' };

            sinon.stub(mockTx, 'table').withArgs('global_bans').returns(mockTx);
            const err = new Error('explosions');
            const insert = sinon.stub(mockTx, 'insert').withArgs(input).rejects(err);
            return globalBanDB.addGlobalIPBan(input.ip, input.reason).then(() => {
                assert(false, 'Expected an error');
            }).catch(error => {
                assert.strictEqual(error, err, 'Expected error to match');
                assert(insert.called, 'Expected insert to be called');
            });
        });
    });

    describe('#removeGlobalIPBan', () => {
        it('removes a global ban', () => {
            const ip = '1.2.3.4';
            sinon.stub(mockTx, 'table').withArgs('global_bans').returns(mockTx);
            const where = sinon.stub(mockTx, 'where').returns(mockTx);
            const del = sinon.stub(mockTx, 'del').resolves();
            return globalBanDB.removeGlobalIPBan(ip).then(() => {
                assert(where.called, 'Expected where({ ip }) to be called');
                assert(del.called, 'Expected del to be called');
            });
        });
    });
});
