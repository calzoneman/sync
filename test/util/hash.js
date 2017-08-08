const { hash } = require('../../lib/util/hash');
const assert = require('assert');

describe('hash', () => {
    describe('#hash', () => {
        const input = 'this is a test';

        it('hashes input correctly', () => {
            const sha256_hex = '2e99758548972a8e8822ad47fa1017ff72f06f3ff6a016851f45c398732bc50c';
            assert.strictEqual(hash('sha256', input, 'hex'), sha256_hex);
        });

        it('hashes input to base64', () => {
            const sha256_base64 = 'Lpl1hUiXKo6IIq1H+hAX/3Lwbz/2oBaFH0XDmHMrxQw=';
            assert.strictEqual(hash('sha256', input, 'base64'), sha256_base64);
        });
    });
});
