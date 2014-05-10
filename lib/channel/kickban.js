var ChannelModule = require("./module");
var db = require("../database");
var Flags = require("../flags");
var util = require("../utilities");
var Account = require("../account");
var Q = require("q");

const TYPE_UNBAN = {
    id: "number",
    name: "string"
};

function KickBanModule(channel) {
    ChannelModule.apply(this, arguments);

    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("/kick", this.handleCmdKick.bind(this));
        this.channel.modules.chat.registerCommand("/ban", this.handleCmdBan.bind(this));
        this.channel.modules.chat.registerCommand("/ipban", this.handleCmdIPBan.bind(this));
        this.channel.modules.chat.registerCommand("/banip", this.handleCmdIPBan.bind(this));
    }
}

KickBanModule.prototype = Object.create(ChannelModule.prototype);

KickBanModule.prototype.onUserPreJoin = function (user, data, cb) {
    if (!this.channel.is(Flags.C_REGISTERED)) {
        return cb(null, ChannelModule.PASSTHROUGH);
    }

    var cname = this.channel.name;
    db.channels.isIPBanned(cname, user.ip, function (err, banned) {
        if (err) {
            cb(null, ChannelModule.PASSTHROUGH);
        } else if (!banned) {
            if (user.is(Flags.U_LOGGED_IN)) {
                checkNameBan();
            } else {
                cb(null, ChannelModule.PASSTHROUGH);
            }
        } else {
            cb(null, ChannelModule.DENY);
        }
    });

    function checkNameBan() {
        db.channels.isNameBanned(cname, user.getName(), function (err, banned) {
            if (err) {
                cb(null, ChannelModule.PASSTHROUGH);
            } else {
                cb(null, banned ? ChannelModule.DENY : ChannelModule.PASSTHROUGH);
            }
        });
    }
};

KickBanModule.prototype.onUserPostJoin = function (user) {
    if (!this.channel.is(Flags.C_REGISTERED)) {
        return;
    }

    var chan = this.channel;
    user.waitFlag(Flags.U_LOGGED_IN, function () {
        db.channels.isNameBanned(chan.name, user.getName(), function (err, banned) {
            if (!err && banned) {
                user.kick("You are banned from this channel.");
                if (chan.modules.chat) {
                    chan.modules.chat.sendModMessage(user.getName() + " was kicked (" +
                                                     "name is banned)");
                }
            }
        });
    });

    var self = this;
    user.socket.on("requestBanlist", function () { self.sendBanlist([user]); });
    user.socket.typecheckedOn("unban", TYPE_UNBAN, this.handleUnban.bind(this, user));
};

KickBanModule.prototype.sendBanlist = function (users) {
    if (!this.channel.is(Flags.C_REGISTERED)) {
        return;
    }

    var perms = this.channel.modules.permissions;

    var bans = [];
    var unmaskedbans = [];
    db.channels.listBans(this.channel.name, function (err, banlist) {
        if (err) {
            return;
        }

        for (var i = 0; i < banlist.length; i++) {
            bans.push({
                id: banlist[i].id,
                ip: banlist[i].ip === "*" ? "*" : util.maskIP(banlist[i].ip),
                name: banlist[i].name,
                reason: banlist[i].reason,
                bannedby: banlist[i].bannedby
            });
            unmaskedbans.push({
                id: banlist[i].id,
                ip: banlist[i].ip,
                name: banlist[i].name,
                reason: banlist[i].reason,
                bannedby: banlist[i].bannedby
            });
        }

        users.forEach(function (u) {
            if (!perms.canBan(u)) {
                return;
            }

            if (u.account.effectiveRank >= 255) {
                u.socket.emit("banlist", unmaskedbans);
            } else {
                u.socket.emit("banlist", bans);
            }
        });
    });
};

KickBanModule.prototype.sendUnban = function (users, data) {
    var perms = this.channel.modules.permissions;
    users.forEach(function (u) {
        if (perms.canBan(u)) {
            u.socket.emit("banlistRemove", data);
        }
    });
};

KickBanModule.prototype.handleCmdKick = function (user, msg, meta) {
    if (!this.channel.modules.permissions.canKick(user)) {
        return;
    }

    var args = msg.split(" ");
    args.shift(); /* shift off /kick */
    var name = args.shift().toLowerCase();
    var reason = args.join(" ");
    var target = null;

    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getLowerName() === name) {
            target = this.channel.users[i];
            break;
        }
    }

    if (target === null) {
        return;
    }

    if (target.account.effectiveRank >= user.account.effectiveRank) {
        return user.socket.emit("errorMsg", {
            msg: "You do not have permission to kick " + target.getName()
        });
    }

    target.kick(reason);
    this.channel.logger.log("[mod] " + user.getName() + " kicked " + target.getName() +
                            " (" + reason + ")");
    if (this.channel.modules.chat) {
        this.channel.modules.chat.sendModMessage(user.getName() + " kicked " +
                                                 target.getName());
    }
};

/* /ban - name bans */
KickBanModule.prototype.handleCmdBan = function (user, msg, meta) {
    var args = msg.split(" ");
    args.shift(); /* shift off /ban */
    var name = args.shift();
    var reason = args.join(" ");

    this.banName(user, name, reason, function (err) { });
};

/* /ipban - bans name and IP addresses associated with it */
KickBanModule.prototype.handleCmdIPBan = function (user, msg, meta) {
    var args = msg.split(" ");
    args.shift(); /* shift off /ipban */
    var name = args.shift();
    var reason = args.join(" ");

    this.banAll(user, name, reason, function (err) { });
};

KickBanModule.prototype.banName = function (actor, name, reason, cb) {
    var self = this;
    reason = reason.substring(0, 255);

    var chan = this.channel;
    var error = function (what) {
        actor.socket.emit("errorMsg", { msg: what });
        cb(what);
    };

    if (!chan.modules.permissions.canBan(actor)) {
        return error("You do not have ban permissions on this channel");
    }

    name = name.toLowerCase();
    if (name === actor.getLowerName()) {
        return actor.socket.emit("costanza", {
            msg: "You can't ban yourself"
        });
    }

    Q.nfcall(Account.rankForName, name, { channel: chan.name })
    .then(function (rank) {
        if (rank >= actor.account.effectiveRank) {
            throw "You don't have permission to ban " + name;
        }

        return Q.nfcall(db.channels.isNameBanned, chan.name, name);
    }).then(function (banned) {
        if (banned) {
            throw name + " is already banned";
        }

        if (chan.dead) { throw null; }

        return Q.nfcall(db.channels.ban, chan.name, "*", name, reason, actor.getName());
    }).then(function () {
        chan.logger.log("[mod] " + actor.getName() + " namebanned " + name);
        if (chan.modules.chat) {
            chan.modules.chat.sendModMessage(actor.getName() + " namebanned " + name,
                                             chan.modules.permissions.permissions.ban);
        }
        return true;
    }).catch(error).done(function () {
        self.kickBanTarget(name, null);
        cb(null);
    });
};

KickBanModule.prototype.banIP = function (actor, ip, name, reason, cb) {
    var self = this;
    reason = reason.substring(0, 255);
    var masked = util.maskIP(ip);

    var chan = this.channel;
    var error = function (what) {
        actor.socket.emit("errorMsg", { msg: what });
        cb(what);
    };

    if (!chan.modules.permissions.canBan(actor)) {
        return error("You do not have ban permissions on this channel");
    }

    Q.nfcall(Account.rankForIP, ip).then(function (rank) {
        if (rank >= actor.account.effectiveRank) {
            throw "You don't have permission to ban IP " + masked;
        }

        return Q.nfcall(db.channels.isIPBanned, chan.name, ip);
    }).then(function (banned) {
        if (banned) {
            throw masked + " is already banned";
        }

        if (chan.dead) { throw null; }

        return Q.nfcall(db.channels.ban, chan.name, ip, name, reason, actor.getName());
    }).then(function () {
        chan.logger.log("[mod] " + actor.getName() + " banned " + ip + " (" + name + ")");
        if (chan.modules.chat) {
            chan.modules.chat.sendModMessage(actor.getName() + " banned " +
                                             util.maskIP(ip) + " (" + name + ")",
                                             chan.modules.permissions.permissions.ban);
        }
    }).catch(error).done(function () {
        self.kickBanTarget(name, ip);
        cb(null);
    });
};

KickBanModule.prototype.banAll = function (actor, name, reason, cb) {
    var self = this;
    reason = reason.substring(0, 255);

    var chan = self.channel;
    var error = function (what) {
        actor.socket.emit("errorMsg", { msg: what });
        cb(what);
    };

    if (!chan.modules.permissions.canBan(actor)) {
        return error("You do not have ban permissions on this channel");
    }

    self.banName(actor, name, reason, function (err) {
        if (err && err.indexOf("is already banned") !== -1) {
            cb(err);
        } else {
            Q.nfcall(db.getIPs, name)
            .then(function (ips) {
                var all = ips.map(function (ip) {
                    return Q.nfcall(self.banIP.bind(self), actor, ip, name, reason);
                });

                return Q.all(all);
            }).catch(error).done(cb);
        }
    });
};

KickBanModule.prototype.kickBanTarget = function (name, ip) {
    name = name.toLowerCase();
    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getLowerName() === name ||
            this.channel.users[i].ip === ip) {
            this.channel.users[i].kick("You're banned!");
        }
    }
};

KickBanModule.prototype.handleUnban = function (user, data) {
    if (!this.channel.modules.permissions.canBan(user)) {
        return;
    }

    var self = this;
    db.channels.unbanId(this.channel.name, data.id, function (err) {
        if (err) {
            return user.socket.emit("errorMsg", {
                msg: err
            });
        }

        self.sendUnban(self.channel.users, data);
        self.channel.logger.log("[mod] " + user.getName() + " unbanned " + data.name);
        if (self.channel.modules.chat) {
            var banperm = self.channel.modules.permissions.permissions.ban;
            self.channel.modules.chat.sendModMessage(user.getName() + " unbanned " +
                                                     data.name, banperm);
        }
    });
};

module.exports = KickBanModule;
