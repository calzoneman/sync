const { SimpleCache } = require('../../lib/util/simple-cache');
const assert = require('assert');

describe('SimpleCache', () => {
    const CACHE_MAX_ELEM = 5;
    const CACHE_MAX_AGE = 5;
    let cache;

    beforeEach(() => {
        cache = new SimpleCache({
            maxElem: CACHE_MAX_ELEM,
            maxAge: CACHE_MAX_AGE
        });
    });

    it('sets, gets, and deletes a value', () => {
        assert.strictEqual(cache.get('foo'), null);

        cache.put('foo', 'bar');
        assert.strictEqual(cache.get('foo'), 'bar');

        cache.delete('foo');
        assert.strictEqual(cache.get('foo'), null);
    });

    it('does not return an expired value', done => {
        cache.put('foo', 'bar');

        setTimeout(() => {
            assert.strictEqual(cache.get('foo'), null);
            done();
        }, CACHE_MAX_AGE + 1);
    });

    it('cleans up old values', done => {
        cache.put('foo', 'bar');

        setTimeout(() => {
            assert.strictEqual(cache.get('foo'), null);
            done();
        }, CACHE_MAX_AGE * 2);
    });

    it('removes the oldest entry if max elem is reached', () => {
        for (let i = 0; i < CACHE_MAX_ELEM + 1; i++) {
            cache.put(`foo${i}`, 'bar');
        }

        assert.strictEqual(cache.get('foo0'), null);
        assert.strictEqual(cache.get('foo1'), 'bar');
    });
});
