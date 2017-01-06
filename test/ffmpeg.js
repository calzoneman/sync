const assert = require('assert');
const ffmpeg = require('../lib/ffmpeg');
const Config = require('../lib/config');

describe('ffmpeg', () => {
    describe('#query', () => {
        it('rejects plain http links', done => {
            Config.set('ffmpeg.enabled', true);
            ffmpeg.query('http://foo.bar/baz.mp4', err => {
                assert(/begins with 'https:/.test(err),
                        `Expected error due to plain HTTP but got "${err}"`);
                done();
            });
        });
    });
});
