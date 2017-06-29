const Promise = require('bluebird');

function MockDB(mockTx) {
    this.mockTx = mockTx;
}

MockDB.prototype = {
    runTransaction: function runTransaction(fn) {
        return fn(this.mockTx);
    }
};

function MockTx() {

}

[
    'del',
    'distinct',
    'insert',
    'limit',
    'orderBy',
    'select',
    'table',
    'update',
    'where',
].forEach(method => {
    MockTx.prototype[method] = function () {
        return Promise.reject(new Error(`No stub defined for method "${method}"`));
    };
});

exports.MockDB = MockDB;
exports.MockTx = MockTx;
