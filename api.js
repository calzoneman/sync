/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Auth = require("./auth.js");
var Server = require("./server.js");
var Logger = require("./logger.js");
var apilog = new Logger.Logger("api.log");

var jsonHandlers = {
    "channeldata": handleChannelData,
    "listloaded" : handleChannelList,
    "login"      : handleLogin,
    "register"   : handleRegister
};

function handle(path, req, res) {
    var parts = path.split("/");
    var last = parts[parts.length - 1];
    var params = {};
    if(last.indexOf("?") != -1) {
        parts[parts.length - 1] = last.substring(0, last.indexOf("?"));
        var plist = last.substring(last.indexOf("?") + 1).split("&");
        for(var i = 0; i < plist.length; i++) {
            var kv = plist[i].split("=");
            if(kv.length != 2) {
                res.send(400);
                return;
            }
            params[unescape(kv[0])] = unescape(kv[1]);
        }
    }
    for(var i = 0; i < parts.length; i++) {
        parts[i] = unescape(parts[i]);
    }

    if(parts.length != 2) {
        res.send(400);
        return;
    }

    if(parts[0] == "json") {
        if(!(parts[1] in jsonHandlers)) {
            res.end(JSON.stringify({
                error: "Unknown endpoint: " + parts[1]
            }, null, 4));
            return;
        }
        jsonHandlers[parts[1]](params, req, res);
    }
    else {
        res.send(400);
    }
}
exports.handle = handle;

function sendJSON(res, obj) {
    var response = JSON.stringify(obj, null, 4);
    var len = unescape(encodeURIComponent(response)).length;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Length", len);
    res.end(response);
}

function handleChannelData(params, req, res) {
    var clist = params.channel || "";
    clist = clist.split(",");
    var data = [];
    for(var j = 0; j < clist.length; j++) {
        var cname = clist[j];
        if(!cname.match(/^[a-zA-Z0-9]+$/)) {
            continue;
        }
        var d = {
            name: cname,
            loaded: (cname in Server.channels)
        };

        if(d.loaded) {
            var chan = Server.channels[cname];
            d.title = chan.media ? chan.media.title : "-";
            d.usercount = chan.users.length;
            d.users = [];
            for(var i = 0; i < chan.users.length; i++) {
                if(chan.users[i].name) {
                    d.users.push(chan.users[i].name);
                }
            }
            d.chat = [];
            for(var i = 0; i < chan.chatbuffer.length; i++) {
                d.chat.push(chan.chatbuffer[i]);
            }
        }
        data.push(d);
    }

    sendJSON(res, data);
}

function handleChannelList(params, req, res) {
    var session = params.session || "";
    var name = params.name || "";
    var pw = params.pw || "";
    var row = Auth.login(name, pw, session);
    if(!row || row.global_rank < 255) {
        res.send(403);
        return;
    }
    var clist = [];
    for(var key in Server.channels) {
        clist.push(key);
    }
    handleChannelData({channel: clist.join(",")}, req, res);
}

function handleLogin(params, req, res) {
    var session = params.session || "";
    var name = params.name || "";
    var pw = params.pw || "";

    var row = Auth.login(name, pw, session);
    if(row) {
        sendJSON(res, {
            success: true,
            session: row.session_hash
        });
    }
    else {
        sendJSON(res, {
            success: false
        });
    }
}

function handleRegister(params, req, res) {
    var name = params.name || "";
    var pw = params.pw || "";

    if(pw == "") {
        sendJSON(res, {
            success: false,
            error: "You must provide a password"
        });
        return;
    }
    else if(Auth.isRegistered(name)) {
        sendJSON(res, {
            success: false,
            error: "That username is already taken"
        });
        return false;
    }
    else if(!Auth.validateName(name)) {
        sendJSON(res, {
            success: false,
            error: "Invalid username.  Usernames must be 1-20 characters long and consist only of alphanumeric characters and underscores"
        });
    }
    else {
        var session = Auth.register(name, pw);
        if(session) {
            Logger.syslog.log(this.ip + " registered " + name);
            sendJSON(res, {
                success: true,
                session: session
            });
        }
        else {
            sendJSON(res, {
                success: false,
                error: "I dunno what went wrong"
            });
        }
    }
}
