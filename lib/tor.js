var https = require("https");
var path = require("path");
var fs = require("fs");
var domain = require("domain");
var Logger = require("./logger");

function retrieveIPs(cb) {
    var options = {
        host: "www.dan.me.uk",
        port: 443,
        path: "/torlist/",
        method: "GET"
    };

    var finish = function (status, data) {
        if (status !== 200) {
            cb(new Error("Failed to retrieve Tor IP list (HTTP " + status + ")"), null);
            return;
        }

        var ips = data.split("\n");
        cb(false, ips);
    };

    var d = domain.create();
    d.on("error", function (err) {
        if (err.stack)
            Logger.errlog.log(err.stack);
        else
            Logger.errlog.log(err);
    });
    
    d.run(function () {
        var req = https.request(options, function (res) {
            var buffer = "";
            res.setEncoding("utf-8");
            res.on("data", function (data) { buffer += data; });
            res.on("end", function () { finish(res.statusCode, buffer); });
        });
        
        req.end();
    });
}

function getTorIPs(cb) {
    retrieveIPs(function (err, ips) {
        if (!err) {
            cb(false, ips);
            fs.writeFile(path.join(__dirname, "..", "torlist"),
                         ips.join("\n"));
            return;
        }

        fs.readFile(path.join(__dirname, "..", "torlist"), function (err, data) {
            if (err) {
                cb(err, null);
                return;
            }

            data = (""+data).split("\n");
            cb(false, data);
        });
    });
}

var _ipList = [];
getTorIPs(function (err, ips) {
    if (err) {
        Logger.errlog.log(err);
        return;
    }

    Logger.syslog.log("Loaded Tor IP list");
    _ipList = ips;
});

exports.isTorExit = function (ip) {
    return _ipList.indexOf(ip) >= 0;
};
