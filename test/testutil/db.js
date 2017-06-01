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

['insert', 'update', 'select', 'del', 'where', 'table'].forEach(method => {
    MockTx.prototype[method] = function () {
        return Promise.reject(new Error(`No stub defined for method "${method}"`));
    };
});

exports.MockDB = MockDB;
exports.MockTx = MockTx;
