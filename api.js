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
var Database = require("./database.js");
var fs = require("fs");

var plainHandlers = {
    "readlog"    : handleReadLog
};

var jsonHandlers = {
    "channeldata": handleChannelData,
    "listloaded" : handleChannelList,
    "login"      : handleLogin,
    "register"   : handleRegister,
    "changepass" : handlePasswordChange,
    "setemail"   : handleEmailChange,
    "globalbans" : handleGlobalBans,
    "admreports" : handleAdmReports,
    "pwreset"    : handlePasswordReset
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
        res.callback = params.callback || false;
        if(!(parts[1] in jsonHandlers)) {
            res.end(JSON.stringify({
                error: "Unknown endpoint: " + parts[1]
            }, null, 4));
            return;
        }
        jsonHandlers[parts[1]](params, req, res);
    }
    else if(parts[0] == "plain") {
        if(!(parts[1] in plainHandlers)) {
            res.send(404);
            return;
        }
        plainHandlers[parts[1]](params, req, res);
    }
    else {
        res.send(400);
    }
}
exports.handle = handle;

function sendJSON(res, obj) {
    var response = JSON.stringify(obj, null, 4);
    if(res.callback) {
        response = res.callback + "(" + response + ")";
    }
    var len = unescape(encodeURIComponent(response)).length;

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Length", len);
    res.end(response);
}

function sendPlain(res, str) {
    if(res.callback) {
        str = res.callback + "('" + str + "')";
    }
    var len = unescape(encodeURIComponent(str)).length;

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Length", len);
    res.end(response);
}

function handleChannelData(params, req, res) {
    var clist = params.channel || "";
    clist = clist.split(",");
    var data = [];
    for(var j = 0; j < clist.length; j++) {
        var cname = clist[j];
        if(!cname.match(/^[a-zA-Z0-9-_]+$/)) {
            continue;
        }
        var d = {
            name: cname,
            loaded: (cname in Server.channels)
        };

        if(d.loaded) {
            var chan = Server.channels[cname];
            d.pagetitle = chan.opts.pagetitle;
            d.media = chan.media ? chan.media.pack() : {};
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
    if(params.filter == "public") {
        var clist = [];
        for(var key in Server.channels) {
            if(Server.channels[key].opts.show_public) {
                clist.push(key);
            }
        }
        handleChannelData({channel: clist.join(",")}, req, res);
    }
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

    if(pw == "" && session == "") {
        if(!Auth.isRegistered(name)) {
            sendJSON(res, {
                success: true,
                session: ""
            });
            return;
        }
        else {
            sendJSON(res, {
                success: false,
                error: "That username is already taken"
            });
            return;
        }
    }

    var row = Auth.login(name, pw, session);
    if(row) {
        sendJSON(res, {
            success: true,
            session: row.session_hash
        });
    }
    else {
        sendJSON(res, {
            error: "Invalid username/password",
            success: false
        });
    }
}

function handlePasswordChange(params, req, res) {
    var name = params.name || "";
    var oldpw = params.oldpw || "";
    var newpw = params.newpw || "";
    if(oldpw == "" || newpw == "") {
        sendJSON(res, {
            success: false,
            error: "Old password and new password cannot be empty"
        });
        return;
    }
    var row = Auth.login(name, oldpw);
    if(row) {
        var success = Auth.setUserPassword(name, newpw);
        sendJSON(res, {
            success: success,
            error: success ? "" : "Change password failed",
            session: row.session_hash
        });
    }
    else {
        sendJSON(res, {
            success: false,
            error: "Invalid username/password"
        });
    }
}

function handleEmailChange(params, req, res) {
    var name = params.name || "";
    var pw = params.pw || "";
    var email = unescape(params.email) || "";
    if(!email.match(/^[a-z0-9_\.]+@[a-z0-9_\.]+[a-z]+$/)) {
        sendJSON(res, {
            success: false,
            error: "Invalid email"
        });
        return;
    }

    if(email.match(/.*@(localhost|127\.0\.0\.1)/i)) {
        sendJSON(res, {
            success: false,
            error: "Nice try, but no."
        });
        return;
    }

    if(pw == "") {
        sendJSON(res, {
            success: false,
            error: "Password cannot be empty"
        });
        return;
    }
    var row = Auth.login(name, pw);
    if(row) {
        var success = Database.setUserEmail(name, email);
        sendJSON(res, {
            success: success,
            error: success ? "" : "Email update failed",
            session: row.session_hash
        });
    }
    else {
        sendJSON(res, {
            success: false,
            error: "Invalid username/password"
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

function handleGlobalBans(params, req, res) {
    var name = params.name || "";
    var pw = params.pw || "";
    var session = params.session || "";
    var row = Auth.login(name, pw, session);
    if(!row || row.global_rank < 255) {
        res.send(403);
        return;
    }

    var action = params.action || "list";
    if(action == "list") {
        var gbans = Database.refreshGlobalBans();
        sendJSON(res, gbans);
    }
    else if(action == "add") {
        var ip = params.ip || "";
        var reason = params.reason || "";
        if(!ip.match(/\d+\.\d+\.(\d+\.(\d+)?)?/)) {
            sendJSON(res, {
                error: "Invalid IP address"
            });
            return;
        }
        var result = Database.globalBanIP(ip, reason);
        sendJSON(res, {
            success: result,
            ip: ip,
            reason: reason
        });
    }
    else if(action == "remove") {
        var ip = params.ip || "";
        if(!ip.match(/\d+\.\d+\.(\d+\.(\d+)?)?/)) {
            sendJSON(res, {
                error: "Invalid IP address"
            });
            return;
        }
        var result = Database.globalUnbanIP(ip);
        sendJSON(res, {
            success: result,
            ip: ip,
        });
    }
    else {
        sendJSON(res,  {
            error: "Invalid action: " + action
        });
    }
}

function handleAdmReports(params, req, res) {
    sendJSON(res, {
        error: "Not implemented"
    });
}

function handlePasswordReset(params, req, res) {
    var name = params.name || "";
    var pw = params.pw || "";
    var session = params.session || "";
    var row = Auth.login(name, pw, session);
    if(!row || row.global_rank < 255) {
        res.send(403);
        return;
    }

    var action = params.action || "";
    if(action == "reset") {
        var uname = params.reset_name;
        if(Auth.getGlobalRank(uname) > row.global_rank) {
            sendJSON(res, {
                success: false
            });
            return;
        }
        var new_pw = Database.resetPassword(uname);
        if(new_pw) {
            sendJSON(res, {
                success: true,
                pw: new_pw
            });
        }
        else {
            sendJSON(res, {
                success: false
            });
        }
    }
    else {
        sendJSON(res, {
            success: false
        });
    }
}

// Helper function
function pipeLast(res, file, len) {
    fs.stat(file, function(err, data) {
        if(err) {
            res.send(500);
            return;
        }
        var start = data.size - len;
        if(start < 0) {
            start = 0;
        }
        var end = data.size - 1;
        fs.createReadStream(file, {start: start, end: end}).pipe(res);
    });
}

function handleReadLog(params, req, res) {
    var name = params.name || "";
    var pw = params.pw || "";
    var session = params.session || "";
    var row = Auth.login(name, pw, session);
    if(!row || row.global_rank < 255) {
        res.send(403);
        return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");

    var type = params.type || "";
    if(type == "sys") {
        pipeLast(res, "sys.log", 1024*1024);
    }
    else if(type == "err") {
        pipeLast(res, "error.log", 1024*1024);
    }
    else if(type == "channel") {
        var chan = params.channel || "";
        fs.exists("chanlogs/" + chan + ".log", function(exists) {
            if(exists) {
                pipeLast(res, "chanlogs/" + chan + ".log", 1024*1024);
            }
            else {
                res.send(404);
            }
        });
    }
    else {
        res.send(400);
    }
}
