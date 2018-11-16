const assert = require('assert');
const { validate, convert, lookup } = require('../lib/custom-media');
const http = require('http');

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

        it('rejects non-live DASH', () => {
            invalid.live = false;
            invalid.sources[0].contentType = 'application/dash+xml';

            assert.throws(
                () => validate(invalid),
                /contentType "application\/dash\+xml" requires live: true/
            );
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

    describe('#convert', () => {
        let expected;
        let id = 'testing';

        beforeEach(() => {
            expected = {
                id: 'testing',
                title: 'Test Video',
                seconds: 10,
                duration: '00:10',
                type: 'cm',
                meta: {
                    direct: {
                        1080: [
                            {
                                link: 'https://example.com/video.mp4',
                                contentType: 'video/mp4',
                                quality: 1080
                            }
                        ]
                    },
                    textTracks: [
                        {
                            url: 'https://example.com/subtitles.vtt',
                            contentType: 'text/vtt',
                            name: 'English Subtitles'
                        }
                    ]
                }
            };
        });

        function cleanForComparison(actual) {
            actual = actual.pack();

            // Strip out extraneous undefineds
            for (let key in actual.meta) {
                if (actual.meta[key] === undefined) delete actual.meta[key];
            }

            return actual;
        }

        it('converts custom metadata to a CyTube Media object', () => {
            const media = convert(id, valid);
            const actual = cleanForComparison(media);

            assert.deepStrictEqual(actual, expected);
        });

        it('sets duration to 0 if live = true', () => {
            valid.live = true;
            expected.duration = '00:00';
            expected.seconds = 0;

            const media = convert(id, valid);
            const actual = cleanForComparison(media);

            assert.deepStrictEqual(actual, expected);
        });
    });

    describe('#lookup', () => {
        let server;
        let serveFunc;

        beforeEach(() => {
            serveFunc = function (req, res) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.write(JSON.stringify(valid, null, 2));
                res.end();
            };

            server = http.createServer((req, res) => serveFunc(req, res));
            server.listen(10111);
        });

        afterEach(done => {
            server.close(() => done());
        });

        it('retrieves metadata', () => {
            function cleanForComparison(actual) {
                actual = actual.pack();
                delete actual.id;

                // Strip out extraneous undefineds
                for (let key in actual.meta) {
                    if (actual.meta[key] === undefined) delete actual.meta[key];
                }

                return actual;
            }

            const expected = {
                title: 'Test Video',
                seconds: 10,
                duration: '00:10',
                type: 'cm',
                meta: {
                    direct: {
                        1080: [
                            {
                                link: 'https://example.com/video.mp4',
                                contentType: 'video/mp4',
                                quality: 1080
                            }
                        ]
                    },
                    textTracks: [
                        {
                            url: 'https://example.com/subtitles.vtt',
                            contentType: 'text/vtt',
                            name: 'English Subtitles'
                        }
                    ]
                }
            };

            return lookup('http://127.0.0.1:10111/').then(result => {
                assert.deepStrictEqual(cleanForComparison(result), expected);
            });
        });

        it('rejects the wrong content-type', () => {
            serveFunc = (req, res) => {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.write(JSON.stringify(valid, null, 2));
                res.end();
            };

            return lookup('http://127.0.0.1:10111/').then(() => {
                throw new Error('Expected failure due to wrong content-type');
            }).catch(error => {
                assert.strictEqual(
                    error.message,
                    'Expected content-type application/json, not text/plain'
                );
            });
        });

        it('rejects non-200 status codes', () => {
            serveFunc = (req, res) => {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.write(JSON.stringify(valid, null, 2));
                res.end();
            };

            return lookup('http://127.0.0.1:10111/').then(() => {
                throw new Error('Expected failure due to 404');
            }).catch(error => {
                assert.strictEqual(
                    error.message,
                    'Expected HTTP 200 OK, not 404 Not Found'
                );
            });
        });

        it('rejects responses >100KB', () => {
            serveFunc = (req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.write(Buffer.alloc(200 * 1024));
                res.end();
            };

            return lookup('http://127.0.0.1:10111/').then(() => {
                throw new Error('Expected failure due to response size');
            }).catch(error => {
                assert.strictEqual(
                    error.message,
                    'Response size exceeds 100KB'
                );
            });
        });

        it('times out', () => {
            serveFunc = (req, res) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.write(JSON.stringify(valid, null, 2));

                setTimeout(() => res.end(), 100);
            };

            return lookup('http://127.0.0.1:10111/', { timeout: 1 }).then(() => {
                throw new Error('Expected failure due to request timeout');
            }).catch(error => {
                assert.strictEqual(
                    error.message,
                    'Request timed out'
                );
                assert.strictEqual(error.code, 'ETIMEDOUT');
            });
        });

        it('rejects URLs with non-http(s) protocols', () => {
            return lookup('ftp://127.0.0.1:10111/').then(() => {
                throw new Error('Expected failure due to unacceptable URL protocol');
            }).catch(error => {
                assert.strictEqual(
                    error.message,
                    'Unacceptable protocol "ftp:".  Custom metadata must be retrieved'
                            + ' by HTTP or HTTPS'
                );
            });
        });

        it('rejects invalid URLs', () => {
            return lookup('not valid').then(() => {
                throw new Error('Expected failure due to invalid URL');
            }).catch(error => {
                assert.strictEqual(
                    error.message,
                    'Invalid URL "not valid"'
                );
            });
        });
    });
});
