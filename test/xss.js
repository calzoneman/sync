const assert = require('assert');
const XSS = require('../lib/xss');

describe('XSS', () => {
    describe('sanitizeHTML', () => {
        it('behaves consistently w.r.t. special chars used in emotes', () => {
            const input    = '`^~=| _-,;:!?/."()[]{}@$*\\&#%+á\t';
            const expected = '`^~=| _-,;:!?/."()[]{}@$*\\&amp;#%+á\t';
            assert.strictEqual(XSS.sanitizeHTML(input), expected);
        });

        it('disallows iframes', () => {
            const input    = '<iframe src="https://example.com"></iframe>';
            const expected = '';
            assert.strictEqual(XSS.sanitizeHTML(input), expected);
        });
    });
});
