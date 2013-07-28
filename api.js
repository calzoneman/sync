/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Auth = require("./auth");
var Logger = require("./logger");
var apilog = new Logger.Logger("api.log");
var ActionLog = require("./actionlog");
var fs = require("fs");


module.exports = function (Server) {
    function getIP(req) {
        var raw = req.connection.remoteAddress;
        var forward = req.header("x-forwarded-for");
        if(Server.cfg["trust-x-forward"] && forward) {
            var ip = forward.split(",")[0];
            Logger.syslog.log("REVPROXY " + raw + " => " + ip);
            return ip;
        }
        return raw;
    }

    var API = function () {

    }
    API.prototype = {
        handle: function (path, req, res) {
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
                if(!(parts[1] in this.jsonHandlers)) {
                    res.end(JSON.stringify({
                        error: "Unknown endpoint: " + parts[1]
                    }, null, 4));
                    return;
                }
                this.jsonHandlers[parts[1]](params, req, res);
            }
            else if(parts[0] == "plain") {
                if(!(parts[1] in this.plainHandlers)) {
                    res.send(404);
                    return;
                }
                this.plainHandlers[parts[1]](params, req, res);
            }
            else {
                res.send(400);
            }
        },

        sendJSON: function (res, obj) {
            var response = JSON.stringify(obj, null, 4);
            if(res.callback) {
                response = res.callback + "(" + response + ")";
            }
            var len = unescape(encodeURIComponent(response)).length;

            res.setHeader("Content-Type", "application/json");
            res.setHeader("Content-Length", len);
            res.end(response);
        },

        sendPlain: function (res, str) {
            if(res.callback) {
                str = res.callback + "('" + str + "')";
            }
            var len = unescape(encodeURIComponent(str)).length;

            res.setHeader("Content-Type", "text/plain");
            res.setHeader("Content-Length", len);
            res.end(response);
        },

        handleChannelData: function (params, req, res) {
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
                    loaded: Server.channelLoaded(cname)
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

            this.sendJSON(res, data);
        },

        handleChannelList: function (params, req, res) {
            if(params.filter == "public") {
                var all = Server.channels;
                var clist = [];
                for(var key in all) {
                    if(all[key].opts.show_public) {
                        clist.push(all[key].name);
                    }
                }
                this.handleChannelData({channel: clist.join(",")}, req, res);
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
                clist.push(Server.channels[key].name);
            }
            this.handleChannelData({channel: clist.join(",")}, req, res);
        },

        handleLogin: function (params, req, res) {
            var session = params.session || "";
            var name = params.name || "";
            var pw = params.pw || "";

            if(pw == "" && session == "") {
                if(!Auth.isRegistered(name)) {
                    this.sendJSON(res, {
                        success: true,
                        session: ""
                    });
                    return;
                }
                else {
                    this.sendJSON(res, {
                        success: false,
                        error: "That username is already taken"
                    });
                    return;
                }
            }

            var row = Auth.login(name, pw, session);
            if(row) {
                ActionLog.record(getIP(req), name, "login-success");
                this.sendJSON(res, {
                    success: true,
                    session: row.session_hash
                });
            }
            else {
                ActionLog.record(getIP(req), name, "login-failure");
                this.sendJSON(res, {
                    error: "Invalid username/password",
                    success: false
                });
            }
        },

        handlePasswordChange: function (params, req, res) {
            var name = params.name || "";
            var oldpw = params.oldpw || "";
            var newpw = params.newpw || "";
            if(oldpw == "" || newpw == "") {
                this.sendJSON(res, {
                    success: false,
                    error: "Old password and new password cannot be empty"
                });
                return;
            }
            var row = Auth.login(name, oldpw);
            if(row) {
                ActionLog.record(getIP(req), name, "password-change");
                var success = Auth.setUserPassword(name, newpw);
                this.sendJSON(res, {
                    success: success,
                    error: success ? "" : "Change password failed",
                    session: row.session_hash
                });
            }
            else {
                this.sendJSON(res, {
                    success: false,
                    error: "Invalid username/password"
                });
            }
        },

        handlePasswordReset: function (params, req, res) {
            var name = params.name || "";
            var email = params.email || "";
            var ip = getIP(req);

            var hash = false;
            try {
                hash = Server.db.generatePasswordReset(ip, name, email);
                ActionLog.record(ip, name, "password-reset-generate", email);
            }
            catch(e) {
                this.sendJSON(res, {
                    success: false,
                    error: e
                });
                return;
            }

            if(!Server.cfg["enable-mail"]) {
                this.sendJSON(res, {
                    success: false,
                    error: "This server does not have email enabled.  Contact an administrator"
                });
                return;
            }
            if(!email) {
                this.sendJSON(res, {
                    success: false,
                    error: "You don't have a recovery email address set.  Contact an administrator"
                });
                return;
            }
            var msg = [
                "A password reset request was issued for your account `",
                name,
                "` on ",
                Server.cfg["domain"],
                ".  This request is valid for 24 hours.  ",
                "If you did not initiate this, there is no need to take action.  ",
                "To reset your password, copy and paste the following link into ",
                "your browser: ",
                Server.cfg["domain"],
                "/reset.html?",
                hash
            ].join("");

            var mail = {
                from: "CyTube Services <" + Server.cfg["mail-from"] + ">",
                to: email,
                subject: "Password reset request",
                text: msg
            };
            var api = this;
            Server.cfg["nodemailer"].sendMail(mail, function(err, response) {
                if(err) {
                    Logger.errlog.log("Mail fail: " + err);
                    api.sendJSON(res, {
                        success: false,
                        error: "Email failed.  Contact an admin if this persists."
                    });
                }
                else {
                    api.sendJSON(res, {
                        success: true
                    });

                    if(Server.cfg["debug"]) {
                        Logger.syslog.log(response);
                    }
                }
            });
        },

        handlePasswordRecover: function (params, req, res) {
            var hash = params.hash || "";
            var ip = getIP(req);

            try {
                var info = Server.db.recoverPassword(hash);
                this.sendJSON(res, {
                    success: true,
                    name: info[0],
                    pw: info[1]
                });
                ActionLog.record(ip, info[0], "password-recover-success");
                Logger.syslog.log(ip + " recovered password for " + info[0]);
                return;
            }
            catch(e) {
                ActionLog.record(ip, "", "password-recover-failure");
                this.sendJSON(res, {
                    success: false,
                    error: e
                });
            }
        },

        handleProfileGet: function (params, req, res) {
            var name = params.name || "";

            try {
                var prof = Server.db.getProfile(name);
                this.sendJSON(res, {
                    success: true,
                    profile_image: prof.profile_image,
                    profile_text: prof.profile_text
                });
            }
            catch(e) {
                this.sendJSON(res, {
                    success: false,
                    error: e
                });
            }
        },

        handleProfileChange: function (params, req, res) {
            var name = params.name || "";
            var pw = params.pw || "";
            var session = params.session || "";
            var img = params.profile_image || "";
            var text = params.profile_text || "";
            console.log(name);
            console.log(img);
            console.log(text);

            var row = Auth.login(name, pw, session);
            if(!row) {
                this.sendJSON(res, {
                    success: false,
                    error: "Invalid login"
                });
                return;
            }

            var result = Server.db.setProfile(name, {
                image: img,
                text: text
            });

            this.sendJSON(res, {
                success: result,
                error: result ? "" : "Internal error.  Contact an administrator"
            });

            var all = Server.channels;
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
        },

        handleEmailChange: function (params, req, res) {
            var name = params.name || "";
            var pw = params.pw || "";
            var email = params.email || "";
            // perhaps my email regex isn't perfect, but there's no freaking way
            // I'm implementing this monstrosity:
            // <http://www.ex-parrot.com/pdw/Mail-RFC822-Address.html>
            if(!email.match(/^[a-z0-9_\.]+@[a-z0-9_\.]+[a-z]+$/)) {
                this.sendJSON(res, {
                    success: false,
                    error: "Invalid email"
                });
                return;
            }

            if(email.match(/.*@(localhost|127\.0\.0\.1)/i)) {
                this.sendJSON(res, {
                    success: false,
                    error: "Nice try, but no."
                });
                return;
            }

            if(pw == "") {
                this.sendJSON(res, {
                    success: false,
                    error: "Password cannot be empty"
                });
                return;
            }
            var row = Auth.login(name, pw);
            if(row) {
                var success = Server.db.setUserEmail(name, email);
                ActionLog.record(getIP(req), name, "email-update", email);
                this.sendJSON(res, {
                    success: success,
                    error: success ? "" : "Email update failed",
                    session: row.session_hash
                });
            }
            else {
                this.sendJSON(res, {
                    success: false,
                    error: "Invalid username/password"
                });
            }
        },

        handleRegister: function (params, req, res) {
            var name = params.name || "";
            var pw = params.pw || "";
            if(ActionLog.tooManyRegistrations(getIP(req))) {
                ActionLog.record(getIP(req), name, "register-failure",
                    "Too many recent registrations from this IP");
                this.sendJSON(res, {
                    success: false,
                    error: "Your IP address has registered several accounts in "+
                           "the past 48 hours.  Please wait a while or ask an "+
                           "administrator for assistance."
                });
                return;
            }

            if(pw == "") {
                this.sendJSON(res, {
                    success: false,
                    error: "You must provide a password"
                });
                return;
            }
            else if(Auth.isRegistered(name)) {
                ActionLog.record(getIP(req), name, "register-failure",
                    "Name taken");
                this.sendJSON(res, {
                    success: false,
                    error: "That username is already taken"
                });
                return false;
            }
            else if(!Auth.validateName(name)) {
                ActionLog.record(getIP(req), name, "register-failure",
                    "Invalid name");
                this.sendJSON(res, {
                    success: false,
                    error: "Invalid username.  Usernames must be 1-20 characters long and consist only of alphanumeric characters and underscores"
                });
            }
            else {
                var session = Auth.register(name, pw);
                if(session) {
                    ActionLog.record(getIP(req), name, "register-success");
                    Logger.syslog.log(getIP(req) + " registered " + name);
                    this.sendJSON(res, {
                        success: true,
                        session: session
                    });
                }
                else {
                    this.sendJSON(res, {
                        success: false,
                        error: "Registration error.  Contact an admin for assistance."
                    });
                }
            }
        },

        handleAdmReports: function (params, req, res) {
            this.sendJSON(res, {
                error: "Not implemented"
            });
        },

        handleReadActionLog: function (params, req, res) {
            var name = params.name || "";
            var pw = params.pw || "";
            var session = params.session || "";
            var row = Auth.login(name, pw, session);
            if(!row || row.global_rank < 255) {
                res.send(403);
                return;
            }

            var actions = ActionLog.readLog();
            this.sendJSON(res, actions);
        },

        // Helper function
        pipeLast: function (res, file, len) {
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
        },

        handleReadLog: function (params, req, res) {
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
                this.pipeLast(res, "sys.log", 1024*1024);
            }
            else if(type == "err") {
                this.pipeLast(res, "error.log", 1024*1024);
            }
            else if(type == "channel") {
                var chan = params.channel || "";
                fs.exists("chanlogs/" + chan + ".log", function(exists) {
                    if(exists) {
                        this.pipeLast(res, "chanlogs/" + chan + ".log", 1024*1024);
                    }
                    else {
                        res.send(404);
                    }
                }.bind(this));
            }
            else {
                res.send(400);
            }
        }
    };

    var api = new API();

    api.plainHandlers = {
        "readlog"    : api.handleReadLog.bind(api)
    };

    api.jsonHandlers = {
        "channeldata"   : api.handleChannelData.bind(api),
        "listloaded"    : api.handleChannelList.bind(api),
        "login"         : api.handleLogin.bind(api),
        "register"      : api.handleRegister.bind(api),
        "changepass"    : api.handlePasswordChange.bind(api),
        "resetpass"     : api.handlePasswordReset.bind(api),
        "recoverpw"     : api.handlePasswordRecover.bind(api),
        "setprofile"    : api.handleProfileChange.bind(api),
        "getprofile"    : api.handleProfileGet.bind(api),
        "setemail"      : api.handleEmailChange.bind(api),
        "admreports"    : api.handleAdmReports.bind(api),
        "readactionlog" : api.handleReadActionLog.bind(api)
    };

    return api;
}
