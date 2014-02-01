/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Logger = require("./logger");
var Server = require("./server");
var db = require("./database");

function handleAnnounce(user, data) {
    var sv = Server.getServer();

    sv.announce({
        title: data.title,
        text: data.content,
        from: user.name
    });
}

function handleAnnounceClear(user) {
    Server.getServer().announce(null);
}

function handleGlobalBan(user, data) {
    db.globalBanIP(data.ip, data.note, function (err, res) {
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
            return;
        }

        db.listGlobalBans(function (err, bans) {
            if (err) {
                user.socket.emit("errMessage", {
                    msg: err
                });
                return;
            }

            var flat = [];
            for (var ip in bans) {
                flat.push({
                    ip: ip,
                    note: bans[ip].reason
                });
            }
            user.socket.emit("acp-gbanlist", flat);
        });
    });
}

function handleGlobalBanDelete(user, data) {
    db.globalUnbanIP(data.ip, function (err, res) {
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
            return;
        }

        db.listGlobalBans(function (err, bans) {
            if (err) {
                user.socket.emit("errMessage", {
                    msg: err
                });
                return;
            }

            var flat = [];
            for (var ip in bans) {
                flat.push({
                    ip: ip,
                    note: bans[ip].reason
                });
            }
            user.socket.emit("acp-gbanlist", flat);
        });
    });
}

function handleListUsers(user, data) {
    var name = data.name;
    if (typeof name !== "string") {
        name = "";
    }

    var fields = ["id", "name", "global_rank", "email", "ip", "time"];

    db.users.search(name, fields, function (err, users) {
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
            return;
        }
        user.socket.emit("acp-list-users", users);
    });
}

function handleSetRank(user, data) {

}

function handleResetPassword(user, data) {

}

function init(user) {
    var s = user.socket;
    s.on("acp-announce", handleAnnounce.bind(this, user));
    s.on("acp-announce-clear", handleAnnounceClear.bind(this, user));
    s.on("acp-gban", handleGlobalBan.bind(this, user));
    s.on("acp-gban-delete", handleGlobalBanDelete.bind(this, user));
    s.on("acp-list-users", handleListUsers.bind(this, user));
    s.on("acp-set-rank", handleSetRank.bind(this, user));
    s.on("acp-reset-password", handleResetPassword.bind(this, user));

    db.listGlobalBans(function (err, bans) {
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
            return;
        }

        var flat = [];
        for (var ip in bans) {
            flat.push({
                ip: ip,
                note: bans[ip].reason
            });
        }
        user.socket.emit("acp-gbanlist", flat);
    });
    Logger.eventlog.log("[acp] Initialized ACP for " + user.name + "@" + user.ip);
}

module.exports.init = init;
