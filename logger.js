/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");

function getTimeString() {
    var d = new Date();
    return d.toDateString() + " " + d.toTimeString().split(" ")[0];
}

var Logger = function(filename) {
    this.dead = false;
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
        errlog.log("WARNING: Attempted write to dead logger: ", this.filename);
        errlog.log("Message was: ", msg);
        return;
    }

    var str = "[" + getTimeString() + "] " + msg + "\n";
    this.writer.write(str);
}

Logger.prototype.close = function () {
    if(this.dead) {
        errlog.log("WARNING: Attempted closure on dead logger: ", this.filename);
        return;
    }
    this.writer.end("", null, function () {
        this.dead = true;
    }.bind(this));
}

var errlog = new Logger("error.log");
var syslog = new Logger("sys.log");
errlog.actualLog = errlog.log;
errlog.log = function(what) { console.log(what); this.actualLog(what); }
syslog.actualLog = syslog.log;
syslog.log = function(what) { console.log(what); this.actualLog(what); }

exports.Logger = Logger;
exports.errlog = errlog;
exports.syslog = syslog;
