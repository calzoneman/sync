const assert = require('assert');
const http = require('http');
const server = require('../lib/prometheus-server');
const PrometheusConfig = require('../lib/configuration/prometheusconfig').PrometheusConfig;

describe('prometheus-server', () => {
    before(done => {
        let inst = server.init(new PrometheusConfig({
            prometheus: {
                enabled: true,
                port: 19820,
                host: '127.0.0.1',
                path: '/metrics'
            }
        }));
        inst.once('listening', () => done());
    });

    function checkReq(options, done) {
        const req = http.request({
            method: options.method,
            host: '127.0.0.1',
            port: 19820,
            path: options.path
        }, res => {
            assert.strictEqual(res.statusCode, options.expectedStatusCode);
            assert.strictEqual(res.headers['content-type'], options.expectedContentType);
            res.on('data', () => {});
            res.on('end', () => done());
        });

        req.end();
    }

    it('rejects a non-GET request', done => {
        checkReq({
            method: 'POST',
            path: '/metrics',
            expectedStatusCode: 400,
            expectedContentType: 'text/plain'
        }, done);
    });

    it('rejects a request for the wrong path', done => {
        checkReq({
            method: 'GET',
            path: '/qwerty',
            expectedStatusCode: 400,
            expectedContentType: 'text/plain'
        }, done);
    });

    it('accepts a request for the configured path', done => {
        checkReq({
            method: 'GET',
            path: '/metrics',
            expectedStatusCode: 200,
            expectedContentType: 'text/plain; version=0.0.4; charset=utf-8'
        }, done);
    });

    after(() => {
        server.shutdown();
    });
});
