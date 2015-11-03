var Logger = require('./logger');
var counterLog = new Logger.Logger('counters.log');
import os from 'os';
import io from 'socket.io';
import Socket from 'socket.io/lib/socket';

var counters = {};

exports.add = function (counter, value) {
    if (!value) {
        value = 1;
    }

    if (!counters.hasOwnProperty(counter)) {
        counters[counter] = value;
    } else {
        counters[counter] += value;
    }
};

Socket.prototype._packet = Socket.prototype.packet;
Socket.prototype.packet = function () {
    this._packet.apply(this, arguments);
    exports.add('socket.io:packet');
};

setInterval(function () {
    try {
        counters['memory:rss'] = process.memoryUsage().rss / 1048576;
        counters['load:1min'] = os.loadavg()[0];
        counters['socket.io:count'] = io.instance.sockets.sockets.length;
        counterLog.log(JSON.stringify(counters));
    } catch (e) {
        Logger.errlog.log(e.stack);
    }
    counters = {};
}, 60000);
