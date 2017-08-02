import os from 'os';

/** @module cytube-common/metrics/metrics */

const MEM_RSS = 'memory:rss';
const LOAD_1MIN = 'load:1min';
const TIMESTAMP = 'time';
const logger = require('@calzoneman/jsli')('metrics');

var delegate = null;
var reportInterval = null;
var reportHooks = [];
let warnedNoReporter = false;

function warnNoReporter() {
    if (!warnedNoReporter) {
        warnedNoReporter = true;
        logger.warn('No metrics reporter configured.  Metrics will not be recorded.');
    }
}

/**
 * Increment a metrics counter by the specified amount.
 *
 * @param {string} counter name of the counter to increment
 * @param {number} value optional value to increment by (default 1)
 */
export function incCounter(counter, amount = 1) {
    if (delegate === null) {
        warnNoReporter();
    } else {
        delegate.incCounter(counter, amount);
    }
}

/**
 * Start a timer.  Returns a handle to use to end the timer.
 *
 * @param {string} timer name
 * @return {object} timer handle
 */
export function startTimer(timer) {
    return {
        timer: timer,
        hrtime: process.hrtime()
    };
}

/**
 * Stop a timer and record the time (as an average)
 *
 * @param {object} handle timer handle to Stop
 */
export function stopTimer(handle) {
    if (delegate === null) {
        warnNoReporter();
        return;
    }
    const [seconds, ns] = process.hrtime(handle.hrtime);
    delegate.addTime(handle.timer, seconds*1e3 + ns/1e6);
}

/**
 * Add a property to the current metrics period.
 *
 * @param {string} property property name to add
 * @param {any} property value
 */
export function addProperty(property, value) {
    if (delegate === null) {
        warnNoReporter();
    } else {
        delegate.addProperty(property, value);
    }
}

/**
 * Set the metrics reporter to record to.
 *
 * @param {MetricsReporter} reporter reporter to record metrics to
 */
export function setReporter(reporter) {
    delegate = reporter;
}

/**
 * Set the interval at which to report metrics.
 *
 * @param {number} interval time in milliseconds between successive reports
 */
export function setReportInterval(interval) {
    clearInterval(reportInterval);
    if (!isNaN(interval) && interval >= 0) {
        reportInterval = setInterval(reportLoop, interval);
    }
}

/**
 * Add a callback to add additional metrics before reporting.
 *
 * @param {function(metricsReporter)} hook callback to be invoked before reporting
 */
export function addReportHook(hook) {
    reportHooks.push(hook);
}

export function clearReportHooks() {
    reportHooks = [];
}

/**
 * Force metrics to be reported right now.
 */
export function flush() {
    reportLoop();
}

function addDefaults() {
    addProperty(MEM_RSS, process.memoryUsage().rss / 1048576);
    addProperty(LOAD_1MIN, os.loadavg()[0]);
    addProperty(TIMESTAMP, new Date());
}

function reportLoop() {
    if (delegate !== null) {
        try {
            addDefaults();
            reportHooks.forEach(hook => {
                hook(delegate);
            });
            delegate.report();
        } catch (error) {
            logger.error(error.stack);
        }
    }
}
