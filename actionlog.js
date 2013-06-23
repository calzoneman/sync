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
