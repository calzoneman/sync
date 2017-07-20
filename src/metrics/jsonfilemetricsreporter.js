import fs from 'fs';

/** MetricsReporter that records metrics as JSON objects in a file, one per line */
class JSONFileMetricsReporter {
    /**
     * Create a new JSONFileMetricsReporter that writes to the given file path.
     *
     * @param {string} filename file path to write to
     */
    constructor(filename) {
        this.writeStream = fs.createWriteStream(filename, { flags: 'a' });
        this.metrics = {};
        this.timers = {};
    }

    /**
     * @see {@link module:cytube-common/metrics/metrics.incCounter}
     */
    incCounter(counter, value) {
        if (!this.metrics.hasOwnProperty(counter)) {
            this.metrics[counter] = 0;
        }

        this.metrics[counter] += value;
    }

    /**
     * Add a time metric
     *
     * @param {string} timer name of the timer
     * @param {number} ms milliseconds to record
     */
    addTime(timer, ms) {
        if (!this.timers.hasOwnProperty(timer)) {
            this.timers[timer] = {
                totalTime: 0,
                count: 0,
                p100: 0
            };
        }

        this.timers[timer].totalTime += ms;
        this.timers[timer].count++;
        if (ms > this.timers[timer].p100) {
            this.timers[timer].p100 = ms;
        }
    }

    /**
     * @see {@link module:cytube-common/metrics/metrics.addProperty}
     */
    addProperty(property, value) {
        this.metrics[property] = value;
    }

    report() {
        for (const timer in this.timers) {
            this.metrics[timer+':avg'] = this.timers[timer].totalTime / this.timers[timer].count;
            this.metrics[timer+':count'] = this.timers[timer].count;
            this.metrics[timer+':p100'] = this.timers[timer].p100;
        }

        const line = JSON.stringify(this.metrics) + '\n';
        try {
            this.writeStream.write(line);
        } finally {
            this.metrics = {};
            this.timers = {};
        }
    }
}

export { JSONFileMetricsReporter };
