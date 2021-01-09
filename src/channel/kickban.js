var ChannelModule = require("./module");
var db = require("../database");
var Flags = require("../flags");
var util = require("../utilities");
var Account = require("../account");
import Promise from 'bluebird';

const dbIsNameBanned = Promise.promisify(db.channels.isNameBanned);
const dbIsIPBanned = Promise.promisify(db.channels.isIPBanned);
const dbAddBan = Promise.promisify(db.channels.ban);
const dbGetIPs = Promise.promisify(db.getIPs);

const TYPE_UNBAN = {
    id: "number",
    name: "string"
};

function KickBanModule(_channel) {
    ChannelModule.apply(this, arguments);

    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("/kick", this.handleCmdKick.bind(this));
        this.channel.modules.chat.registerCommand("/kickanons", this.handleCmdKickAnons.bind(this));
        this.channel.modules.chat.registerCommand("/ban", this.handleCmdBan.bind(this));
        this.channel.modules.chat.registerCommand("/ipban", this.handleCmdIPBan.bind(this));
        this.channel.modules.chat.registerCommand("/banip", this.handleCmdIPBan.bind(this));
    }
}

KickBanModule.prototype = Object.create(ChannelModule.prototype);

function checkIPBan(cname, ip, cb) {
    db.channels.isIPBanned(cname, ip, function (err, banned) {
        if (err) {
            cb(false);
        } else {
            cb(banned);
        }
    });
}

function checkBan(cname, ip, name, cb) {
    db.channels.isBanned(cname, ip, name, function (err, banned) {
        if (err) {
            cb(false);
        } else {
            cb(banned);
        }
    });
}

KickBanModule.prototype.onUserPreJoin = function (user, data, cb) {
    if (!this.channel.is(Flags.C_REGISTERED)) {
        return cb(null, ChannelModule.PASSTHROUGH);
    }

    const cname = this.channel.name;
    function callback(banned) {
        if (banned) {
            cb(null, ChannelModule.DENY);
            user.kick("You are banned from this channel.");
        } else {
            cb(null, ChannelModule.PASSTHROUGH);
        }
    }

    if (user.getName() !== '') {
        checkBan(cname, user.realip, user.getName(), callback);
    } else {
        checkIPBan(cname, user.realip, callback);
    }
};

KickBanModule.prototype.onUserPostJoin = function (user) {
    if (!this.channel.is(Flags.C_REGISTERED)) {
        return;
    }

    const chan = this.channel;
    const refCaller = "KickBanModule::onUserPostJoin";
    user.waitFlag(Flags.U_LOGGED_IN, function () {
        chan.refCounter.ref(refCaller);
        db.channels.isNameBanned(chan.name, user.getName(), function (err, banned) {
            if (!err && banned) {
                user.kick("You are banned from this channel.");
                if (chan.modules.chat) {
                    chan.modules.chat.sendModMessage(user.getName() + " was kicked (" +
                                                     "name is banned)");
                }
            }
            chan.refCounter.unref(refCaller);
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
                ip: banlist[i].ip === "*" ? "*" : util.cloakIP(banlist[i].ip),
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

KickBanModule.prototype.handleCmdKick = function (user, msg, _meta) {
    if (!this.channel.modules.permissions.canKick(user)) {
        return;
    }

    var args = msg.split(" ");
    args.shift(); /* shift off /kick */
    if (args.length === 0 || args[0].trim() === "") {
        return user.socket.emit("errorMsg", {
            msg: "No kick target specified.  If you're trying to kick " +
                 "anonymous users, use /kickanons"
        });
    }
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

    if (target.account.effectiveRank >= user.account.effectiveRank
        || target.account.globalRank > user.account.globalRank) {
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

KickBanModule.prototype.handleCmdKickAnons = function (user, _msg, _meta) {
    if (!this.channel.modules.permissions.canKick(user)) {
        return;
    }

    var users = Array.prototype.slice.call(this.channel.users);
    users.forEach(function (u) {
        if (!u.is(Flags.U_LOGGED_IN)) {
            u.kick("anonymous user");
        }
    });

    this.channel.logger.log("[mod] " + user.getName() + " kicked anonymous users.");
    if (this.channel.modules.chat) {
        this.channel.modules.chat.sendModMessage(user.getName() + " kicked anonymous " +
                                                 "users");
    }
};

/* /ban - name bans */
KickBanModule.prototype.handleCmdBan = function (user, msg, _meta) {
    var args = msg.split(" ");
    args.shift(); /* shift off /ban */
    if (args.length === 0 || args[0].trim() === "") {
        return user.socket.emit("errorMsg", {
            msg: "No ban target specified."
        });
    }
    var name = args.shift().toLowerCase();
    var reason = args.join(" ");

    const chan = this.channel;
    chan.refCounter.ref("KickBanModule::handleCmdBan");

    this.banName(user, name, reason).catch(error => {
        const message = error.message || error;
        user.socket.emit("errorMsg", { msg: message });
    }).then(() => {
        chan.refCounter.unref("KickBanModule::handleCmdBan");
    });
};

/* /ipban - bans name and IP addresses associated with it */
KickBanModule.prototype.handleCmdIPBan = function (user, msg, _meta) {
    var args = msg.split(" ");
    args.shift(); /* shift off /ipban */
    if (args.length === 0 || args[0].trim() === "") {
        return user.socket.emit("errorMsg", {
            msg: "No ban target specified."
        });
    }
    var name = args.shift().toLowerCase();
    var range = false;
    if (args[0] === "range") {
        range = "range";
        args.shift();
    } else if (args[0] === "wrange") {
        range = "wrange";
        args.shift();
    }
    var reason = args.join(" ");

    const chan = this.channel;
    chan.refCounter.ref("KickBanModule::handleCmdIPBan");

    this.banAll(user, name, range, reason).catch(error => {
        //console.log('!!!', error.stack);
        const message = error.message || error;
        user.socket.emit("errorMsg", { msg: message });
    }).then(() => {
        chan.refCounter.unref("KickBanModule::handleCmdIPBan");
    });
};

KickBanModule.prototype.checkChannelAlive = function checkChannelAlive() {
    if (!this.channel || this.channel.dead) {
        throw new Error("Channel not live");
    }
};

KickBanModule.prototype.banName = async function banName(actor, name, reason) {
    reason = reason.substring(0, 255);

    var chan = this.channel;

    if (!chan.modules.permissions.canBan(actor)) {
        throw new Error("You do not have ban permissions on this channel");
    }

    name = name.toLowerCase();
    if (name === actor.getLowerName()) {
        actor.socket.emit("costanza", {
            msg: "You can't ban yourself"
        });

        throw new Error("You cannot ban yourself");
    }

    const rank = await Account.rankForName(name, chan.name);
    this.checkChannelAlive();

    if (rank >= actor.account.effectiveRank) {
        throw new Error("You don't have permission to ban " + name);
    }

    const isBanned = await dbIsNameBanned(chan.name, name);
    this.checkChannelAlive();

    if (isBanned) {
        throw new Error(name + " is already banned");
    }

    await dbAddBan(chan.name, "*", name, reason, actor.getName());
    this.checkChannelAlive();

    chan.logger.log("[mod] " + actor.getName() + " namebanned " + name);

    if (chan.modules.chat) {
        chan.modules.chat.sendModMessage(
            actor.getName() + " namebanned " + name,
            chan.modules.permissions.permissions.ban
        );
    }

    this.kickBanTarget(name, null);
};

KickBanModule.prototype.banIP = async function banIP(actor, ip, name, reason) {
    reason = reason.substring(0, 255);
    var masked = util.cloakIP(ip);

    var chan = this.channel;

    if (!chan.modules.permissions.canBan(actor)) {
        throw new Error("You do not have ban permissions on this channel");
    }

    const rank = await Account.rankForIP(ip, chan.name);
    this.checkChannelAlive();

    if (rank >= actor.account.effectiveRank) {
        // TODO: this message should be made friendlier
        throw new Error("You don't have permission to ban IP " + masked);
    }

    const isBanned = await dbIsIPBanned(chan.name, ip);
    this.checkChannelAlive();

    if (isBanned) {
        // TODO: this message should be made friendlier
        throw new Error(masked + " is already banned");
    }

    await dbAddBan(chan.name, ip, name, reason, actor.getName());
    this.checkChannelAlive();

    var cloaked = util.cloakIP(ip);
    chan.logger.log(
        "[mod] " + actor.getName() + " banned " + cloaked +
        " (" + name + ")"
    );

    if (chan.modules.chat) {
        chan.modules.chat.sendModMessage(
            actor.getName() + " banned " + cloaked + " (" + name + ")",
            chan.modules.permissions.permissions.ban
        );
    }

    this.kickBanTarget(name, ip);
};

KickBanModule.prototype.banAll = async function banAll(
    actor,
    name,
    range,
    reason
) {
    reason = reason.substring(0, 255);

    var chan = this.channel;

    if (!chan.modules.permissions.canBan(actor)) {
        throw new Error("You do not have ban permissions on this channel");
    }

    const ips = await dbGetIPs(name);
    this.checkChannelAlive();

    const toBan = new Set();
    for (let ip of ips) {
        switch (range) {
            case "range":
                toBan.add(util.getIPRange(ip));
                break;
            case "wrange":
                toBan.add(util.getWideIPRange(ip));
                break;
            default:
                toBan.add(ip);
                break;
        }
    }

    const promises = Array.from(toBan).map(ip =>
        this.banIP(actor, ip, name, reason)
    );

    if (!await dbIsNameBanned(chan.name, name)) {
        promises.push(this.banName(actor, name, reason));
    }

    await Promise.all(promises);
    this.checkChannelAlive();
};

KickBanModule.prototype.kickBanTarget = function (name, ip) {
    name = name.toLowerCase();
    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getLowerName() === name ||
            this.channel.users[i].realip === ip) {
            this.channel.users[i].kick("You're banned!");
        }
    }
};

KickBanModule.prototype.handleUnban = function (user, data) {
    if (!this.channel.modules.permissions.canBan(user)) {
        return;
    }

    var self = this;
    this.channel.refCounter.ref("KickBanModule::handleUnban");
    db.channels.unbanId(this.channel.name, data.id, function (err) {
        if (err) {
            self.channel.refCounter.unref("KickBanModule::handleUnban");
            return user.socket.emit("errorMsg", {
                msg: err
            });
        }

        self.sendUnban(self.channel.users, data);
        self.channel.logger.log("[mod] " + user.getName() + " unbanned " + data.name);
        if (self.channel.modules.chat) {
            var banperm = self.channel.modules.permissions.permissions.ban;
            self.channel.modules.chat.sendModMessage(
                user.getName() + " unbanned " + data.name,
                banperm
            );
        }
        self.channel.refCounter.unref("KickBanModule::handleUnban");
    });
};

module.exports = KickBanModule;
