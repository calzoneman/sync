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

        it('validates that encoding must be either url or hex', () => {

            assert.throws(() => {
                new CamoConfig({
                    camo: {
                        encoding: 'asdjfnasdf'
                    }
                });
            }, /must be either 'url' or 'hex'/);
        });
    });

    describe('#getWhitelistedDomains', () => {
        it('defaults to an empty array', () => {
            assert.deepStrictEqual(new CamoConfig().getWhitelistedDomains(), []);
        });
    });

    describe('#getEncoding', () => {
        it('defaults to url', () => {
            assert.deepStrictEqual(new CamoConfig().getEncoding(), 'url');
        });
    });

    describe('#getWhitelistedDomainsRegexp', () => {
        it('generates a regex based on the whitelisted domains', () => {
            const config = new CamoConfig({
                camo: {
                    server: 'localhost:8081',
                    'whitelisted-domains': ['abc.xyz', 'tii.kzz.qqq']
                }
            });

            const re = config.getWhitelistedDomainsRegexp();
            assert.deepStrictEqual(re, /\.abc\.xyz$|\.tii\.kzz\.qqq$/i);
        });
    });
});
