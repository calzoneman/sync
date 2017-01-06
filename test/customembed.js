const customembed = require('../lib/customembed');
const assert = require('assert');

describe('customembed', () => {
    describe('#filter', () => {
        it('rejects plain-HTTP <embed> inputs', () => {
            const input = '<embed src="http://foo.bar/baz.swf" type="application/x-shockwave-flash"></embed>';
            assert.throws(() => { customembed.filter(input) }, /must be HTTPS/);
        });

        it('rejects plain-HTTP <object> inputs', () => {
            const input = '<object data="http://foo.bar/baz.swf" type="application/x-shockwave-flash"></object>';
            assert.throws(() => { customembed.filter(input) }, /must be HTTPS/);
        });

        it('rejects plain-HTTP <iframe> inputs', () => {
            const input = '<iframe src="http://foo.bar/baz.swf"></iframe>';
            assert.throws(() => { customembed.filter(input) }, /must be HTTPS/);
        });
    });
});
