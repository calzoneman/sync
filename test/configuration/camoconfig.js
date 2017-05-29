const assert = require('assert');
const CamoConfig = require('../../lib/configuration/camoconfig').CamoConfig;

describe('CamoConfig', () => {
    describe('#constructor', () => {
        it('strips trailing slashes from the server', () => {
            const config = new CamoConfig({
                camo: {
                    server: 'http://abc.xyz/'
                }
            });
            assert.strictEqual(config.getServer(), 'http://abc.xyz');
        });

        it('defaults to enabled=false', () => {
            assert.strictEqual(new CamoConfig().isEnabled(), false);
        });
    });

    describe('#getWhitelistedDomains', () => {
        it('defaults to an empty array', () => {
            assert.deepStrictEqual(new CamoConfig().getWhitelistedDomains(), []);
        });
    });
});
