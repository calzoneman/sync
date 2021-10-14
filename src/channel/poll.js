var ChannelModule = require("./module");
var Poll = require("../poll").Poll;
import { ValidationError } from '../errors';
import Config from '../config';
import { ackOrErrorMsg } from '../util/ack';

const TYPE_NEW_POLL = {
    title: "string",
    timeout: "number,optional",
    obscured: "boolean",
    retainVotes: "boolean,optional",
    opts: "array"
};

const TYPE_VOTE = {
    option: "number"
};

const ROOM_VIEW_HIDDEN = ":viewHidden";
const ROOM_NO_VIEW_HIDDEN = ":noViewHidden";

function PollModule(_channel) {
    ChannelModule.apply(this, arguments);

    this.poll = null;
    this.roomViewHidden = this.channel.uniqueName + ROOM_VIEW_HIDDEN;
    this.roomNoViewHidden = this.channel.uniqueName + ROOM_NO_VIEW_HIDDEN;
    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("poll", this.handlePollCmd.bind(this, false));
        this.channel.modules.chat.registerCommand("hpoll", this.handlePollCmd.bind(this, true));
    }
    this.supportsDirtyCheck = true;
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
            this.poll = Poll.fromChannelData(data.poll);
        }
    }

    this.dirty = false;
};

PollModule.prototype.save = function (data) {
    if (this.poll === null) {
        data.poll = null;
        return;
    }

    data.poll = this.poll.toChannelData();
};

PollModule.prototype.onUserPostJoin = function (user) {
    this.sendPoll(user);
    user.socket.typecheckedOn("newPoll", TYPE_NEW_POLL, this.handleNewPoll.bind(this, user));
    user.socket.typecheckedOn("vote", TYPE_VOTE, this.handleVote.bind(this, user));
    user.socket.on("closePoll", this.handleClosePoll.bind(this, user));
    this.addUserToPollRoom(user);
    const self = this;
    user.on("effectiveRankChange", () => {
        if (self.channel && !self.channel.dead) {
            self.addUserToPollRoom(user);
        }
    });
};

PollModule.prototype.addUserToPollRoom = function (user) {
    const perms = this.channel.modules.permissions;
    if (perms.canViewHiddenPoll(user)) {
        user.socket.leave(this.roomNoViewHidden);
        user.socket.join(this.roomViewHidden);
    } else {
        user.socket.leave(this.roomViewHidden);
        user.socket.join(this.roomNoViewHidden);
    }
};

PollModule.prototype.onUserPart = function(user) {
    if (this.poll && !this.poll.retainVotes && this.poll.uncountVote(user.realip)) {
        this.broadcastPoll(false);
    }
};

PollModule.prototype.sendPoll = function (user) {
    if (!this.poll) {
        return;
    }

    var perms = this.channel.modules.permissions;

    if (perms.canViewHiddenPoll(user)) {
        var unobscured = this.poll.toUpdateFrame(true);
        user.socket.emit("newPoll", unobscured);
    } else {
        var obscured = this.poll.toUpdateFrame(false);
        user.socket.emit("newPoll", obscured);
    }
};

PollModule.prototype.broadcastPoll = function (isNewPoll) {
    if (!this.poll) {
        return;
    }

    var obscured = this.poll.toUpdateFrame(false);
    var unobscured = this.poll.toUpdateFrame(true);

    const event = isNewPoll ? "newPoll" : "updatePoll";

    this.channel.broadcastToRoom(event, unobscured, this.roomViewHidden);
    this.channel.broadcastToRoom(event, obscured, this.roomNoViewHidden);
};

PollModule.prototype.validatePollInput = function validatePollInput(title, options) {
    if (typeof title !== 'string') {
        throw new ValidationError('Poll title must be a string.');
    }
    if (title.length > 255) {
        throw new ValidationError('Poll title must be no more than 255 characters long.');
    }
    if (!Array.isArray(options)) {
        throw new ValidationError('Poll options must be an array.');
    }
    if (options.length > Config.get('poll.max-options')) {
        throw new ValidationError(`Polls are limited to a maximum of ${Config.get('poll.max-options')} options.`);
    }
    for (let i = 0; i < options.length; i++) {
        if (typeof options[i] !== 'string') {
            throw new ValidationError('Poll options must be strings.');
        }
        if (options[i].length === 0 || options[i].length > 255) {
            throw new ValidationError('Poll options must be 1-255 characters long.');
        }
    }
};

PollModule.prototype.handleNewPoll = function (user, data, ack) {
    if (!this.channel.modules.permissions.canControlPoll(user)) {
        return;
    }

    // Ensure any existing poll is closed
    this.handleClosePoll(user);

    ack = ackOrErrorMsg(ack, user);

    if (typeof data !== 'object' || data === null) {
        ack({
            error: {
                message: 'Invalid data received for poll creation.'
            }
        });
        return;
    }

    try {
        this.validatePollInput(data.title, data.opts);
    } catch (error) {
        ack({
            error: {
                message: error.message
            }
        });
        return;
    }

    if (data.hasOwnProperty("timeout") &&
        (isNaN(data.timeout) || data.timeout < 1 || data.timeout > 86400)) {
        ack({
            error: {
                message: "Poll timeout must be between 1 and 86400 seconds"
            }
        });
        return;
    }

    var poll = Poll.create(
        user.getName(),
        data.title,
        data.opts,
        {
            hideVotes: data.obscured,
            retainVotes: data.retainVotes === undefined ? false : data.retainVotes
        }
    );
    var self = this;
    if (data.hasOwnProperty("timeout")) {
        poll.timer = setTimeout(function () {
            if (self.poll === poll) {
                self.handleClosePoll({
                    getName: function () { return "[poll timer]"; },
                    effectiveRank: 255
                });
            }
        }, data.timeout * 1000);
    }

    this.poll = poll;
    this.dirty = true;
    this.broadcastPoll(true);
    this.channel.logger.log("[poll] " + user.getName() + " opened poll: '" + poll.title + "'");
    ack({});
};

PollModule.prototype.handleVote = function (user, data) {
    if (!this.channel.modules.permissions.canVote(user)) {
        return;
    }

    if (this.poll) {
        if (this.poll.countVote(user.realip, data.option)) {
            this.dirty = true;
            this.broadcastPoll(false);
        }
    }
};

PollModule.prototype.handleClosePoll = function (user) {
    if (!this.channel.modules.permissions.canControlPoll(user)) {
        return;
    }

    if (this.poll) {
        if (this.poll.hideVotes) {
            this.poll.hideVotes = false;
            this.channel.broadcastAll("updatePoll", this.poll.toUpdateFrame(true));
        }

        if (this.poll.timer) {
            clearTimeout(this.poll.timer);
        }

        this.channel.broadcastAll("closePoll");
        this.channel.logger.log("[poll] " + user.getName() + " closed the active poll");
        this.poll = null;
        this.dirty = true;
    }
};

PollModule.prototype.handlePollCmd = function (obscured, user, msg, _meta) {
    if (!this.channel.modules.permissions.canControlPoll(user)) {
        return;
    }

    // Ensure any existing poll is closed
    this.handleClosePoll(user);

    msg = msg.replace(/^\/h?poll/, "");

    var args = msg.split(",");
    var title = args.shift();

    try {
        this.validatePollInput(title, args);
    } catch (error) {
        user.socket.emit('errorMsg', {
            msg: 'Error creating poll: ' + error.message
        });
        return;
    }

    var poll = Poll.create(user.getName(), title, args, { hideVotes: obscured });
    this.poll = poll;
    this.dirty = true;
    this.broadcastPoll(true);
    this.channel.logger.log("[poll] " + user.getName() + " opened poll: '" + poll.title + "'");
};

module.exports = PollModule;
