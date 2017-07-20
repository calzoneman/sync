var assert = require('assert');
var JSONFileMetricsReporter = require('../../lib/metrics/jsonfilemetricsreporter').JSONFileMetricsReporter;
var Metrics = require('../../lib/metrics/metrics');
var os = require('os');
var fs = require('fs');
var path = require('path');

describe('JSONFileMetricsReporter', function () {
    describe('#report', function () {
        it('reports metrics to file', function (done) {
            const outfile = path.resolve(os.tmpdir(),
                    'metrics' + Math.random() + '.txt');
            const reporter = new JSONFileMetricsReporter(outfile);
            Metrics.setReporter(reporter);
            Metrics.incCounter('abc');
            Metrics.incCounter('abc');
            Metrics.incCounter('def', 10);
            Metrics.addProperty('foo', { bar: 'baz' });
            Metrics.flush();

            setTimeout(function () {
                const contents = String(fs.readFileSync(outfile));
                const data = JSON.parse(contents);
                assert.strictEqual(data.abc, 2);
                assert.strictEqual(data.def, 10);
                assert.deepStrictEqual(data.foo, { bar: 'baz' });

                fs.unlinkSync(outfile);
                done();
            }, 100);
        });
    });
});
