var Account = require("../account");
var ChannelModule = require("./module");
var Flags = require("../flags");

function AccessControlModule(channel) {
    ChannelModule.apply(this, arguments);
}

AccessControlModule.prototype = Object.create(ChannelModule.prototype);

var pending = 0;
AccessControlModule.prototype.onUserPreJoin = function (user, data, cb) {
    var chan = this.channel,
        opts = this.channel.modules.options;
    var self = this;
    if (user.socket.disconnected) {
        return cb("User disconnected", ChannelModule.DENY);
    }

    if (opts.get("password") !== false && data.pw !== opts.get("password")) {
        user.socket.on("disconnect", function () {
            if (!user.is(Flags.U_IN_CHANNEL)) {
                cb("User disconnected", ChannelModule.DENY);
            }
        });

        if (user.is(Flags.U_LOGGED_IN) && user.account.effectiveRank >= 2) {
            cb(null, ChannelModule.PASSTHROUGH);
            user.socket.emit("cancelNeedPassword");
        } else {
            user.socket.emit("needPassword", typeof data.pw !== "undefined");
            /* Option 1: log in as a moderator */
            user.waitFlag(Flags.U_LOGGED_IN, function () {
                user.refreshAccount({ channel: self.channel.name }, function (err, account) {

                    /* Already joined the channel by some other condition */
                    if (user.is(Flags.U_IN_CHANNEL)) {
                        return;
                    }

                    if (account.effectiveRank >= 2) {
                        cb(null, ChannelModule.PASSTHROUGH);
                        user.socket.emit("cancelNeedPassword");
                    }
                });
            });

            /* Option 2: Enter correct password */
            var pwListener = function (pw) {
                if (chan.dead || user.is(Flags.U_IN_CHANNEL)) {
                    return;
                }

                if (pw !== opts.get("password")) {
                    user.socket.emit("needPassword", true);
                    return;
                }

                user.socket.emit("cancelNeedPassword");
                cb(null, ChannelModule.PASSTHROUGH);
            };

            user.socket.on("channelPassword", pwListener);
        }
    } else {
        cb(null, ChannelModule.PASSTHROUGH);
    }
};

module.exports = AccessControlModule;
