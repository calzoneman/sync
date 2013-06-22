var fs = require("fs");

var buffer = [];

exports.record = function(ip, name, action) {
    buffer.push(JSON.stringify({
        ip: ip,
        name: name,
        action: action,
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

exports.clear = function() {
    try {
        fs.renameSync("action.log", "action-until-"+Date.now()+".log");
    }
    catch(e) { }
}

setInterval(exports.flush, 15000);
