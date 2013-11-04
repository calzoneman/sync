/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");
var Logger = require("./logger");
var nodemailer = require("nodemailer");

var defaults = {
    "mysql-server"          : "localhost",
    "mysql-db"              : "cytube",
    "mysql-user"            : "cytube",
    "mysql-pw"              : "supersecretpass",
    "express-host"          : "0.0.0.0",
    "io-host"               : "0.0.0.0",
    "enable-ssl"            : false,
    "ssl-keyfile"           : "",
    "ssl-passphrase"        : "",
    "ssl-certfile"          : "",
    "ssl-port"              : 443,
    "asset-cache-ttl"       : 0,
    "web-port"              : 8080,
    "io-port"               : 1337,
    "ip-connection-limit"   : 10,
    "guest-login-delay"     : 60,
    "channel-save-interval" : 5,
    "trust-x-forward"       : false,
    "enable-mail"           : false,
    "mail-transport"        : "SMTP",
    "mail-config"           : {
        "service"  : "Gmail",
        "auth"     : {
            "user" : "some.user@gmail.com",
            "pass" : "supersecretpassword"
        }
    },
    "mail-from"             : "some.user@gmail.com",
    "domain"                : "http://localhost",
    "ytv3apikey"            : "",
    "enable-ytv3"           : false,
    "ytv2devkey"            : "",
    "stat-interval"         : 3600000,
    "stat-max-age"          : 86400000,
    "alias-purge-interval"  : 3600000,
    "alias-max-age"         : 2592000000,
    "tor-blocker"           : false
}

function save(cfg, file) {
    if(!cfg.loaded)
        return;
    var x = {};
    for(var k in cfg) {
        if(k !== "nodemailer" && k !== "loaded")
            x[k] = cfg[k];
    }
    fs.writeFileSync(file, JSON.stringify(x, null, 4));
}

exports.load = function (file, callback) {
    var cfg = {};
    for(var k in defaults)
        cfg[k] = defaults[k];

    fs.readFile(file, function (err, data) {
        if(err) {
            if(err.code == "ENOENT") {
                Logger.syslog.log("Config file not found, generating default");
                Logger.syslog.log("Edit cfg.json to configure");
                data = "{}";
            }
            else {
                Logger.errlog.log("Config load failed");
                Logger.errlog.log(err);
                return;
            }
        }

        try {
            data = JSON.parse(data + "");
        } catch(e) {
            Logger.errlog.log("Config JSON is invalid: ");
            Logger.errlog.log(e);
            return;
        }

        for(var k in data)
            cfg[k] = data[k];

        if(cfg["enable-mail"]) {
            cfg["nodemailer"] = nodemailer.createTransport(
                cfg["mail-transport"],
                cfg["mail-config"]
            );
        }

        cfg["loaded"] = true;

        save(cfg, file);
        callback(cfg);
    });
}
