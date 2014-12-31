var Logger = require("./logger");
var Server = require("./server");
var db = require("./database");
var util = require("./utilities");
var Config = require("./config");
var Server = require("./server");

function eventUsername(user) {
    return user.getName() + "@" + user.realip;
}

function handleAnnounce(user, data) {
    var sv = Server.getServer();

    sv.announce({
        title: data.title,
        text: data.content,
        from: user.getName()
    });

    Logger.eventlog.log("[acp] " + eventUsername(user) + " opened announcement `" +
                        data.title + "`");
}

function handleAnnounceClear(user) {
    Server.getServer().announce(null);
    Logger.eventlog.log("[acp] " + eventUsername(user) + " cleared announcement");
}

function handleGlobalBan(user, data) {
    db.globalBanIP(data.ip, data.note, function (err, res) {
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
            return;
        }

        Logger.eventlog.log("[acp] " + eventUsername(user) + " global banned " + data.ip);

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

        Logger.eventlog.log("[acp] " + eventUsername(user) + " un-global banned " +
                            data.ip);

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
    var name = data.name;
    var rank = data.rank;
    if (typeof name !== "string" || typeof rank !== "number") {
        return;
    }

    if (rank >= user.global_rank) {
        user.socket.emit("errMessage", {
            msg: "You are not permitted to promote others to equal or higher rank than " +
                 "yourself."
        });
        return;
    }

    db.users.getGlobalRank(name, function (err, oldrank) {
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
            return;
        }

        if (oldrank >= user.global_rank) {
            user.socket.emit("errMessage", {
                msg: "You are not permitted to change the rank of users who rank " +
                     "higher than you."
            });
            return;
        }

        db.users.setGlobalRank(name, rank, function (err) {
            if (err) {
                user.socket.emit("errMessage", {
                    msg: err
                });
            } else {
                Logger.eventlog.log("[acp] " + eventUsername(user) + " set " + name +
                                    "'s global_rank to " + rank);
                user.socket.emit("acp-set-rank", data);
            }
        });
    });
}

function handleResetPassword(user, data) {
    var name = data.name;
    var email = data.email;
    if (typeof name !== "string" || typeof email !== "string") {
        return;
    }

    db.users.getGlobalRank(name, function (err, rank) {
        if (rank >= user.global_rank) {
            user.socket.emit("errMessage", {
                msg: "You don't have permission to reset the password for " + name
            });
            return;
        }

        var hash = util.sha1(util.randomSalt(64));
        var expire = Date.now() + 86400000;
        db.addPasswordReset({
            ip: "",
            name: name,
            email: email,
            hash: hash,
            expire: expire
        }, function (err) {
            if (err) {
                user.socket.emit("errMessage", {
                    msg: err
                });
                return;
            }

            Logger.eventlog.log("[acp] " + eventUsername(user) + " initialized a " +
                                "password recovery for " + name);

            user.socket.emit("errMessage", {
                msg: "Reset link: " + Config.get("http.domain") +
                     "/account/passwordrecover/" + hash
            });
        });
    });
}

function handleListChannels(user, data) {
    var field = data.field;
    var value = data.value;
    if (typeof field !== "string" || typeof value !== "string") {
        return;
    }

    var dbfunc;
    if (field === "owner") {
        dbfunc = db.channels.searchOwner;
    } else {
        dbfunc = db.channels.search;
    }

    dbfunc(value, function (err, rows) {
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
            return;
        }

        user.socket.emit("acp-list-channels", rows);
    });
}

function handleDeleteChannel(user, data) {
    var name = data.name;
    if (typeof data.name !== "string") {
        return;
    }

    var sv = Server.getServer();
    if (sv.isChannelLoaded(name)) {
        sv.getChannel(name).users.forEach(function (u) {
            u.kick("Channel shutting down");
        });
    }

    db.channels.drop(name, function (err) {
        Logger.eventlog.log("[acp] " + eventUsername(user) + " deleted channel " + name);
        if (err) {
            user.socket.emit("errMessage", {
                msg: err
            });
        } else {
            user.socket.emit("acp-delete-channel", {
                name: name
            });
        }
    });
}

function handleListActiveChannels(user) {
    user.socket.emit("acp-list-activechannels", Server.getServer().packChannelList(false, true));
}

function handleForceUnload(user, data) {
    var name = data.name;
    if (typeof name !== "string") {
        return;
    }

    var sv = Server.getServer();
    if (!sv.isChannelLoaded(name)) {
        return;
    }

    var chan = sv.getChannel(name);
    var users = Array.prototype.slice.call(chan.users);
    chan.emit("empty");
    users.forEach(function (u) {
        u.kick("Channel shutting down");
    });

    Logger.eventlog.log("[acp] " + eventUsername(user) + " forced unload of " + name);
}

function handleListStats(user) {
    db.listStats(function (err, rows) {
        user.socket.emit("acp-list-stats", rows);
    });
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
    s.on("acp-list-channels", handleListChannels.bind(this, user));
    s.on("acp-delete-channel", handleDeleteChannel.bind(this, user));
    s.on("acp-list-activechannels", handleListActiveChannels.bind(this, user));
    s.on("acp-force-unload", handleForceUnload.bind(this, user));
    s.on("acp-list-stats", handleListStats.bind(this, user));

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
    Logger.eventlog.log("[acp] Initialized ACP for " + eventUsername(user));
}

module.exports.init = init;
