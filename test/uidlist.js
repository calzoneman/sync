var assert = require('assert');

var UidList = require('../lib/uidlist');

describe('UidList', function () {
    describe('#insertHead', function () {
        it('should insert into an empty list', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            assert(uid, 'uid should be non-null');
            assert.equal(list._headUid, uid, 'this._headUid should be updated');
            assert.equal(list._tailUid, uid, 'this._tailUid should be updated');
            assert.equal(list.length, 1, 'this.length should be updated');
            assert.deepEqual(list._items[uid], {
                uid: uid,
                prevUid: null,
                nextUid: null,
                payload: { foo: 'bar' }
            }, 'should have created item correctly');
        });

        it('should insert into a nonempty list', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            assert(uid2, 'uid should be non-null');
            assert.equal(list._headUid, uid2, 'this._headUid should be updated');
            assert.equal(list._items[uid].prevUid, uid2, 'prevUid should be updated');
            assert.equal(list.length, 2, 'this.length should be updated');
            assert.deepEqual(list._items[uid2], {
                uid: uid2,
                prevUid: null,
                nextUid: uid,
                payload: { bar: 'baz' }
            }, 'should have created item correctly');
        });
    });

    describe('#insertTail', function () {
        it('should insert into an empty list', function () {
            var list = new UidList();
            var uid = list.insertTail({ foo: 'bar' });
            assert(uid, 'uid should be non-null');
            assert.equal(list._headUid, uid, 'this._headUid should be updated');
            assert.equal(list._tailUid, uid, 'this._tailUid should be updated');
            assert.equal(list.length, 1, 'this.length should be updated');
            assert.deepEqual(list._items[uid], {
                uid: uid,
                prevUid: null,
                nextUid: null,
                payload: { foo: 'bar' }
            }, 'should have created item correctly');
        });

        it('should insert into a nonempty list', function () {
            var list = new UidList();
            var uid = list.insertTail({ foo: 'bar' });
            var uid2 = list.insertTail({ bar: 'baz' });
            assert(uid2, 'uid should be non-null');
            assert.equal(list._tailUid, uid2, 'this._tailUid should be updated');
            assert.equal(list._items[uid].nextUid, uid2, 'nextUid should be updated');
            assert.equal(list.length, 2, 'this.length should be updated');
            assert.deepEqual(list._items[uid2], {
                uid: uid2,
                prevUid: uid,
                nextUid: null,
                payload: { bar: 'baz' }
            }, 'should have created item correctly');
        });
    });

    describe('#insertAfter', function () {
        it('should throw when given a nonexistant uid', function () {
            var list = new UidList();
            try {
                var uid = list.insertAfter('foo', 42);
                assert.fail('should have thrown ReferenceError');
            } catch (e) {
                assert.equal(e.message, 'Target uid not found');
            }
        });

        it('should insert into a nonempty list', function () {
            var list = new UidList();
            var uid = list.insertTail({ foo: 'bar' });
            var uid2 = list.insertTail({ bar: 'baz' });
            var uid3 = list.insertAfter('test', uid);
            assert(uid3, 'uid should be non-null');
            assert.equal(list._items[uid2].prevUid, uid3, 'should have updated prevUid');
            assert.equal(list._items[uid].prevUid, null, 'should have updated prevUid');
            assert.equal(list._items[uid].nextUid, uid3, 'should have updated nextUid');
            assert.equal(list._items[uid2].nextUid, null, 'should have updated nextUid');
            assert.equal(list._tailUid, uid2, 'this._tailUid should not be updated');
            assert.equal(list.length, 3, 'this.length should be updated');
            assert.deepEqual(list._items[uid3], {
                uid: uid3,
                prevUid: uid,
                nextUid: uid2,
                payload: 'test'
            }, 'should have created item correctly');
        });
    });

    describe('#insertBefore', function () {
        it('should throw when given a nonexistant uid', function () {
            var list = new UidList();
            try {
                var uid = list.insertBefore('foo', 42);
                assert.fail('should have thrown ReferenceError');
            } catch (e) {
                assert.equal(e.message, 'Target uid not found');
            }
        });

        it('should insert into a nonempty list', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);
            assert(uid3, 'uid should be non-null');
            assert.equal(list._items[uid2].prevUid, null, 'should have updated prevUid');
            assert.equal(list._items[uid].prevUid, uid3, 'should have updated prevUid');
            assert.equal(list._items[uid].nextUid, null, 'should have updated nextUid');
            assert.equal(list._items[uid2].nextUid, uid3, 'should have updated nextUid');
            assert.equal(list._tailUid, uid, 'this._tailUid should not be updated');
            assert.equal(list.length, 3, 'this.length should be updated');
            assert.deepEqual(list._items[uid3], {
                uid: uid3,
                prevUid: uid2,
                nextUid: uid,
                payload: 'test'
            }, 'should have created item correctly');
        });
    });

    describe('#get', function () {
        it('should throw when given a nonexistant uid', function () {
            var list = new UidList();
            try {
                var item = list.get(42);
                assert.fail('should have thrown ReferenceError');
            } catch (e) {
                assert.equal(e.message, 'Target uid not found');
            }
        });

        it('should retrieve an item correctly', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);

            var item = list.get(uid3);
            assert.equal(item, 'test', 'should have retrieved item');
        });
    });

    describe('#find', function () {
        it('should return false when no items match', function () {
            var list = new UidList();
            list.insertHead({ foo: 'bar' });

            var item = list.find(function (item) {
                return item.foo === 'fuzzle';
            });

            assert.equal(item, false, 'should return false');
        });

        it('should return the first matching item', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);

            var item = list.find(function (item) {
                return item.foo !== 'bar';
            });

            assert.deepEqual(item, { bar: 'baz' }, 'should have retrieved item for uid2');
        });
    });

    describe('#findAll', function () {
        it('should return the all matching items', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);

            var items = list.findAll(function (item) {
                return typeof item === 'object';
            });

            assert.deepEqual(items, [
                list.get(uid2),
                list.get(uid)
            ], 'should have retrieved 2 items');

            var items = list.findAll(function () { return false; });
            assert.equal(items.length, 0, 'should have retrieved no items');
        });
    });

    describe('#remove', function () {
        it('should remove an item', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);

            list.remove(uid3);
            assert.equal(list._items[uid].prevUid, uid2, 'should have updated prevUid');
            assert.equal(list._items[uid2].nextUid, uid, 'should have updated nextUid');
            assert(!list._items.hasOwnProperty(uid3), 'should have deleted item');
            assert.equal(list.length, 2, 'should have decremented length');

            list.remove(uid2);
            assert.equal(list._headUid, uid, 'should have updated headUid');

            uid2 = list.insertBefore({ bar: 'baz' }, uid);
            list.remove(uid);
            assert.equal(list._tailUid, uid2, 'should have updated tailUid');
        });
    });

    describe('#clear', function () {
        it('should clear all items', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);

            list.clear();

            assert.equal(list.length, 0, 'should have reset length');
            assert.deepEqual(list._items, {}, 'should have cleared items');
            assert.equal(list._headUid, null, 'should have updated headUid');
            assert.equal(list._tailUid, null, 'should have updated tailUid');
        });
    });

    describe('#toArray', function () {
        it('should convert with wrapWithUid=false', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);

            var array = list.toArray();
            assert.deepEqual(array, [
                { bar: 'baz' },
                'test',
                { foo: 'bar'}
            ], 'should have created array correctly');
        });

        it('should convert with wrapWithUid=true', function () {
            var list = new UidList();
            var uid = list.insertHead({ foo: 'bar' });
            var uid2 = list.insertHead({ bar: 'baz' });
            var uid3 = list.insertBefore('test', uid);

            var array = list.toArray({
                wrapWithUid: true,
                payloadKey: 'media'
            });

            assert.deepEqual(array, [
                {
                    uid: uid2,
                    media: { bar: 'baz' }
                },
                {
                    uid: uid3,
                    media: 'test'
                },
                {
                    uid: uid,
                    media: { foo: 'bar'}
                }
            ], 'should have created array correctly');
        });
    });

    describe('#forEach', function () {
        it('should iterate across all items', function () {
            var list = new UidList();
            var uid = list.insertHead({});
            var uid2 = list.insertHead({});
            var uid3 = list.insertBefore({}, uid);

            list.forEach(function (item) {
                item.processed = true;
            });

            assert.deepEqual(list.toArray(), [
                { processed: true },
                { processed: true },
                { processed: true }
            ], 'should have processed all items');
        });
    });
});
