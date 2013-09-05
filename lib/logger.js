/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");
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

var errlog = new Logger(path.join(__dirname, "../error.log"));
var syslog = new Logger(path.join(__dirname, "../sys.log"));
errlog.actualLog = errlog.log;
errlog.log = function(what) { console.log(what); this.actualLog(what); }
syslog.actualLog = syslog.log;
syslog.log = function(what) { console.log(what); this.actualLog(what); }

exports.Logger = Logger;
exports.errlog = errlog;
exports.syslog = syslog;
