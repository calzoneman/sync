var Logger = require('./logger');
var path = require('path');
var counterLog = new Logger.Logger(path.resolve(__dirname, '..', 'counters.log'));
import os from 'os';
import io from 'socket.io';
import Socket from 'socket.io/lib/socket';
import * as Metrics from 'cytube-common/lib/metrics/metrics';
import { JSONFileMetricsReporter } from 'cytube-common/lib/metrics/jsonfilemetricsreporter';

var counters = {};

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

const reporter = new JSONFileMetricsReporter('counters.log');
Metrics.setReporter(reporter);
Metrics.setReportInterval(60000);
Metrics.addReportHook((metrics) => {
    metrics.incCounter('socket.io:count', getConnectedSockets());
});
