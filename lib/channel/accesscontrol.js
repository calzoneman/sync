var User = require("../user");
var Channel = require("../channel");
var Account = require("../account");

function AccessControlModule(channel) {
    this.channel = channel;
}

AccessControlModule.prototype.preJoin = function (user, data) {
    var chan = this.channel,
        opts = this.channel.modules.opts;
    if (opts.get("password") !== false && data.pw !== opts.get("password")) {
        if (user.is(User.LOGGED_IN) && user.account.effectiveRank >= 2) {
            chan.join(user);
            user.socket.emit("cancelNeedPassword");
        } else {
            user.socket.emit("needPassword", typeof data.pw !== "undefined");
            /* Option 1: log in as a moderator */
            user.once("channelAccount", function (account) {
                /* Already joined the channel by some other condition */
                if (user.is(User.IN_CHANNEL)) {
                    return;
                }

                if (account.effectiveRank >= 2) {
                    chan.join(user);
                    user.socket.emit("cancelNeedPassword");
                }
            });

            /* Option 2: Enter correct password */
            var pwListener = function (pw) {
                if (chan.is(Channel.DEAD)) {
                    return;
                }

                if (pw !== opts.get("password")) {
                    user.socket.emit("needPassword", true);
                    return;
                }

                user.socket.listeners("channelPassword").splice(
                    user.socket.listeners("channelPassword").indexOf(pwListener)
                );
                chan.join(user);
            };

            user.socket.on("channelPassword", pwListener);
        }
    } else {
        chan.join(user);
    }

    user.on("login", function (account) {
        Account.getAccount(account.name, account.ip, { channel: chan.name },
                           function (err, account) {
            user.account = account;
            user.emit("channelAccount", account);
        });
    });
};

module.exports = AccessControlModule;
