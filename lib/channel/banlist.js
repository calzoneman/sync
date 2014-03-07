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

    banName: function (name, actor, reason) {
        reason = reason.substring(0, 255);

        var chan = this.channel;
        var error = function (what) {
            actor.socket.emit("errorMsg", { msg: what });
        }, costanza = function (what) {
            actor.socket.emit("costanza", { msg: what })
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
            if (chan.dead) { return; }

            if (rank >= actor.account.effectiveRank) {
                throw "You don't have permission to ban " + name;
            }

            return Q.nfcall(db.channels.isNameBanned, chan.name, name);
        }).then(function (banned) {
            if (banned) {
                throw name + " is already banned";
            }

            return Q.nfcall(db.channels.ban, chan.name, "*", name, reason, actor.name);
        }).then(function () {
            chan.logger.log("[mod] " + actor.name + " namebanned " + name);
            chan.sendModMessage(actor.name + " namebanned " + name,
                                chan.permissionSet.permissions.ban);
            return true;
        }).catch(error).done();
    },

    banIP: function (ip, actor, cb) {

    }
};

module.exports = Banlist;
