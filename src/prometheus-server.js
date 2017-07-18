import http from 'http';
import { register, collectDefaultMetrics } from 'prom-client';
import { parse as parseURL } from 'url';

const LOGGER = require('@calzoneman/jsli')('prometheus-server');

let server = null;
let defaultMetricsTimer = null;

export function init(prometheusConfig) {
    if (server !== null) {
        LOGGER.error('init() called but server is already initialized! %s',
                new Error().stack);
        return;
    }

    defaultMetricsTimer = collectDefaultMetrics();

    server = http.createServer((req, res) => {
        if (req.method !== 'GET'
                || parseURL(req.url).pathname !== prometheusConfig.getPath()) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request');
            return;
        }

        res.writeHead(200, {
            'Content-Type': register.contentType
        });
        res.end(register.metrics());
    });

    server.on('error', error => {
        LOGGER.error('Server error: %s', error.stack);
    });

    server.once('listening', () => {
        LOGGER.info('Prometheus metrics reporter listening on %s:%s',
                prometheusConfig.getHost(),
                prometheusConfig.getPort());
    });

    server.listen(prometheusConfig.getPort(), prometheusConfig.getHost());
    return { once: server.once.bind(server) };
}

export function shutdown() {
    server.close();
    server = null;
    clearInterval(defaultMetricsTimer);
    defaultMetricsTimer = null;
}
