var ChannelModule = require("./module");
var Poll = require("../poll").Poll;

const TYPE_NEW_POLL = {
    title: "string",
    timeout: "number,optional",
    obscured: "boolean",
    opts: "array"
};

const TYPE_VOTE = {
    option: "number"
};

function PollModule(channel) {
    ChannelModule.apply(this, arguments);

    this.poll = null;
    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("poll", this.handlePollCmd.bind(this, false));
        this.channel.modules.chat.registerCommand("hpoll", this.handlePollCmd.bind(this, true));
    }
}

PollModule.prototype = Object.create(ChannelModule.prototype);

PollModule.prototype.unload = function () {
    if (this.poll && this.poll.timer) {
        clearTimeout(this.poll.timer);
    }
};

PollModule.prototype.load = function (data) {
    if ("poll" in data) {
        if (data.poll !== null) {
            this.poll = new Poll(data.poll.initiator, "", [], data.poll.obscured);
            this.poll.title = data.poll.title;
            this.poll.options = data.poll.options;
            this.poll.counts = data.poll.counts;
            this.poll.votes = data.poll.votes;
        }
    }
};

PollModule.prototype.save = function (data) {
    if (this.poll === null) {
        data.poll = null;
        return;
    }

    data.poll = {
        title: this.poll.title,
        initiator: this.poll.initiator,
        options: this.poll.options,
        counts: this.poll.counts,
        votes: this.poll.votes,
        obscured: this.poll.obscured
    };
};

PollModule.prototype.onUserPostJoin = function (user) {
    this.sendPoll([user]);
    user.socket.typecheckedOn("newPoll", TYPE_NEW_POLL, this.handleNewPoll.bind(this, user));
    user.socket.typecheckedOn("vote", TYPE_VOTE, this.handleVote.bind(this, user));
    user.socket.on("closePoll", this.handleClosePoll.bind(this, user));
};

PollModule.prototype.onUserPart = function(user) {
    if (this.poll) {
        this.poll.unvote(user.realip);
        this.sendPollUpdate(this.channel.users);
    }
};

PollModule.prototype.sendPoll = function (users) {
    if (!this.poll) {
        return;
    }

    var obscured = this.poll.packUpdate(false);
    var unobscured = this.poll.packUpdate(true);
    var perms = this.channel.modules.permissions;

    users.forEach(function (u) {
        u.socket.emit("closePoll");
        if (perms.canViewHiddenPoll(u)) {
            u.socket.emit("newPoll", unobscured);
        } else {
            u.socket.emit("newPoll", obscured);
        }
    });
};

PollModule.prototype.sendPollUpdate = function (users) {
    if (!this.poll) {
        return;
    }

    var obscured = this.poll.packUpdate(false);
    var unobscured = this.poll.packUpdate(true);
    var perms = this.channel.modules.permissions;

    users.forEach(function (u) {
        if (perms.canViewHiddenPoll(u)) {
            u.socket.emit("updatePoll", unobscured);
        } else {
            u.socket.emit("updatePoll", obscured);
        }
    });
};

PollModule.prototype.handleNewPoll = function (user, data) {
    if (!this.channel.modules.permissions.canControlPoll(user)) {
        return;
    }

    var title = data.title.substring(0, 255);
    var opts = data.opts.map(function (x) { return (""+x).substring(0, 255); });
    var obscured = data.obscured;

    var poll = new Poll(user.getName(), title, opts, obscured);
    var self = this;
    if (data.hasOwnProperty("timeout") && !isNaN(data.timeout) && data.timeout > 0) {
        poll.timer = setTimeout(function () {
            if (self.poll === poll) {
                self.handleClosePoll({
                    getName: function () { return "[poll timer]" },
                    effectiveRank: 255
                });
            }
        }, data.timeout * 1000);
    }

    this.poll = poll;
    this.sendPoll(this.channel.users);
    this.channel.logger.log("[poll] " + user.getName() + " opened poll: '" + poll.title + "'");
};

PollModule.prototype.handleVote = function (user, data) {
    if (!this.channel.modules.permissions.canVote(user)) {
        return;
    }

    if (this.poll) {
        this.poll.vote(user.realip, data.option);
        this.sendPollUpdate(this.channel.users);
    }
};

PollModule.prototype.handleClosePoll = function (user) {
    if (!this.channel.modules.permissions.canControlPoll(user)) {
        return;
    }

    if (this.poll) {
        if (this.poll.obscured) {
            this.poll.obscured = false;
            this.channel.broadcastAll("updatePoll", this.poll.packUpdate(true));
        }

        if (this.poll.timer) {
            clearTimeout(this.poll.timer);
        }

        this.channel.broadcastAll("closePoll");
        this.channel.logger.log("[poll] " + user.getName() + " closed the active poll");
        this.poll = null;
    }
};

PollModule.prototype.handlePollCmd = function (obscured, user, msg, meta) {
    if (!this.channel.modules.permissions.canControlPoll(user)) {
        return;
    }

    msg = msg.replace(/^\/h?poll/, "");

    var args = msg.split(",");
    var title = args.shift();
    var poll = new Poll(user.getName(), title, args, obscured);
    this.poll = poll;
    this.sendPoll(this.channel.users);
    this.channel.logger.log("[poll] " + user.getName() + " opened poll: '" + poll.title + "'");
};

module.exports = PollModule;
