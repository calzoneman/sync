var ChannelModule = require("./module");
var Flags = require("../flags");
var Account = require("../account");
var db = require("../database");

const TYPE_SET_CHANNEL_RANK = {
    name: "string",
    rank: "number"
};

function RankModule(channel) {
    ChannelModule.apply(this, arguments);

    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("/rank", this.handleCmdRank.bind(this));
    }
}

RankModule.prototype = Object.create(ChannelModule.prototype);

RankModule.prototype.onUserPostJoin = function (user) {
    user.socket.typecheckedOn("setChannelRank", TYPE_SET_CHANNEL_RANK, this.handleRankChange.bind(this, user));
    var self = this;
    user.socket.on("requestChannelRanks", function () {
        self.sendChannelRanks([user]);
    });
};

RankModule.prototype.sendChannelRanks = function (users) {
    if (!this.channel.is(Flags.C_REGISTERED)) {
        return;
    }

    db.channels.allRanks(this.channel.name, function (err, ranks) {
        if (err) {
            return;
        }

        users.forEach(function (u) {
            if (u.account.effectiveRank >= 3) {
                u.socket.emit("channelRanks", ranks);
            }
        });
    });
};

RankModule.prototype.handleCmdRank = function (user, msg, meta) {
    var args = msg.split(" ");
    args.shift(); /* shift off /rank */
    var name = args.shift();
    var rank = parseInt(args.shift());

    if (!name || isNaN(rank)) {
        user.socket.emit("noflood", {
            action: "/rank",
            msg: "Syntax: /rank <username> <rank>.  <rank> must be a positive integer > 1"
        });
        return;
    }

    this.handleRankChange(user, { name: name, rank: rank });
};

RankModule.prototype.handleRankChange = function (user, data) {
    if (user.account.effectiveRank < 3) {
        return;
    }

    var rank = data.rank;
    var userrank = user.account.effectiveRank;
    var name = data.name.substring(0, 20).toLowerCase();

    if (!name.match(/^[a-zA-Z0-9_-]{1,20}$/)) {
        user.socket.emit("channelRankFail", {
            msg: "Invalid target name " + data.name
        });
        return;
    }

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
        if (this.channel.users[i].getLowerName() === lowerName) {
            receiver = this.channel.users[i];
            break;
        }
    }

    if (name === user.getLowerName()) {
        user.socket.emit("channelRankFail", {
            msg: "Updating user rank failed: You can't promote or demote yourself."
        });
        return;
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
        receiver.account.effectiveRank = Math.max(receiver.account.globalRank, rank);
        receiver.socket.emit("rank", receiver.account.effectiveRank);
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
        var self = this;
        this.updateDatabase(data, function (err) {
            if (err) {
                user.socket.emit("channelRankFail", {
                    msg: "Updating user rank failed: " + err
                });
            }
            self.channel.logger.log("[mod] " + user.getName() + " set " + data.name +
                                    "'s rank to " + rank);
            self.channel.broadcastAll("setUserRank", data);
            if (self.channel.modules.chat) {
                self.channel.modules.chat.sendModMessage(
                    user.getName() + " set " + data.name + "'s rank to " + rank,
                    3
                );
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
