const assert = require('assert');
const Camo = require('../lib/camo');
const CamoConfig = require('../lib/configuration/camoconfig').CamoConfig;

describe('Camo', () => {
    const config = new CamoConfig({
        camo: {
            server: 'http://localhost:8081',
            key: '9LKC7708ZHOVRCTLOLE3G2YJ0U1T8F96',
            'whitelisted-domains': ['def.xyz', 'tii.kzz.qqq'],
            encoding: 'hex'
        }
    });

    describe('#camoify', () => {
        it('constructs a camo url', () => {
            const result = Camo.camoify(config, 'http://abc.xyz/image.jpeg');
            assert.strictEqual(result, 'http://localhost:8081/a9c295dd7d8dcbc8247dec97ac5d9b4ee8baeb31/687474703a2f2f6162632e78797a2f696d6167652e6a706567');
        });

        it('constructs a camo url using url encoding', () => {
            const config = new CamoConfig({
                camo: {
                    server: 'http://localhost:8081',
                    key: '9LKC7708ZHOVRCTLOLE3G2YJ0U1T8F96',
                    'whitelisted-domains': ['def.xyz'],
                    encoding: 'url'
                }
            });

            const result = Camo.camoify(config, 'http://abc.xyz/image.jpeg');
            assert.strictEqual(result, 'http://localhost:8081/a9c295dd7d8dcbc8247dec97ac5d9b4ee8baeb31?url=http%3A%2F%2Fabc.xyz%2Fimage.jpeg');
        });

        it('bypasses camo for whitelisted domains', () => {
            const result = Camo.camoify(config, 'http://def.xyz/image.jpeg');
            assert.strictEqual(result, 'https://def.xyz/image.jpeg');
        });

        it('bypasses camo for whitelisted domains subdomains', () => {
            const result = Camo.camoify(config, 'http://abc.def.xyz/image.jpeg');
            assert.strictEqual(result, 'https://abc.def.xyz/image.jpeg');
        });

        it('does not bypass camo for a non-subdomain match', () => {
            const result = Camo.camoify(config, 'http://abcdef.xyz/image.jpeg');
            assert.strictEqual(result, 'http://localhost:8081/19f53f65e8081a064cff54fbd665e8bb08612aa6/687474703a2f2f6162636465662e78797a2f696d6167652e6a706567');
        });

        it('does not bypass camo when no whitelist is configured', () => {
            const config = new CamoConfig({
                camo: {
                    server: 'http://localhost:8081',
                    key: '9LKC7708ZHOVRCTLOLE3G2YJ0U1T8F96',
                    encoding: 'hex'
                }
            });
            const result = Camo.camoify(config, 'http://abcdef.xyz/image.jpeg');
            assert.strictEqual(result, 'http://localhost:8081/19f53f65e8081a064cff54fbd665e8bb08612aa6/687474703a2f2f6162636465662e78797a2f696d6167652e6a706567');
        });
    });

    describe('#transformImgTags', () => {
        it('transforms an img tag with a src', () => {
            const attribs = {
                src: 'http://abc.xyz/image.jpeg',
                'class': 'some-image'
            };
            const expectedAttribs = {
                src: 'http://localhost:8081/a9c295dd7d8dcbc8247dec97ac5d9b4ee8baeb31/687474703a2f2f6162632e78797a2f696d6167652e6a706567',
                'class': 'some-image'
            };
            const result = Camo.transformImgTags(config, 'img', attribs);
            assert.deepStrictEqual(result, { tagName: 'img', attribs: expectedAttribs });
        });

        it('skips img tags with no src', () => {
            const attribs = { 'class': 'some-image' };
            const result = Camo.transformImgTags(config, 'img', attribs);
            assert.deepStrictEqual(result, { tagName: 'img', attribs: attribs });
        });

        it('fails gracefully', () => {
            const attribs = { src: 'http://abc.xyz/image.jpeg' };
            const config = new CamoConfig({ camo: { enabled: true }});
            config.getKey = () => { throw new Error('something happened'); };
            const result = Camo.transformImgTags(config, 'img', attribs);
            assert.deepStrictEqual(result, { tagName: 'img', attribs: attribs });
        });
    });
});
