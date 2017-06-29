const assert = require('assert');
const sinon = require('sinon');
const TestUtilDB = require('../testutil/db');
const AliasesDB = require('../../lib/db/aliases').AliasesDB;

describe('AliasesDB', () => {
    let mockTx, mockDB, aliasesDB;

    beforeEach(() => {
        mockTx = new TestUtilDB.MockTx();
        mockDB = new TestUtilDB.MockDB(mockTx);
        aliasesDB = new AliasesDB(mockDB);
    });

    describe('#addAlias', () => {
        it('adds a new alias', () => {
            const ip = '1.2.3.4';
            const name = 'foo';
            sinon.stub(mockTx, 'table').withArgs('aliases').returns(mockTx);
            sinon.stub(mockTx, 'where').withArgs({ ip, name }).returns(mockTx);
            const del = sinon.stub(mockTx, 'del').resolves();
            const insert = sinon.stub(mockTx, 'insert').resolves();
            return aliasesDB.addAlias(ip, name).then(() => {
                assert(del.called, 'Expected old alias to be purged');
                assert(insert.called, 'Expected new alias to be inserted');
                const record = insert.getCall(0).args[0];
                assert.strictEqual(record.ip, ip);
                assert.strictEqual(record.name, name);
                assert(typeof record.time === 'number', 'Expected time field to be a number');
            });
        });
    });

    describe('#getAliasesByIP', () => {
        it('retrieves aliases by full IP', () => {
            const ip = '1.2.3.4';
            const rows = [
                { ip, name: 'foo' },
                { ip, name: 'bar' }
            ];

            sinon.stub(mockTx, 'table').withArgs('aliases').returns(mockTx);
            sinon.stub(mockTx, 'where').withArgs({ ip }).returns(mockTx);
            sinon.stub(mockTx, 'select').returns(mockTx);
            sinon.stub(mockTx, 'distinct').withArgs('name').returns(mockTx);
            sinon.stub(mockTx, 'orderBy').withArgs('time', 'desc').returns(mockTx);
            sinon.stub(mockTx, 'limit').withArgs(5).resolves(rows);
            return aliasesDB.getAliasesByIP(ip).then(names => {
                assert.deepStrictEqual(names.sort(), ['bar', 'foo']);
            });
        });

        it('retrieves aliases by IPv4 range', () => {
            const ip = '1.2.3';
            const rows = [
                { ip: ip + '.4', name: 'foo' },
                { ip: ip + '.5', name: 'bar' }
            ];

            sinon.stub(mockTx, 'table').withArgs('aliases').returns(mockTx);
            sinon.stub(mockTx, 'where').withArgs('ip', 'LIKE', `${ip}.%`).returns(mockTx);
            sinon.stub(mockTx, 'select').returns(mockTx);
            sinon.stub(mockTx, 'distinct').withArgs('name').returns(mockTx);
            sinon.stub(mockTx, 'orderBy').withArgs('time', 'desc').returns(mockTx);
            sinon.stub(mockTx, 'limit').withArgs(5).resolves(rows);
            return aliasesDB.getAliasesByIP(ip).then(names => {
                assert.deepStrictEqual(names.sort(), ['bar', 'foo']);
            });
        });

        it('retrieves aliases by IPv6 range', () => {
            const ip = '1:2:3';
            const rows = [
                { ip: ip + '::4', name: 'foo' },
                { ip: ip + '::5', name: 'bar' }
            ];

            sinon.stub(mockTx, 'table').withArgs('aliases').returns(mockTx);
            const where = sinon.stub(mockTx, 'where')
                    .withArgs('ip', 'LIKE', `${ip}:%`).returns(mockTx);
            sinon.stub(mockTx, 'select').returns(mockTx);
            sinon.stub(mockTx, 'distinct').withArgs('name').returns(mockTx);
            sinon.stub(mockTx, 'orderBy').withArgs('time', 'desc').returns(mockTx);
            sinon.stub(mockTx, 'limit').withArgs(5).resolves(rows);
            return aliasesDB.getAliasesByIP(ip).then(names => {
                assert(where.called, 'Expected WHERE LIKE clause');
                assert.deepStrictEqual(names.sort(), ['bar', 'foo']);
            });
        });
    });

    describe('#getIPsByName', () => {
        it('retrieves IPs by name', () => {
            const name = 'foo';
            const rows = [
                { name, ip: '1.2.3.4' },
                { name, ip: '5.6.7.8' }
            ];

            sinon.stub(mockTx, 'table').withArgs('aliases').returns(mockTx);
            sinon.stub(mockTx, 'select').withArgs('ip').returns(mockTx);
            sinon.stub(mockTx, 'where').withArgs({ name }).resolves(rows);
            return aliasesDB.getIPsByName(name).then(ips => {
                assert.deepStrictEqual(ips.sort(), ['1.2.3.4', '5.6.7.8']);
            });
        });
    });
});
