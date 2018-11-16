const assert = require('assert');
const TokenBucket = require('../../lib/util/token-bucket').TokenBucket;

describe('TokenBucket', () => {
    describe('#throttle', () => {
        let bucket;
        beforeEach(() => {
            bucket = new TokenBucket(5, 5);
        });

        it('consumes capacity and then throttles', () => {
            assert(!bucket.throttle(), 'should not be empty yet');
            assert(!bucket.throttle(), 'should not be empty yet');
            assert(!bucket.throttle(), 'should not be empty yet');
            assert(!bucket.throttle(), 'should not be empty yet');
            assert(!bucket.throttle(), 'should not be empty yet');
            assert(bucket.throttle(), 'should be empty now');
        });

        it('refills tokens', () => {
            bucket.count = 0;
            const oldRefill = bucket.lastRefill = Date.now() - 1000;
            assert(!bucket.throttle(), 'should have refilled');
            assert(bucket.lastRefill >= oldRefill + 1000, 'should have updated lastRefill');
        });

        it('refills at most {capacity} tokens', () => {
            bucket.count = 0;
            bucket.lastRefill = Date.now() - 10000;
            bucket.throttle();
            assert.strictEqual(bucket.count, 4);
        });

        it('does a partial refill', () => {
            bucket.count = 0;
            bucket.lastRefill = Date.now() - 400;
            bucket.throttle();
            assert.strictEqual(bucket.count, 1);
        });

        it('skips refilling if delta = 0', () => {
            bucket.count = 0;
            const oldRefill = bucket.lastRefill;
            bucket.throttle();
            assert.strictEqual(bucket.count, 0);
            assert.strictEqual(bucket.lastRefill, oldRefill);
        });

        it('handles fractional refill rates', () => {
            bucket = new TokenBucket(5, 0.1);
            bucket.count = 0;
            assert(bucket.throttle());
            bucket.lastRefill = Date.now() - 10000;
            assert(!bucket.throttle());
            assert.strictEqual(bucket.count, 0);
        });

        it('handles infinite refill rate and capacity', () => {
            bucket = new TokenBucket(Infinity, Infinity);

            for (let i = 0; i < 100; i++) {
                assert(!bucket.throttle(), 'should not throttle');
            }
        });
    });
});
