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
var Config = require("./config.js");
var ActionLog = require("./actionlog.js");
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
    "resetpass"  : handlePasswordReset,
    "recoverpw"  : handlePasswordRecover,
    "setprofile" : handleProfileChange,
    "getprofile" : handleProfileGet,
    "setemail"   : handleEmailChange,
    "admreports" : handleAdmReports,
    "readactionlog" : handleReadActionLog
};

function getClientIP(req) {
    var ip;
    var forward = req.header("x-forwarded-for");
    if(Config.REVERSE_PROXY && forward) {
        ip = forward.split(",")[0];
    }
    if(!ip) {
        ip = req.connection.remoteAddress;
    }
    return ip;
}

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
            loaded: Server.getChannel(cname) !== undefined
        };

        if(d.loaded) {
            var chan = Server.getChannel(cname);
            d.pagetitle = chan.opts.pagetitle;
            d.media = chan.playlist.current ? chan.playlist.current.media.pack() : {};
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
        var all = Server.getAllChannels();
        var clist = [];
        for(var key in all) {
            if(all[key].opts.show_public) {
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
    for(var key in Server.getAllChannels()) {
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
        ActionLog.record(getClientIP(req), name, "login-success");
        sendJSON(res, {
            success: true,
            session: row.session_hash
        });
    }
    else {
        ActionLog.record(getClientIP(req), name, "login-failure");
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
        ActionLog.record(getClientIP(req), name, "password-change");
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

function handlePasswordReset(params, req, res) {
    var name = params.name || "";
    var email = unescape(params.email || "");
    var ip = getClientIP(req);

    var hash = false;
    try {
        hash = Database.generatePasswordReset(ip, name, email);
        ActionLog.record(ip, name, "password-reset-generate", email);
    }
    catch(e) {
        sendJSON(res, {
            success: false,
            error: e
        });
        return;
    }

    if(!Config.MAIL) {
        sendJSON(res, {
            success: false,
            error: "This server does not have email enabled.  Contact an administrator"
        });
        return;
    }
    var msg = [
        "A password reset request was issued for your account `",
        name,
        "` on ",
        Config.DOMAIN,
        ".  This request is valid for 24 hours.  ",
        "If you did not initiate this, there is no need to take action.  ",
        "To reset your password, copy and paste the following link into ",
        "your browser: ",
        Config.DOMAIN,
        "/reset.html?",
        hash
    ].join("");

    var mail = {
        from: "CyTube Services <" + Config.MAIL_FROM + ">",
        to: email,
        subject: "Password reset request",
        text: msg
    };

    Config.MAIL.sendMail(mail, function(err, response) {
        if(err) {
            Logger.errlog.log("Mail fail: " + err);
            sendJSON(res, {
                success: false,
                error: "Email failed.  Contact an admin if this persists."
            });
        }
        else {
            sendJSON(res, {
                success: true
            });

            if(Config.DEBUG) {
                Logger.syslog.log(response);
            }
        }
    });
}

function handlePasswordRecover(params, req, res) {
    var hash = params.hash || "";
    var ip = getClientIP(req);

    try {
        var info = Database.recoverPassword(hash);
        sendJSON(res, {
            success: true,
            name: info[0],
            pw: info[1]
        });
        ActionLog.record(ip, name, "password-recover-success");
        Logger.syslog.log(ip + " recovered password for " + name);
        return;
    }
    catch(e) {
        ActionLog.record(ip, name, "password-recover-failure");
        sendJSON(res, {
            success: false,
            error: e
        });
    }

}

function handleProfileGet(params, req, res) {
    var name = params.name || "";

    try {
        var prof = Database.getProfile(name);
        sendJSON(res, {
            success: true,
            profile_image: prof.profile_image,
            profile_text: prof.profile_text
        });
    }
    catch(e) {
        sendJSON(res, {
            success: false,
            error: e
        });
    }
}

function handleProfileChange(params, req, res) {
    var name = params.name || "";
    var pw = params.pw || "";
    var session = params.session || "";
    var img = unescape(params.profile_image || "");
    var text = unescape(params.profile_text || "");

    var row = Auth.login(name, pw, session);
    if(!row) {
        sendJSON(res, {
            success: false,
            error: "Invalid login"
        });
        return;
    }

    var result = Database.setProfile(name, {
        image: img,
        text: text
    });

    sendJSON(res, {
        success: result,
        error: result ? "" : "Internal error.  Contact an administrator"
    });

    var all = Server.getAllChannels();
    for(var n in all) {
        var chan = all[n];
        for(var i = 0; i < chan.users.length; i++) {
            if(chan.users[i].name.toLowerCase() == name) {
                chan.users[i].profile = {
                    image: img,
                    text: text
                };
                chan.broadcastUserUpdate(chan.users[i]);
                break;
            }
        }
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
        ActionLog.record(getClientIP(req), name, "email-update", email);
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
    if(ActionLog.tooManyRegistrations(getClientIP(req))) {
        ActionLog.record(getClientIP(req), name, "register-failure",
            "Too many recent registrations from this IP");
        sendJSON(res, {
            success: false,
            error: "Your IP address has registered several accounts in "+
                   "the past 48 hours.  Please wait a while or ask an "+
                   "administrator for assistance."
        });
        return;
    }

    if(pw == "") {
        sendJSON(res, {
            success: false,
            error: "You must provide a password"
        });
        return;
    }
    else if(Auth.isRegistered(name)) {
        ActionLog.record(getClientIP(req), name, "register-failure",
            "Name taken");
        sendJSON(res, {
            success: false,
            error: "That username is already taken"
        });
        return false;
    }
    else if(!Auth.validateName(name)) {
        ActionLog.record(getClientIP(req), name, "register-failure",
            "Invalid name");
        sendJSON(res, {
            success: false,
            error: "Invalid username.  Usernames must be 1-20 characters long and consist only of alphanumeric characters and underscores"
        });
    }
    else {
        var session = Auth.register(name, pw);
        if(session) {
            ActionLog.record(getClientIP(req), name, "register-success");
            Logger.syslog.log(getClientIP(req) + " registered " + name);
            sendJSON(res, {
                success: true,
                session: session
            });
        }
        else {
            sendJSON(res, {
                success: false,
                error: "Registration error.  Contact an admin for assistance."
            });
        }
    }
}

function handleAdmReports(params, req, res) {
    sendJSON(res, {
        error: "Not implemented"
    });
}

function handleReadActionLog(params, req, res) {
    var name = params.name || "";
    var pw = params.pw || "";
    var session = params.session || "";
    var row = Auth.login(name, pw, session);
    if(!row || row.global_rank < 255) {
        res.send(403);
        return;
    }

    var actions = ActionLog.readLog();
    sendJSON(res, actions);
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
