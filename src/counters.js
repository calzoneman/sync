var Logger = require('./logger');
var counterLog = new Logger.Logger('counters.log');

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

setInterval(function () {
    counterLog.log(JSON.stringify(counters));
    counters = {};
}, 60000);
