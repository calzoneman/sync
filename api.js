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

    function getChannelData(channel) {
        var data = {
            name: channel.name,
            loaded: true
        };

        data.pagetitle = channel.opts.pagetitle;
        data.media = channel.playlist.current ?
                     channel.playlist.current.media.pack() :
                     {};
        data.usercount = channel.users.length;
        data.afkcount = channel.afkers.length;
        data.users = [];
        for(var i in channel.users)
            if(channel.users[i].name !== "")
                data.users.push(channel.users[i].name);

        data.chat = [];
        for(var i in channel.chatbuffer)
            data.chat.push(channel.chatbuffer[i]);

        return data;
    }

    var app = Server.app;

    /* <https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol> */
    app.get("/api/coffee", function (req, res) {
        res.send(418); // 418 I'm a teapot
    });

    /* REGION channels */
    
    /* data about a specific channel */
    app.get("/api/channels/:channel", function (req, res) {
        var name = req.params.channel;
        if(!name.match(/^[\w-_]+$/)) {
            res.send(404);
            return;
        }
        
        var data = {
            name: name,
            loaded: false
        };

        if(Server.channelLoaded(name))
            data = getChannelData(name);

        res.type("application/json");
        res.jsonp(data);
    });

    /* data about all channels (filter= public or all) */
    app.get("/api/allchannels/:filter", function (req, res) {
        var filter = req.params.filter;
        if(filter !== "public" && filter !== "all") {
            res.send(400);
            return;
        }

        var query = req.query;

        // Listing non-public channels requires authenticating as an admin
        if(filter !== "public") {
            var name = query.name || "";
            var session = query.session || "";
            var row = Auth.login(name, "", session);
            if(!row || row.global_rank < 255) {
                res.send(403);
                return;
            }
        }
        
        var channels = [];
        for(var key in Server.channels) {
            var channel = Server.channels[key];
            if(channel.opts.show_public) {
                channels.push(getChannelData(channel));
            } else if(filter !== "public") {
                channels.push(getChannelData(channel));
            }
        }

        res.type("application/jsonp");
        res.jsonp(channels);
    });

    /* ENDREGION channels */

    /* REGION authentication */

    /* login */
    app.post("/api/login", function (req, res) {
        res.type("application/jsonp");
        var name = req.body.name;
        var pw = req.body.pw;
        var session = req.body.session;

        // for some reason CyTube previously allowed guest logins
        // over the API...wat
        if(!pw && !session) {
            res.jsonp({
                success: false,
                error_code: "need_pw_or_session",
                error: "You must provide a password"
            });
            return;
        }

        var row = Auth.login(name, pw, session);
        if(!row) {
            if(session && !pw) {
                res.jsonp({
                    success: false,
                    error_code: "invalid_session",
                    error: "Session expired"
                });
                return;
            } else {
                ActionLog.record(getIP(req), name, "login-failure",
                                 "invalid_password");
                res.jsonp({
                    success: false,
                    error_code: "invalid_password",
                    error: "Provided username/password pair is invalid"
                });
                return;
            }
        }

        // record the login if the user is an administrator
        if(row.global_rank >= 255)
            ActionLog.record(getIP(req), name, "login-success");
            
        res.jsonp({
            success: true,
            name: name,
            session: row.session_hash
        });
    });

    /* password change */
    app.get("/api/account/passwordchange", function (req, res) {
        res.type("application/jsonp");

        var name = req.body.name;
        var oldpw = req.body.oldpw;
        var newpw = req.body.newpw;

        if(!oldpw || !newpw) {
            res.jsonp({
                success: false,
                error: "Password cannot be empty"
            });
            return;
        }

        var row = Auth.login(name, oldpw);
        if(!row) {
            res.jsonp({
                success: false,
                error: "Invalid username/password combination"
            });
            return;
        }

        ActionLog.record(getIP(req), name, "password-change");
        var success = Auth.setUserPassword(name, newpw);
        
        if(!success) {
            res.jsonp({
                success: false,
                error: "Server error.  Please try again or ask an "+
                       "administrator for assistance."
            });
            return;
        }

        res.jsonp({
            success: true,
            session: row.session_hash
        });
    });

    /* password reset */
    app.get("/api/account/passwordreset", function (req, res) {
        res.type("application/jsonp");
        var name = req.body.name;
        var email = req.body.email;
        var ip = getIP(req);
        var hash = false;

        try {
            hash = Server.db.generatePasswordReset(ip, name, email);
            ActionLog.record(ip, name, "password-reset-generate", email);
        } catch(e) {
            res.jsonp({
                success: false,
                error: e
            });
            return;
        }

        if(!Server.cfg["enable-mail"]) {
            res.jsonp({
                success: false,
                error: "This server does not have email recovery enabled."+
                       "  Contact an administrator for assistance."
            });
            return;
        }

        if(!email) {
            res.jsonp({
                success: false,
                error: "You don't have a recovery email address set.  "+
                       "Contact an administrator for assistance."
            });
            return;
        }

        var msg = "A password reset request was issued for your account '"+
                  name + "' on " + Server.cfg["domain"] + ".  This request"+
                  " is valid for 24 hours.  If you did not initiate this, "+
                  "there is no need to take action.  To reset your "+
                  "password, copy and paste the following link into your "+
                  "browser: " + Server.cfg["domain"] + "/reset.html?"+hash;

        var mail = {
            from: "CyTube Services <" + Server.cfg["mail-from"] + ">",
            to: emial,
            subject: "Password reset request",
            text: msg
        };

        Server.cfg["nodemailer"].sendMail(mai, function (err, response) {
            if(err) {
                Logger.errlog.log("mail fail: " + err);
                res.jsonp({
                    success: false,
                    error: "Email send failed.  Contact an administrator "+
                           "if this persists"
                });
            } else {
                res.jsonp({
                    success: true
                });
            }
        });
    });

    var x = {
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

        handleListUserChannels: function (params, req, res) {
            var name = params.name || "";
            var pw = params.pw || "";
            var session = params.session || "";

            var row = Auth.login(name, pw, session);
            if(!row) {
                this.sendJSON(res, {
                    success: false,
                    error: "Invalid login"
                });
                return;
            }

            var channels = Server.db.listUserChannels(name);

            this.sendJSON(res, {
                success: true,
                channels: channels
            });
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
            var types = params.actions || "";
            var row = Auth.login(name, pw, session);
            if(!row || row.global_rank < 255) {
                res.send(403);
                return;
            }

            var actiontypes = types.split(",");
            var actions = ActionLog.readLog(actiontypes);
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

    return null;
}
