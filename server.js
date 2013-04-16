/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const VERSION = "1.1.6";

var fs = require("fs");
var Logger = require("./logger.js");
Logger.syslog.log("Starting CyTube v" + VERSION);
var Config = require("./config.js");
var connect = require("connect");
var app = connect.createServer(connect.static(__dirname+"/www")).listen(Config.IO_PORT);
exports.io = require("socket.io").listen(app);
exports.io.set("log level", 1);
var User = require("./user.js").User;
var Database = require("./database.js");
Database.init();

exports.channels = {};

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
    var user = new User(socket, socket.handshake.address.address);
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
