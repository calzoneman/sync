var ChannelModule = require("./module");

function RankModule(channel) {
    ChannelModule.apply(this, arguments);
}

RankModule.prototype = Object.create(ChannelModule.prototype);

RankModule.prototype.handleRankChange = function (user, data) {
    if (user.account.effectiveRank < 3) {
        return;
    }

    var rank = data.rank;
    var userrank = user.account.effectiveRank;
    var name = data.name.substring(0, 20);

    if (isNaN(rank) || rank < 1 || (rank >= userrank && !(userrank === 4 && rank === 4))) {
        user.socket.emit("channelRankFail", {
            msg: "Updating user rank failed: You can't promote someone to a rank equal " +
                 "or higher than yourself, or demote them to below rank 1."
        });
        return;
    }

    var receiver;
    var lowerName = name.toLowerCase();
    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].name.toLowerCase() === lowerName) {
            receiver = this.channel.users[i];
            break;
        }
    }

    if (!this.channel.is(Flags.C_REGISTERED)) {
        user.socket.emit("channelRankFail", {
            msg: "Updating user rank failed: in an unregistered channel, a user must " +
                 "be online in the channel in order to have their rank changed."
        });
        return;
    }

    if (receiver) {
        var current = Math.max(receiver.account.globalRank, receiver.account.channelRank);
        if (current >= userrank && !(userrank === 4 && current === 4)) {
            user.socket.emit("channelRankFail", {
                msg: "Updating user rank failed: You can't promote or demote "+
                     "someone who has equal or higher rank than yourself"
            });
            return;
        }

        receiver.account.channelRank = rank;
        receiver.account.effectiveRank = rank;
        this.channel.logger.log("[mod] " + user.getName() + " set " + name + "'s rank " +
                                "to " + rank);
        this.channel.broadcastAll("setUserRank", data);

        if (!this.channel.is(Flags.C_REGISTERED)) {
            user.socket.emit("channelRankFail", {
                msg: "This channel is not registered.  Any rank changes are temporary " +
                     "and not stored in the database."
            });
            return;
        }

        if (!receiver.is(Flags.U_REGISTERED)) {
            user.socket.emit("channelRankFail", {
                msg: "The user you promoted is not a registered account.  " +
                     "Any rank changes are temporary and not stored in the database."
            });
            return;
        }

        data.userrank = userrank;

        this.updateDatabase(data, function (err) {
            if (err) {
                user.socket.emit("channelRankFail", {
                    msg: "Database failure when updating rank"
                });
            }
        });
    } else {
        data.userrank = userrank;
        this.updateDatabase(data, function (err) {
            if (err) {
                user.socket.emit("channelRankFail", {
                    msg: "Updating user rank failed: " + err
                });
            }
        });
    }
};

RankModule.prototype.updateDatabase = function (data, cb) {
    var chan = this.channel;
    Account.rankForName(data.name, { channel: this.channel.name }, function (err, rank) {
        if (err) {
            return cb(err);
        }

        if (rank >= data.userrank && !(rank === 4 && data.userrank === 4)) {
            cb("You can't promote or demote someone with equal or higher rank than you.");
            return;
        }

        db.channels.setRank(chan.name, data.name, data.rank, cb);
    });
};

module.exports = RankModule;
