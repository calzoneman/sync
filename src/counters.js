import io from 'socket.io';
import Socket from 'socket.io/lib/socket';
import * as Metrics from './metrics/metrics';
import { JSONFileMetricsReporter } from './metrics/jsonfilemetricsreporter';

const LOGGER = require('@calzoneman/jsli')('counters');

var server = null;

exports.add = Metrics.incCounter;

Socket.prototype._packet = Socket.prototype.packet;
Socket.prototype.packet = function () {
    this._packet.apply(this, arguments);
    exports.add('socket.io:packet');
};

function getConnectedSockets() {
    var sockets = io.instance.sockets.sockets;
    if (typeof sockets.length === 'number') {
        return sockets.length;
    } else {
        return Object.keys(sockets).length;
    }
}

function setChannelCounts(metrics) {
    if (server === null) {
        server = require('./server').getServer();
    }

    try {
        var publicCount = 0;
        var allCount = 0;
        server.channels.forEach(function (c) {
            allCount++;
            if (c.modules.options && c.modules.options.get("show_public")) {
                publicCount++;
            }
        });

        metrics.addProperty('channelCount:all', allCount);
        metrics.addProperty('channelCount:public', publicCount);
    } catch (error) {
        LOGGER.error(error.stack);
    }
}

const reporter = new JSONFileMetricsReporter('counters.log');
Metrics.setReporter(reporter);
Metrics.setReportInterval(60000);
Metrics.addReportHook((metrics) => {
    metrics.addProperty('socket.io:count', getConnectedSockets());
    setChannelCounts(metrics);
});
