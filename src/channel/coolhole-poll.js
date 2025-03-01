var ChannelModule = require("./module");
var CoolholePoll = require("../coolhole-poll").CoolholePoll;
import { ValidationError } from "../errors";
import Config from "../config";
import { ackOrErrorMsg } from "../util/ack";

const TYPE_NEW_POLL = {
  title: "string",
  timeout: "number,optional",
  obscured: "boolean",
  retainVotes: "boolean,optional",
  gamble: "boolean,optional",
  opts: "array",
};

const TYPE_VOTE = {
  option: "number",
  wager: "number,optional",
};

const ROOM_VIEW_HIDDEN = ":viewHidden";
const ROOM_NO_VIEW_HIDDEN = ":noViewHidden";

const parsePollMesage = (msg) => {
  // '/poll {Title} -g {false} -o {option1,option2,option3}'
  const regex = /^\/h?poll\s+\{(.+)\}\s+-g\s+\{(.+)\}\s+-o\s+\{(.+)\}$/gi;
  const [, title, gamble, options] = [...msg.matchAll(regex)][0];
  return { title, gamble: gamble === "true", options: options.split(",") };
};

function CoolholePollModule(_channel) {
  ChannelModule.apply(this, arguments);

  this.poll = null;
  this.roomViewHidden = this.channel.uniqueName + ROOM_VIEW_HIDDEN;
  this.roomNoViewHidden = this.channel.uniqueName + ROOM_NO_VIEW_HIDDEN;
  if (this.channel.modules.chat) {
    this.channel.modules.chat.registerCommand(
      "poll",
      this.handlePollCmd.bind(this, false)
    );
    this.channel.modules.chat.registerCommand(
      "hpoll",
      this.handlePollCmd.bind(this, true)
    );
  }
  this.supportsDirtyCheck = true;
}

CoolholePollModule.prototype = Object.create(ChannelModule.prototype);

CoolholePollModule.prototype.unload = function () {
  if (this.poll && this.poll.timer) {
    clearTimeout(this.poll.timer);
  }
};

CoolholePollModule.prototype.load = function (data) {
  if ("poll" in data) {
    if (data.poll !== null) {
      this.poll = CoolholePoll.fromChannelData(data.poll);
    }
  }

  this.dirty = false;
};

CoolholePollModule.prototype.save = function (data) {
  if (this.poll === null) {
    data.poll = null;
    return;
  }

  data.poll = this.poll.toChannelData();
};

CoolholePollModule.prototype.onUserPostJoin = function (user) {
  this.sendPoll(user);
  user.socket.typecheckedOn(
    "newPoll",
    TYPE_NEW_POLL,
    this.handleNewPoll.bind(this, user)
  );
  user.socket.typecheckedOn(
    "vote",
    TYPE_VOTE,
    this.handleVote.bind(this, user)
  );
  user.socket.on("closePoll", this.handleClosePoll.bind(this, user));
  user.socket.on(
    "chooseWinningPollOption",
    this.handleChooseWinningPollOption.bind(this, user)
  );
  this.addUserToPollRoom(user);
  const self = this;
  user.on("effectiveRankChange", () => {
    if (self.channel && !self.channel.dead) {
      self.addUserToPollRoom(user);
    }
  });
};

CoolholePollModule.prototype.addUserToPollRoom = function (user) {
  const perms = this.channel.modules.permissions;
  if (perms.canViewHiddenPoll(user)) {
    user.socket.leave(this.roomNoViewHidden);
    user.socket.join(this.roomViewHidden);
  } else {
    user.socket.leave(this.roomViewHidden);
    user.socket.join(this.roomNoViewHidden);
  }
};

CoolholePollModule.prototype.onUserPart = function (user) {
  if (
    this.poll &&
    !this.poll.retainVotes &&
    this.poll.uncountVote(user.realip)
  ) {
    this.broadcastPoll(false);
  }
};

CoolholePollModule.prototype.sendPoll = function (user) {
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

CoolholePollModule.prototype.broadcastPoll = function (isNewPoll) {
  if (!this.poll) {
    return;
  }

  var obscured = this.poll.toUpdateFrame(false);
  var unobscured = this.poll.toUpdateFrame(true);

  const event = isNewPoll ? "newPoll" : "updatePoll";

  this.channel.broadcastToRoom(event, unobscured, this.roomViewHidden);
  this.channel.broadcastToRoom(event, obscured, this.roomNoViewHidden);
};

CoolholePollModule.prototype.validatePollInput = function validatePollInput(
  title,
  options
) {
  if (typeof title !== "string") {
    throw new ValidationError("Poll title must be a string.");
  }
  if (title.length > 255) {
    throw new ValidationError(
      "Poll title must be no more than 255 characters long."
    );
  }
  if (!Array.isArray(options)) {
    throw new ValidationError("Poll options must be an array.");
  }
  if (options.length > Config.get("poll.max-options")) {
    throw new ValidationError(
      `Polls are limited to a maximum of ${Config.get(
        "poll.max-options"
      )} options.`
    );
  }
  for (let i = 0; i < options.length; i++) {
    if (typeof options[i] !== "string") {
      throw new ValidationError("Poll options must be strings.");
    }
    if (options[i].length === 0 || options[i].length > 255) {
      throw new ValidationError("Poll options must be 1-255 characters long.");
    }
  }
};

CoolholePollModule.prototype.handleNewPoll = function (user, data, ack) {
  if (!this.channel.modules.permissions.canControlPoll(user)) {
    return;
  }

  // Ensure any existing poll is closed
  this.handleClosePoll(user);

  ack = ackOrErrorMsg(ack, user);

  if (typeof data !== "object" || data === null) {
    ack({
      error: {
        message: "Invalid data received for poll creation.",
      },
    });
    return;
  }

  try {
    this.validatePollInput(data.title, data.opts);
  } catch (error) {
    ack({
      error: {
        message: error.message,
      },
    });
    return;
  }

  if (
    data.hasOwnProperty("timeout") &&
    (isNaN(data.timeout) || data.timeout < 1 || data.timeout > 86400)
  ) {
    ack({
      error: {
        message: "Poll timeout must be between 1 and 86400 seconds",
      },
    });
    return;
  }

  var poll = CoolholePoll.create(user.getName(), data.title, data.opts, {
    hideVotes: data.obscured,
    retainVotes: data.gamble ? true : data.retainVotes ?? false,
    gamble: data.gamble ?? false,
  });
  var self = this;
  if (data.hasOwnProperty("timeout") && !data.gamble) {
    poll.timer = setTimeout(function () {
      if (self.poll === poll) {
        self.handleClosePoll({
          getName: function () {
            return "[poll timer]";
          },
          effectiveRank: 255,
        });
      }
    }, data.timeout * 1000);
  }

  this.poll = poll;
  this.dirty = true;
  this.broadcastPoll(true);
  this.channel.logger.log(
    "[poll] " + user.getName() + " opened poll: '" + poll.title + "'"
  );
  ack({});
};

CoolholePollModule.prototype.handleVote = function (user, data) {
  if (!this.channel.modules.permissions.canVote(user)) {
    return;
  }

  if (isNaN(data.wager) || data.wager < 1) {
    user.socket.emit("validationError", {
      target: "#ch-poll-wager-wager",
      message: `Invalid wager amount of "${data.wager}"`,
    });
    return;
  }

  if (data.wager > user.points + 10000) {
    user.socket.emit("validationError", {
      target: "#ch-poll-wager-wager",
      message: `You do not have enough points to wager "${data.wager}"`,
    });
    return;
  }

  if (this.poll) {
    if (
      this.poll.countVote(user.realip, {
        option: data.option,
        wager: data.wager,
        user: user.getName(),
      })
    ) {
      this.dirty = true;
      // FIX: Add back in if we want users to lose points after betting
      // if (this.poll.gamble) {
      //   this.channel.modules.coolholepoints.spend(user, data.wager);
      // }
      this.broadcastPoll(false);
    } else if (this.poll.gamble) {
      // HACK: Assumes that if countVote returned false and the poll is gambling, the user has already voted
      user.socket.emit("errorMsg", {
        msg: "Your neural imprint was already logged for this choice. Optimal or not, your choice is permanently encoded. Proceed with intent.",
      });
    }
  }
};

CoolholePollModule.prototype.handleClosePoll = function (user) {
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
    this.channel.logger.log(
      "[poll] " + user.getName() + " closed the active poll"
    );
    this.poll = null;
    this.dirty = true;
  }
};

CoolholePollModule.prototype.handleChooseWinningPollOption = function (
  user,
  data
) {
  if (!this.channel.modules.permissions.canControlPoll(user)) {
    return;
  }

  if (!this.poll || !this.poll.gamble) {
    return;
  }

  if (typeof data !== "object" || data === null) {
    user.socket.emit("errorMsg", {
      msg: "Invalid data received for poll option selection.",
    });
    return;
  }

  if (
    isNaN(data.option) ||
    data.option < 0 ||
    data.option >= this.poll.choices.length
  ) {
    user.socket.emit("errorMsg", {
      msg: "Invalid poll option selected.",
    });
    return;
  }

  this.poll.winningOption = data.option;
  this.channel.modules.coolholepoints.payoutPoll(this.poll);
  this.channel.broadcastAll("closeGamblePoll", {
    winningOption: this.poll.winningOption,
  });
  this.channel.logger.log(
    "[poll] " + user.getName() + " selected the winning option for the poll"
  );
  this.poll = null;
  this.dirty = true;
};

CoolholePollModule.prototype.handlePollCmd = function (
  obscured,
  user,
  msg,
  _meta
) {
  if (!this.channel.modules.permissions.canControlPoll(user)) {
    return;
  }

  // Ensure any existing poll is closed
  this.handleClosePoll(user);

  const { title, gamble, options } = parsePollMesage(msg);

  try {
    this.validatePollInput(title, options);
  } catch (error) {
    user.socket.emit("errorMsg", {
      msg: "Error creating poll: " + error.message,
    });
    return;
  }

  var poll = CoolholePoll.create(user.getName(), title, options, {
    hideVotes: obscured,
    retainVotes: gamble,
    gamble,
  });
  this.poll = poll;
  this.dirty = true;
  this.broadcastPoll(true);
  this.channel.logger.log(
    "[poll] " + user.getName() + " opened poll: '" + poll.title + "'"
  );
};

module.exports = CoolholePollModule;
