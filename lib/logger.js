var fs = require("graceful-fs");
var path = require("path");

function getTimeString() {
    var d = new Date();
    return d.toDateString() + " " + d.toTimeString().split(" ")[0];
}

var Logger = function(filename) {
    this.filename = filename;
    this.writer = fs.createWriteStream(filename, {
        flags: "a",
        encoding: "utf-8"
    });
}

Logger.prototype.log = function () {
    var msg = "";
    for(var i in arguments)
        msg += arguments[i];

    if(this.dead) {
        return;
    }

    var str = "[" + getTimeString() + "] " + msg + "\n";
    try {
        this.writer.write(str);
    } catch(e) {
        errlog.log("WARNING: Attempted logwrite failed: " + this.filename);
        errlog.log("Message was: " + msg);
        errlog.log(e);
    }
}

Logger.prototype.close = function () {
    try {
        this.writer.end();
    } catch(e) {
        errlog.log("Log close failed: " + this.filename);
    }
}

function makeConsoleLogger(filename) {
    var log = new Logger(filename);
    log._log = log.log;
    log.log = function () {
        console.log.apply(console, arguments);
        this._log.apply(this, arguments);
    }
    return log;
}

var errlog = makeConsoleLogger(path.join(__dirname, "..", "error.log"));
var syslog = makeConsoleLogger(path.join(__dirname, "..", "sys.log"));
var eventlog = makeConsoleLogger(path.join(__dirname, "..", "events.log"));

exports.Logger = Logger;
exports.errlog = errlog;
exports.syslog = syslog;
exports.eventlog = eventlog;
