const assert = require('assert');
const { Multimap } = require('../../lib/util/multimap');

describe('Multimap', () => {
    let map;

    beforeEach(() => {
        map = new Multimap();
    });

    it('returns the empty set for an unset key', () => {
        assert.deepEqual(map.get('unknown'), new Set());
    });

    it('returns a set of values for a given key', () => {
        map.set('a', 1);
        map.set('a', 2);
        map.set('a', 1);

        assert.deepEqual(map.get('a'), new Set([1, 2]));
    });

    it('deletes a value for a given key', () => {
        map.set('a', 1);
        map.set('a', 2);
        map.delete('a', 1);

        assert.deepEqual(map.get('a'), new Set([2]));

        map.delete('a', 2);

        assert.deepEqual(map.get('a'), new Set());
    });
});
