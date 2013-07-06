/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");
var Logger = require("./logger");

var buffer = [];

exports.record = function(ip, name, action, args) {
    buffer.push(JSON.stringify({
        ip: ip,
        name: name,
        action: action,
        args: args ? args : [],
        time: Date.now()
    }));
}

exports.flush = function() {
    if(buffer.length == 0)
        return;
    var text = buffer.join("\n") + "\n";
    buffer = [];
    fs.appendFile("action.log", text, function(err) {
        if(err) {
            errlog.log("Append to actionlog failed: ");
            errlog.log(err);
        }
    });
}

exports.clear = function(actions) {
    clearInterval(FLUSH_TMR);
    var rs = fs.createReadStream("action.log");
    var ws = fs.createWriteStream("action.log.tmp");
    function handleLine(ln) {
        try {
            js = JSON.parse(ln);
            if(actions.indexOf(js.action) == -1)
                ws.write(ln + "\n");
        }
        catch(e) { }
    }
    var buffer = "";
    rs.on("data", function(chunk) {
        buffer += chunk;
        if(buffer.indexOf("\n") != -1) {
            var lines = buffer.split("\n");
            buffer = lines[lines.length - 1];
            lines.length = lines.length - 1;
            lines.forEach(handleLine);
        }
    });
    rs.on("end", function() {
        handleLine(buffer);
        ws.end();
    });
    try {
        fs.renameSync("action.log.tmp", "action.log");
    }
    catch(e) {
        Logger.errlog.log("Failed to move action.log.tmp => action.log");
        Logger.errlog.log(e);
    }
    FLUSH_TMR = setInterval(exports.flush, 15000);
}

var FLUSH_TMR = setInterval(exports.flush, 15000);
