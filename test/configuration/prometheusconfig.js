const assert = require('assert');
const PrometheusConfig = require('../../lib/configuration/prometheusconfig').PrometheusConfig;

describe('PrometheusConfig', () => {
    describe('#constructor', () => {
        it('defaults to enabled=false', () => {
            assert.strictEqual(new PrometheusConfig().isEnabled(), false);
        });
    });
});
