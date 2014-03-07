var db = require("../database");
var Account = require("../account");
var Q = require("q");

function Banlist(channel) {
    this.channel = channel;
}

Banlist.prototype = {
    checkNameBan: function (name, cb) {
        db.channels.isNameBanned(this.channel.name, name, cb);
    },

    checkIPBan: function (ip, cb) {
        db.channels.isIPBanned(this.channel.name, ip, cb);
    },

    banName: function (name, actor, reason, cb) {
        reason = reason.substring(0, 255);

        var chan = this.channel;
        var error = function (what) {
            actor.socket.emit("errorMsg", { msg: what });
            cb(what);
        }, costanza = function (what) {
            actor.socket.emit("costanza", { msg: what })
            cb(what);
        };

        if (!chan.permissionSet.hasPermission(actor.account, "ban")) {
            return error("You do not have ban permissions on this channel");
        }

        name = name.toLowerCase();
        if (name === actor.account.lowername) {
            return costanza("You can't ban yourself");
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

            return Q.nfcall(db.channels.ban, chan.name, "*", name, reason, actor.name);
        }).then(function () {
            chan.logger.log("[mod] " + actor.name + " namebanned " + name);
            chan.sendModMessage(actor.name + " namebanned " + name,
                                chan.permissionSet.permissions.ban);
            return true;
        }).catch(error).done(function () {
            cb(null);
        });
    },

    banIP: function (ip, name, reason, actor, cb) {
        reason = reason.substring(0, 255);
        var masked = util.maskIP(ip);

        var chan = this.channel;
        var error = function (what) {
            actor.socket.emit("errorMsg", { msg: what });
            cb(what);
        };

        if (!chan.permissionSet.hasPermission(actor.account, "ban")) {
            return error("You do not have ban permissions on this channel");
        }

        Q.nfcall(Account.rankForIP, ip).then(function (rank) {
            if (rank >= actor.rank) {
                throw "You don't have permission to ban IP " + masked;
            }

            return Q.nfcall(db.channels.isIPBanned, chan.name, ip);
        }).then(function (banned) {
            if (banned) {
                throw masked + " is already banned";
            }

            if (chan.dead) { throw null; }

            return Q.nfcall(db.channels.ban, chan.name, ip, name, reason, actor.name);
        }).then(function () {
            chan.logger.log("[mod] " + actor.name + " banned " + ip + " (" + name + ")");
            chan.sendModMessage(actor.name + " banned " + util.maskIP(ip) +
                                " (" + name + ")", chan.permissionSet.permissions.ban);
        }).catch(error).done(function () {
            cb(null);
        });
    },

    banAll: function (name, reason, actor, cb) {
        var self = this;
        reason = reason.substring(0, 255);

        var chan = self.channel;
        var error = function (what) {
            actor.socket.emit("errorMsg", { msg: what });
            cb(what);
        };

        if (!chan.permissionSet.hasPermission(actor.account, "ban")) {
            return error("You do not have ban permissions on this channel");
        }

        Q.nfcall(self.banName, name, reason, actor)
        .then(function () {
            Q.nfcall(db.getIPs, name);
        }).then(function (ips) {
            var all = ips.map(function (ip) {
                return Q.nfcall(self.banIP, ip, name, reason, actor);
            });

            Q.all(all).done();
        }).catch(error).done(cb);
    },

    unban: function (id, actor, cb) {
        var self = this;
        var chan = self.channel;

        db.channels.unbanId(chan.name, id, function (err, res) {
            if (err) {
                actor.socket.emit("errorMsg", {
                    msg: err
                });
                return;
            }

            chan.sendUnban(chan.users, { id: id });
        });
    }
};

module.exports = Banlist;
