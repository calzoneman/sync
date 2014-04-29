var ChannelModule = require("./module");
var db = require("../database");
var Flags = require("../flags");

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

module.exports = KickBanModule;
