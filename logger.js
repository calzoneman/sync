/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");

function getTimeString() {
    return new Date().toTimeString().split(" ")[0];
}

var Logger = function(filename) {
    this.filename = filename;
    this.buffer = [];

    setInterval(function() {
        this.flush();
    }.bind(this), 15000);
}

Logger.prototype.log = function(what) {
    this.buffer.push("[" + getTimeString() + "] " + what);
}

Logger.prototype.flush = function() {
    if(this.buffer.length == 0)
        return;
    var text = this.buffer.join("\n") + "\n";
    this.buffer = [];
    fs.appendFile(this.filename, text, function(err) {
        if(err) {
            errlog.log("Append to " + this.filename + " failed: ");
            errlog.log(err);
        }
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
