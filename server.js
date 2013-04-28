/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const VERSION = "1.4.2";

var fs = require("fs");
var Logger = require("./logger.js");

Logger.syslog.log("Starting CyTube v" + VERSION);
var Config = require("./config.js");
var express = require("express");
var API = require("./api.js");

var app = express();
app.get("/r/:channel(*)", function(req, res, next) {
    var param = req.params.channel;
    if(!param.match(/^[a-zA-Z0-9]+$/)) {
        res.redirect("/" + param);
    }
    else {
        res.sendfile(__dirname + "/www/index.html");
    }
});

app.get("/api/:apireq(*)", function(req, res, next) {
    API.handle(req.url.substring(5), req, res);
});

app.get("/:thing(*)", function(req, res, next) {
    res.sendfile(__dirname + "/www/" + req.params.thing);
});

app.use(function(err, req, res, next) {
    if(404 == err.status) {
        res.statusCode = 404;
        res.send("Page not found");
    }
    else {
        next(err);
    }
});
//app.use(express.static(__dirname + "/www"));
var httpserv = app.listen(Config.IO_PORT);

exports.io = require("socket.io").listen(httpserv);
exports.io.set("log level", 1);
var User = require("./user.js").User;
var Database = require("./database.js");
Database.init();

exports.channels = {};
exports.clients = {};

fs.exists("chandump", function(exists) {
    if(!exists) {
        fs.mkdir("chandump", function(err) {
            if(err)
                Logger.errlog.log(err);
        });
    }
});

fs.exists("chanlogs", function(exists) {
    if(!exists) {
        fs.mkdir("chanlogs", function(err) {
            if(err)
                Logger.errlog.log(err);
        });
    }
});

exports.io.sockets.on("connection", function(socket) {
    var ip = socket.handshake.address.address;
    if(Database.checkGlobalBan(ip)) {
        socket.emit("kick", {
            reason: "You're globally banned!"
        });
        socket.disconnect(true);
        return;
    }
    socket.on("disconnect", function() {
        exports.clients[ip]--;
    });
    if(!(ip in exports.clients)) {
        exports.clients[ip] = 1;
    }
    else {
        exports.clients[ip]++;
    }
    if(exports.clients[ip] > Config.MAX_PER_IP) {
        socket.emit("kick", {
            reason: "Too many connections from your IP address"
        });
        socket.disconnect(true);
        return;
    }
    var user = new User(socket, ip);
    Logger.syslog.log("Accepted connection from /" + user.ip);
});

process.on("uncaughtException", function(err) {
    Logger.errlog.log("[SEVERE] Uncaught Exception: " + err);
});

process.on("exit", shutdown);
process.on("SIGINT", shutdown);



function shutdown() {
    Logger.syslog.log("Unloading channels...");
    for(var name in exports.channels) {
        if(exports.channels[name].registered)
            exports.channels[name].saveDump();
    }
    Logger.syslog.log("Shutting Down");
    process.exit(0);
}
