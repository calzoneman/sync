const assert = require('assert');
const { validate } = require('../lib/custom-media');

describe('custom-media', () => {
    let valid, invalid;
    beforeEach(() => {
        invalid = valid = {
            title: 'Test Video',
            duration: 10,
            live: false,
            thumbnail: 'https://example.com/thumb.jpg',
            sources: [
                {
                    url: 'https://example.com/video.mp4',
                    contentType: 'video/mp4',
                    quality: 1080,
                    bitrate: 5000
                }
            ],
            textTracks: [
                {
                    url: 'https://example.com/subtitles.vtt',
                    contentType: 'text/vtt',
                    name: 'English Subtitles'
                }
            ]
        };
    });

    describe('#validate', () => {
        it('accepts valid metadata', () => {
            validate(valid);
        });

        it('accepts valid metadata with no optional params', () => {
            delete valid.live;
            delete valid.thumbnail;
            delete valid.textTracks;
            delete valid.sources[0].bitrate;

            validate(valid);
        });

        it('rejects missing title', () => {
            delete invalid.title;

            assert.throws(() => validate(invalid), /title must be a string/);
        });

        it('rejects blank title', () => {
            invalid.title = '';

            assert.throws(() => validate(invalid), /title must not be blank/);
        });

        it('rejects non-numeric duration', () => {
            invalid.duration = 'twenty four seconds';

            assert.throws(() => validate(invalid), /duration must be a number/);
        });

        it('rejects non-finite duration', () => {
            invalid.duration = NaN;

            assert.throws(() => validate(invalid), /duration must be a non-negative finite number/);
        });

        it('rejects negative duration', () => {
            invalid.duration = -1;

            assert.throws(() => validate(invalid), /duration must be a non-negative finite number/);
        });

        it('rejects non-boolean live', () => {
            invalid.live = 'false';

            assert.throws(() => validate(invalid), /live must be a boolean/);
        });

        it('rejects non-string thumbnail', () => {
            invalid.thumbnail = 1234;

            assert.throws(() => validate(invalid), /thumbnail must be a string/);
        });

        it('rejects invalid thumbnail URL', () => {
            invalid.thumbnail = 'http://example.com/thumb.jpg';

            assert.throws(() => validate(invalid), /URL protocol must be HTTPS/);
        });
    });

    describe('#validateSources', () => {
        it('rejects non-array sources', () => {
            invalid.sources = { a: 'b' };

            assert.throws(() => validate(invalid), /sources must be a list/);
        });

        it('rejects empty source list', () => {
            invalid.sources = [];

            assert.throws(() => validate(invalid), /source list must be nonempty/);
        });

        it('rejects non-string source url', () => {
            invalid.sources[0].url = 1234;

            assert.throws(() => validate(invalid), /source URL must be a string/);
        });

        it('rejects invalid source URL', () => {
            invalid.sources[0].url = 'http://example.com/thumb.jpg';

            assert.throws(() => validate(invalid), /URL protocol must be HTTPS/);
        });

        it('rejects unacceptable source contentType', () => {
            invalid.sources[0].contentType = 'rtmp/flv';

            assert.throws(() => validate(invalid), /unacceptable source contentType/);
        });

        it('rejects unacceptable source quality', () => {
            invalid.sources[0].quality = 144;

            assert.throws(() => validate(invalid), /unacceptable source quality/);
        });

        it('rejects non-numeric source bitrate', () => {
            invalid.sources[0].bitrate = '1000kbps'

            assert.throws(() => validate(invalid), /source bitrate must be a number/);
        });

        it('rejects non-finite source bitrate', () => {
            invalid.sources[0].bitrate = Infinity;

            assert.throws(() => validate(invalid), /source bitrate must be a non-negative finite number/);
        });

        it('rejects negative source bitrate', () => {
            invalid.sources[0].bitrate = -1000;

            assert.throws(() => validate(invalid), /source bitrate must be a non-negative finite number/);
        });
    });

    describe('#validateTextTracks', () => {
        it('rejects non-array text track list', () => {
            invalid.textTracks = { a: 'b' };

            assert.throws(() => validate(invalid), /textTracks must be a list/);
        });

        it('rejects non-string track url', () => {
            invalid.textTracks[0].url = 1234;

            assert.throws(() => validate(invalid), /text track URL must be a string/);
        });

        it('rejects invalid track URL', () => {
            invalid.textTracks[0].url = 'http://example.com/thumb.jpg';

            assert.throws(() => validate(invalid), /URL protocol must be HTTPS/);
        });

        it('rejects unacceptable track contentType', () => {
            invalid.textTracks[0].contentType = 'text/plain';

            assert.throws(() => validate(invalid), /unacceptable text track contentType/);
        });

        it('rejects non-string track name', () => {
            invalid.textTracks[0].name = 1234;

            assert.throws(() => validate(invalid), /text track name must be a string/);
        });

        it('rejects blank track name', () => {
            invalid.textTracks[0].name = '';

            assert.throws(() => validate(invalid), /text track name must be nonempty/);
        });
    });

    describe('#validateURL', () => {
        it('rejects non-URLs', () => {
            invalid.sources[0].url = 'not a url';

            assert.throws(() => validate(invalid), /invalid URL/);
        });

        it('rejects non-https', () => {
            invalid.sources[0].url = 'http://example.com/thumb.jpg';

            assert.throws(() => validate(invalid), /URL protocol must be HTTPS/);
        });

        it('rejects IP addresses', () => {
            invalid.sources[0].url = 'https://0.0.0.0/thumb.jpg';

            assert.throws(() => validate(invalid), /URL hostname must be a domain name/);
        });
    });
});
