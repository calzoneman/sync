var ChannelModule = require("./module");
var db = require("../database");
var Flags = require("../flags");
var util = require("../utilities");

const TYPE_UNBAN = {
    id: "number",
    name: "string"
};

function KickBanModule(channel) {
    ChannelModule.apply(this, arguments);

    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("/kick", this.handleCmdKick.bind(this));
    }
}

KickBanModule.prototype = Object.create(ChannelModule.prototype);

KickBanModule.prototype.onUserPreJoin = function (user, cb) {
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
        console.log("can't kick");
        return;
    }

    var args = msg.split(" ");
    args.shift(); /* shift off /kick */
    var name = args.shift().toLowerCase();
    var reason = args.join(" ");
    var target = null;

    for (var i = 0; i < this.channel.users.length; i++) {
        console.log(this.channel.users[i].getLowerName(), name);
        if (this.channel.users[i].getLowerName() === name) {
            target = this.channel.users[i];
            break;
        }
    }

    if (target === null) {
        console.log("target is null");
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
