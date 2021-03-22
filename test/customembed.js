const customembed = require('../lib/customembed');
const assert = require('assert');
const crypto = require("crypto");

function sha256(input) {
    let hash = crypto.createHash('sha256');
    hash.update(input);
    return hash.digest('base64');
}

describe('customembed', () => {
    describe('#filter', () => {
        it('rejects <embed> inputs', () => {
            const input = '<embed src="https://example.com/baz.swf" type="application/x-shockwave-flash"></embed>';
            assert.throws(() => { customembed.filter(input) }, /must be an <iframe>/);
        });

        it('rejects <object> inputs', () => {
            const input = '<object data="https://example.com/baz.swf" type="application/x-shockwave-flash"></object>';
            assert.throws(() => { customembed.filter(input) }, /must be an <iframe>/);
        });

        it('rejects plain-HTTP <iframe> inputs', () => {
            const input = '<iframe src="http://foo.bar/baz.swf"></iframe>';
            assert.throws(() => { customembed.filter(input) }, /must be HTTPS/);
        });

        it('accepts a valid iframe', () => {
            let input = '<iframe src="https://example.com/video.html"</iframe>';
            const { id, title, seconds, duration, type, meta } = customembed.filter(input).pack();
            const { embed } = meta;

            assert.strictEqual(id, `cu:${sha256(input)}`);
            assert.strictEqual(title, 'Custom Media');
            assert.strictEqual(seconds, 0);
            assert.strictEqual(duration, '--:--');
            assert.strictEqual(type, 'cu');
            assert.deepStrictEqual(
                embed,
                {
                    tag: 'iframe',
                    src: 'https://example.com/video.html'
                }
            );
        });
    });
});
