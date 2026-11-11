const assert = require('assert');
const path = require('path');
const {
    shouldSkip,
    createAsset
} = require('../../lib/web/static-minify');

describe('static-minify', () => {
    describe('shouldSkip', () => {
        it('keeps normal first-party and vendor sources', () => {
            assert.strictEqual(shouldSkip('js/player.js'), false);
            assert.strictEqual(shouldSkip('js/jquery-3.7.1.js'), false);
            assert.strictEqual(shouldSkip('js/octopus/subtitles-octopus.js'), false);
            assert.strictEqual(shouldSkip('js/playerjs-0.0.12.js'), false);
            assert.strictEqual(shouldSkip('css/cytube.css'), false);
            assert.strictEqual(shouldSkip('js/vjs/video.js'), false);
        });

        it('skips already-minified and userscript files', () => {
            assert.strictEqual(shouldSkip('js/vjs/dash.all.min.js'), true);
            assert.strictEqual(shouldSkip('css/foo.min.css'), true);
            assert.strictEqual(shouldSkip('js/cytube-google-drive.user.js'), true);
            assert.strictEqual(shouldSkip('js/cytube-google-drive.meta.js'), true);
        });

        it('skips octopus/emscripten workers and backup trees', () => {
            assert.strictEqual(
                shouldSkip('js/octopus/subtitles-octopus-worker.js'),
                true
            );
            assert.strictEqual(
                shouldSkip('js/octopus/subtitles-octopus-worker-legacy.js'),
                true
            );
            assert.strictEqual(
                shouldSkip('js/octopus.bak.20261107152251/subtitles-octopus.js'),
                true
            );
        });
    });

    describe('createAsset', () => {
        const wwwRoot = path.join('/tmp', 'cytube-static-minify-test');

        it('returns the original path when minify is disabled', () => {
            const asset = createAsset({
                isMinifyEnabled: () => false,
                wwwRoot,
                existsSync: () => true
            });
            assert.strictEqual(asset('/js/player.js'), '/js/player.js');
        });

        it('rewrites to /build/ when minify is on and the file exists', () => {
            const asset = createAsset({
                isMinifyEnabled: () => true,
                wwwRoot,
                existsSync: p => p.endsWith(path.join('build', 'js', 'player.js'))
            });
            assert.strictEqual(asset('/js/player.js'), '/build/js/player.js');
        });

        it('falls back to the original path when the build file is missing', () => {
            const warnings = [];
            const asset = createAsset({
                isMinifyEnabled: () => true,
                wwwRoot,
                existsSync: () => false,
                warn: (msg, rel) => warnings.push([msg, rel])
            });
            assert.strictEqual(asset('/js/player.js'), '/js/player.js');
            assert.strictEqual(warnings.length, 1);
            // second call should not warn again
            assert.strictEqual(asset('/js/util.js'), '/js/util.js');
            assert.strictEqual(warnings.length, 1);
        });

        it('leaves non-absolute paths alone', () => {
            const asset = createAsset({
                isMinifyEnabled: () => true,
                wwwRoot,
                existsSync: () => true
            });
            assert.strictEqual(asset('js/player.js'), 'js/player.js');
            assert.strictEqual(asset(null), null);
        });
    });
});
