import http from 'http';
import { register, collectDefaultMetrics } from 'prom-client';
import { parse as parseURL } from 'url';

const LOGGER = require('@calzoneman/jsli')('prometheus-server');

let server = null;

export function init(prometheusConfig) {
    if (server !== null) {
        LOGGER.error('init() called but server is already initialized! %s',
                new Error().stack);
        return;
    }

    collectDefaultMetrics();

    server = http.createServer((req, res) => {
        if (req.method !== 'GET'
                || parseURL(req.url).pathname !== prometheusConfig.getPath()) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request');
            return;
        }

        register.metrics().then(metrics => {
            res.writeHead(200, {
                'Content-Type': register.contentType
            });
            res.end(metrics);
        }).catch(error => {
            LOGGER.error('Error generating prometheus metrics: %s', error.stack);
            res.writeHead(500, {
                'Content-Type': 'text/plain'
            });
            res.end('Internal Server Error');
        });
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
}
