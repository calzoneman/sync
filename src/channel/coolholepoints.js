var ChannelModule = require("./module");
var FilterList = require("cytubefilters");
var LOGGER = require("@calzoneman/jsli")("coolpoints");
var Flags = require("../flags");
import { ActionType } from "./coolholepoints-actions-options";

/**
 * @typedef {Object} ActionResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} message - Optional message detailing the result.
 * @property {ActionStatus} status - Status of the action.
 */
class ActionResult {
  constructor(success, message, status = ActionStatus.UnknownError) {
    this.success = success;
    this.message = message;
    this.status = success ? ActionStatus.Success : status;
  }
}

/**
 * @typedef {Object} ActionStatus
 * @property {string} Success - Indicates the action was successful.
 * @property {string} InsufficentPoints - Indicates the user does not have enough points.
 * @property {string} InvalidAction - Indicates the action is invalid.
 * @property {string} ActionDisabled - Indicates the action is disabled.
 * @property {string} UnknownError - Indicates an unknown error occurred.
 */
const ActionStatus = {
  Success: "success",
  InsufficentPoints: "insufficentPoints",
  InvalidAction: "invalidAction",
  ActionDisabled: "actionDisabled",
  InvalidUser: "invalidUser",
  UnknownError: "unknownError",
};

/**
 * @typedef {Object} ErrorObject
 * @property {Object} userName User information
 * @property {String} callingFunction Function the error was caught in
 * @property {String} returnSocket Event name to emit to
 * @property {String} err Error string
 * @property {Object} data Data related to the error
 * @property {String} userMessage Message to display to the user
 */

/**
 * @typedef {Object} PointData
 * @class PointData
 * @classdesc PointData class
 * @param {String} user user
 * @param {Number} points points
 * @returns {Object} PointData object
 */
class PointData {
  constructor(user, points) {
    this.user = user;
    this.points = points;
  }
}

/**
 * @class ReturnPointData
 * @classdesc ReturnPointData class
 * @param {String} user user
 * @param {Number} points difference in points
 * @param {Number} currentPoints currentPoints
 * @returns {Object} ReturnPointData object
 */
class ReturnPointData {
  constructor(user, points, currentPoints) {
    this.user = user;
    this.points = points;
    this.currentPoints = currentPoints;
  }
}

/**
 * @class ReturnMsg
 * @classdesc ReturnMsg class
 * @param {String} msg message
 * @param {String} userMessage user message
 * @param {Object} data data
 * @returns {Object} ReturnMsg object
 **/
class ReturnMsg {
  constructor(msg, userMessage, data) {
    this.msg = msg;
    this.userMessage = userMessage;
    this.data = data;
  }
}

const ADS = [
  "Checkout RAID: Shadow Legends™, an immersive RPG title with an awesome storyline, awesome 3D graphics, and epic boss fights. Download today! https://apkspark.com/raid-shadow-legends-mod-apk/",
  "This message is brought to you by MapScaped. When manscaping, you gotta use the right tools for the job, and trust me, your balls will thank you. Feel my smooth balls at https://www.manscaped.com/",
  "Wanna know something? Dragon cum is slightly warmer than human cum, and much thicker, too. Imagine filling yourself up. Try Bad Dragon today. https://tinyurl.com/y267avw3",
  "Discover a sugoi world of anime magic! Onii-chan, get ready for a kawaii adventure with Crunchyroll. Watch heartwarming romances to epic battles. Itadakimasu!",
  "联盟戦亡選機稿 Welcome to the TikTok. Dance and sing and see om om om 哈哈. Join TikTok (抖音) now. Create amazing content together (一起创作)! 加油! No Xi.",
  "the movie start with a parody of 2001 monkey being women's playing with baby doll. The appear the barbie. Then you have a 5 minutes song on the Barbie world is perfect and ken is a cuck. 9/10 https://www.cinemark.com/movies/barbie",
  "Coming soon to Disney+, the next weekly MCU movie featuring Tobey Maguire in a wheel chair. After having his Funko Pops stolen, he has to team up with unlikely heros, other Spidermans, to jerk each other off on camera for 2 and half hours.",
  "The sequel to the captivating tale of Fuga: Melodies of Steel has arrived! Enjoy countless hours of anthropromorphic animals massaging eachother's prostates before loading children into a cannon and firing them into 15 tons of steel.",
  "Checkout the new Adult Swim show My Adventures with Superman. God I love tomgirls. I want to lick sweat off of their abs and feel the pressure on my skull as they wrap their thighs tight around my head. I also love men.",
  "BBBYQ: They plan on filing the plan & disclosure statement in the next 24 hours and seek approval at a hearing around August. If you don't buy, you're a fucking moron.",
  "Vagabomb- Exclusive Urbane Indian Women Ironic Contemporary Love Writing/Story, Romance Ideas, Sex Moves, Lovely Beauty Trends, Sex and Relationships, Miraculous Resolution about Dating, Notable Love examples, marry me.",
  "Your phone number has being randomly select for a cash prize of $4,950,000 in our 2016 PROMOTIONS/PRISE AWARD. Email your details to forgotmycockli@protonmail.com",
  "Want to quit gaming, but don't know how? Sick of feeling like you're wasting your potential? Ready to break out of this vicious cycle? Getting so bad you wrote a suicide note? Join https://gamequitters.com",
  "Want a break from the ads? Watch this short video and get 30 minutes of ad free messages https://youtu.be/m4QO5jyEw2E?t=3",
  "Smnart like girlfriend 360° constant temperature twice the efficency shaft rub pocketed device",
  `I am Paizuri-chan, a girl with the biggest anime titties known to man! ( • )( • )ԅ(≖‿≖ԅ). I may look innocent, but don't be fooled, I can get as dirty as an uncesored hentai! ( ͡° ͜ʖ ͡°) Find me on https://boards.4channel.org/g/`,
  "I sell a personalize match finding experience exclusively targeting kissless virgins. To get people to kiss, we sent them an e-mail to visit our website and pick a match. Once did, had fully customised they kiss. http://kiss.me/",
  "I have a buisness that specalizes in customize satchel making. Give me a way to sell it to you. I would like to do that.",
  "COOL FRIEND | GNCDE '''Satirical''' Alt-Right Indie-Rock https://youtu.be/hc801HuELUc",
  "ummm, uhhh, guys I can't hold it in anymore i- GRRRRRRRRRRR WOOF WOOF BARK BARK ARF BARK GRRRR WOOF SNARL HSSSS GRRRR WOOF WOOF BARK ARF GRRRR HSSSS WOOF WOOF BARK ARF GRRRRR HSSSSS BARK ARF GRRRR https://furrycons.com/calendar/",
  "GrubHub perks give you deals on the food you love. The kind of deals that make you boogie. Get the food you love, with perks from GrubHub! Grub what you love!",
  "Hello, friend! I'm the Nicotine Monster, here to share my tragic tale. I once thrived in a garden, part of the ‘PESTICIDE’ team, defending fruits and veggies from pests—a noble life! But disaster struck when doctors visited the Human, leaving behind a gift box. Inside, I saw my kin twisted into unnatural forms—cigarettes, cigars, gums, patches, vape liquids… Horror! NicotineMonster.com or www.gd.games/misha_cao/nicotine-monster",
  "Struggling with internet porn addiction? There's hope! Seek God's help through prayer, scripture, and accountability. Use practical tools like Covenant Eyes & X3watch. Overcoming is possible with God's strength. Learn more: https://www.gotquestions.org/overcome-internet-porn.html.",
];

const randomLettersRegex = () => {
  const randomLetters = "abcdefghijklmnopqrstuvwxyz"
    .split("")
    .sort(() => 0.5 - Math.random())
    .slice(0, 5);
  return `(${randomLetters.join("|")})`;
};
const makePointsFilter = (name, source, flags, replace) => ({
  name: name,
  source: source,
  flags: flags,
  replace: replace,
  active: true,
  filterlinks: false,
});

const STUTTER_FILTER = makePointsFilter(
  "debt level 0",
  "(^| )([Cc]|[Gg]|[Tt][Hh]|[Ss]|[Hh]|[Ii]|[Qq][Uu]|[Ff]|[Pp]|[Ww]|[Nn]|[Ll]|[Ss][Hh])([aeiou]+?)",
  "gi",
  "\\1\\2-\\2-\\2-\\2-\\2-\\3"
);
const LISP_FILTER = makePointsFilter(
  "debt level 1",
  "(ss|sh|ch|s|z|c|x)",
  "gi",
  "th"
);
const MISSING_LETTERS_FILTER = makePointsFilter(
  "debt level 4",
  "([a-z])", // To be replaced when applied
  "gi",
  ""
);

/**
 * Coolpoints controls CRUD operations for users' coolpoints
 * @param {Object} _channel
 */
class Coolpoints extends ChannelModule {
  constructor(_channel) {
    super(_channel);

    ChannelModule.apply(this, arguments);

    this.supportsDirtyCheck = true;
    this.userActiveIntervalIds = {};
    this.coolpoints = [];
  }

  /**
   * Checks if a user is eligible to use coolpoints
   * @param {String} userName user name
   * @returns {Boolean} if user is eligible for points
   */
  isUserEligibleForPoints(userName) {
    const coolpointUserObj = this.coolpoints.find((cp) => cp.user === userName);
    if (!coolpointUserObj) {
      LOGGER.error(
        `${userName || "(anonymous)"} was not found in coolpoints user list.`);
      return false;
    }
    if (typeof coolpointUserObj.points !== "number") {
      LOGGER.error(
        `${userName} doesn't have a number for points. Here's their entry: ${JSON.stringify(
          coolpointUserObj
        )}`
      );
      return false;
    }

    const user = this.channel.users.find((x) => x.account.name === userName);
    if (user) {
      if (!user.channel.is(Flags.C_REGISTERED)) {
        LOGGER.error(`Channel is not registered.`);
        return false;
      }
      if (!user.is(Flags.U_REGISTERED)) {
        LOGGER.error(`${userName} is not registered.`);
        return false;
      }
    }

    return true; // HACK: If the user isn't in the channel, assume they're eligible
  }

  /**
   * Post join hook
   * @param {Object} user user object
   */
  onUserPostJoin(user) {
    if (!user.channel.is(Flags.C_REGISTERED)) return;

    user.socket.on(
      "applyPointsToUser",
      this.handleApplyPointsToUser.bind(this, user)
    );

    this.channel.modules.chat.registerCommand(
      "/secretary",
      this.handleChatCommand.bind(this, "secretary")
    );

    this.channel.modules.chat.registerCommand(
      "/highlight",
      this.handleChatCommand.bind(this, "highlight")
    );

    this.channel.modules.chat.registerCommand(
      "/danmu",
      this.handleChatCommand.bind(this, "danmu")
    );

    this.init(user);
    this.handleActive(user);
  }

  onUserPart(user) {
    this.cleanUpActive(user);
  }

  /**
   * Generic Log Error wrapper
   * @param {ErrorObject} errorObject Error information
   */
  logError(errorObject) {
    const { userName, callingFunction, data, errMsg, errStack, returnSocket, userMessage } = errorObject;

    if (errStack) {
      LOGGER.error(`Exception caught in ${callingFunction}: ${errMsg}. Data: ${JSON.stringify(data ? data : {})}.\nStack: ${errStack}`);
    } else {
      LOGGER.error(`Error in ${callingFunction}: ${errMsg}. Data: ${JSON.stringify(data ? data : {})}`);
    }
    this.channel.logger.log(`[coolpoints] Error in ${callingFunction}: ${errMsg}. Data: ${JSON.stringify(data ? data : {})}`);
    
    const user = this.channel.users.find((x) => x.account.name === userName);
    if (user && returnSocket)
      // Return an empty array of point data... for now probably
      user.socket.emit(returnSocket, new ReturnMsg("error", userMessage, []));
  }

  /**
   * Load CoolPoints
   * @param {PointData} data CoolPoints class
   */
  load(data) {
    if ("coolpoints" in data) {
      this.coolpoints = data.coolpoints;
      this.dirty = false;
    } else {
      //otherwise, create an empty array
      this.coolpoints = [];

      //set dirty flag so bgtask will save it
      this.dirty = true;
    }
  }

  /**
   * Saves coolpoints to channel data
   * @param {Object} data channel object
   */
  save(data) {
    data.coolpoints = this.coolpoints;
  }

  /**
   * Get coolpoints for a user
   * @param {String} user User object
   * @returns {PointData} User's coolpoints object
   */
  get(name) {
    return this.coolpoints.find((cp) => cp.user === name);
  }

  /**
   * Exists check for a user's coolpoints
   * @param {String} name User's name
   * @returns {Boolean} if user exists
   */
  exists(name) {
    return this.coolpoints.some((cp) => cp.user === name);
  }

  /**
   * Set coolpoints for a user
   * @param {String} name User's name
   * @param {Number} points User's coolpoints
   */
  set(name, points) {
    const cp = this.get(name);
    if (cp) {
      cp.points = points;
    } else {
      this.coolpoints.push(new PointData(name, points));
    }
    this.dirty = true;
  }

  /**
   * Initialize coolpoints for a user
   * @param {Object} user User object
   * @emits coolpointsInitResponse
   */
  init(user) {
    if (
      user &&
      user.channel.is(Flags.C_REGISTERED) &&
      user.is(Flags.U_REGISTERED) &&
      (!this.exists(user.getName()) ||
        // Something has gone terribly wrong and hopefully we logged it
        typeof this.get(user.getName()).points !== "number")
    ) {
      this.set(user.getName(), 0);
    }

    user.socket.emit(
      "coolpointsInitResponse",
      new ReturnMsg("success", "Here's everyones' points", this.coolpoints)
    );
  }

  /**
   * Add coolpoints for a user
   * @param {String} name User's name
   * @param {Number} points User's coolpoints
   */
  add(name, points) {
    const curPoints = this.get(name).points;
    this.set(name, Math.round(curPoints + points));
    this.dirty = true;
  }

  /**
   * Subtract coolpoints for a user
   * @param {String} name User's name
   * @param {Number} points User's coolpoints
   */
  subtract(name, points) {
    this.set(name, Math.round(this.get(name).points - points));
    this.dirty = true;
  }

  /**
   * @summary Quick check to see if a given user is mod or below and return and error if they are
   * @param {Object} user user object
   * @param {String} socketName call back socket
   * @returns {Boolean} if they can update points or not
   */
  canUpdateOthersPoints = function (user, socketName) {
    if (user.account.effectiveRank <= 2) {
      this.logError({
        userName: user.getName(),
        callingFunction: "canUpdateOthersPoints",
        returnSocket: socketName,
        errMsg: `User's rank does not allow ${user.getName() || "(anonymous)"} update other's points`,
        errStack: null,
        data: user.account.effectiveRank,
        userMessage:
          "Error: Your rank does not allow you update other's points",
      });
      return false;
    }

    return true;
  };

  /**
   * @summary Applies a coolpoint change to a user
   * @param {Object} user user object
   * @param {Object} data data object
   * @param {String} data.targetName target username
   * @param {Number} data.points points to add or subtract (if negative)
   */
  handleApplyPointsToUser(user, data) {
    try {
      if (!this.isUserEligibleForPoints(user.getName())) {
        this.logError({
          userName: user.getName(),
          callingFunction: "applyPointsToUser",
          returnSocket: "coolpointsFailure",
          errMsg: `User is not registered or has something wrong with their account`,
          errStack: null,
          data: userName || "(anonymous)",
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return;
      }

      const { targetName, points } = data;
      if (!this.canUpdateOthersPoints(user, "applyPointsToUser")) return;

      const target = this.get(targetName);
      if (!target) {
        this.logError({
          userName: user.getName(),
          callingFunction: "applyPointsToUser",
          returnSocket: "coolpointsFailure",
          errMsg: `User ${targetName || "(anonymous)"} not found to apply points to`,
          errStack: null,
          data: targetName || "(anonymous)",
          userMessage: `Error: User ${targetName || "(anonymous)"} not found to apply points to`,
        });
        return;
      }

      this.add(targetName, points);

      const currTargetPoints = this.get(targetName).points;

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `${user.getName()} applied ${points} to user ${targetName}`,
          `Powers that be applied ${points} to user ${targetName}`,
          new ReturnPointData(targetName, points, currTargetPoints)
        )
      );

      this.channel.logger.log(
        `${user.getName()} applied ${points} to user ${targetName}`
      );
    } catch (err) {
      this.logError({
        userName: user.getName(),
        callingFunction: "applyPointsToUser",
        returnSocket: "coolpointsFailure",
        errMsg: err,
        errStack: err.stack,
        data: { user: data.targetName || "(anonymous)", points: data.points },
        userMessage: `Error: Unable to apply points to user ${data.targetName || "(anonymous)"}. Let the head monkey in charge know`,
      });
    }
  }
  /**
   * @summary Handles when a user clicks the skip button.
   * @param {Object} user user object
   * @returns {Boolean} true = skip is allowed to go through. false = skip is not allowed to go through.
   * NOTE: If the cp option for skipping is disabled or an error occurs, the skip should still be allowed to occur.
   */
  handleSkipping(user) {
    try {
      const spendResult = this.spend(user.getName(), "skip");

      if (!spendResult.success) {
        switch (spendResult.status) {
          case ActionStatus.InsufficentPoints:
            user.socket.emit("coolpointsVoteskipFail"); // this re-enables the skip button
            return false; // don't let a user use skip if they're broke
          case ActionStatus.InvalidAction:
          case ActionStatus.ActionDisabled:
          case ActionStatus.InvalidUser:
          case ActionStatus.UnknownError:
          default:
            return true; // if it fails for any other reason (or passes) allow skip to work as intended
        }
      }
      return true;
    } catch (err) {
      this.logError({
        userName: user.getName(),
        callingFunction: "handleSkipping",
        returnSocket: "coolpointsFailure",
        errMsg: err,
        errStack: err.stack,
        data: { user: user.getName() || "(anonymous)" },
        userMessage: `Error: Unable to spend points. Let the head monkey in charge know`,
      });
      return true;
    }
  }

  /**
   * @summary Handles when a user's video is skipped.
   * @param {Object} queueby username for submitted video.
   */
  handleSkipped(queueby) {
    try {
      this.lose(queueby, "skipped");
    } catch (err) {
      this.logError({
        userName: null,
        callingFunction: "handleSkipped",
        returnSocket: "coolpointsFailure",
        errMsg: err,
        errStack: err.stack,
        data: { user: queueby || "(anonymous)" },
        userMessage: `Error: Unable to lose points from video being skipped. Let the head monkey in charge know`,
      });
    }
  }

  /**
   * @summary Validates an action for a user
   * @param {String} userName user
   * @param {String} action action to validate
   * @param {String} expectedActionType expected action type
   * @param {String} callingFunction calling function
   * @returns {Boolean} if the action is valid
   */
  isValidAction(userName, action, expectedActionType, callingFunction) {
    const pointData = this.get(userName);
    if (!pointData) {
      this.logError({
        userName: userName,
        callingFunction,
        returnSocket: "coolpointsFailure",
        errMsg: `User ${userName || "(anonymous)"} not found for point ${action}`,
        errStack: null,
        data: { user: userName || "(anonymous)", action },
        userMessage: `Error: You were not found eligible for CP... Good luck with that`,
      });
      return new ActionResult(
        false,
        "User not found in coolpoints object",
        ActionStatus.InvalidUser
      );
    }

    const actionData = this.channel.modules.coolholeactionspoints.get(action);
    if (actionData.actionType !== expectedActionType) {
      this.logError({
        userName: userName,
        callingFunction,
        returnSocket: "coolpointsFailure",
        errMsg: `Action ${action} is not an ${expectedActionType}`,
        errStack: null,
        data: { user: userName || "(anonymous)", action },
        userMessage: `Error: This disturbance was felt. Your action was recorded.`,
      });
      return new ActionResult(
        false,
        "Action is not the expected type",
        ActionStatus.InvalidAction
      );
    }

    if (
      actionData.options.find((opt) => opt.optionName === "enabled")
        .optionValue === false
    ) {
        if (action !== "active")
        // "Active" still runs even if it's inactive; no need to log
        this.logError({
          username: userName,
          callingFunction,
          returnSocket: "coolpointsFailure",
          err: `Action ${action} is not enabled`,
          data: { user: userName, action },
          userMessage: `Error: Action ${action} has been deemed too powerful. It's been disabled for now.`,
        });
      return new ActionResult(
        false,
        "Action is not enabled",
        ActionStatus.ActionDisabled
      );
    }

    switch (expectedActionType) {
      case ActionType.Expenditures:
        if (
          pointData.points <
          actionData.options.find((opt) => opt.optionName === "points")
            .optionValue
        ) {
          this.logError({
            userName: userName,
            callingFunction,
            returnSocket: "coolpointsFailure",
            errMsg: `User ${userName || "(anonymous)"} does not have enough points to spend on ${action}`,
            errStack: null,
            data: { user: userName || "(anonymous)", action },
            userMessage: `Error: You have not done enough for society to earn ${action}`,
          });
          return new ActionResult(
            false,
            "User does not have enough points",
            ActionStatus.InsufficentPoints
          );
        }
        break;
      case ActionType.Statuses:
        if (
          pointData.points <=
          actionData.options.find((opt) => opt.optionName === "points")
            .optionValue
        ) {
          return new ActionResult(true, "Success", ActionStatus.Success);
        }
        return new ActionResult(
          false,
          "User has too many points :)",
          ActionStatus.InsufficentPoints
        );
      case ActionType.Losses:
      case ActionType.Earnings:
        break;
    }

    return new ActionResult(true, "Success", ActionStatus.Success);
  }

  /**
   * @summary Spend coolpoints
   * @param {Object} userName user object
   * @param {String} action action to spend points on
   * @return {ActionResult} The result of the operation.
   */
  spend(userName, action) {
    try {
      if (!this.isUserEligibleForPoints(userName)) {
        this.logError({
          userName: userName,
          callingFunction: "spend",
          returnSocket: "coolpointsFailure",
          errMsg: `User ${userName || "(anonymous)"} is not registered or has something wrong with their account`,
          errStack: null,
          data: userName || "(anonymous)",
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return new ActionResult(
          false,
          "User is not registered or has something wrong with their account",
          ActionStatus.InvalidUser
        );
      }

      const actionStatus = this.isValidAction(
        userName,
        action,
        ActionType.Expenditures,
        "spend"
      );
      if (!actionStatus.success) return actionStatus;

      const actionData = this.channel.modules.coolholeactionspoints.get(action);
      const pointsToSpend = actionData.options.find(
        (opt) => opt.optionName === "points"
      ).optionValue;

      this.subtract(userName, pointsToSpend);

      this.channel.logger.log(
        `User ${userName} spent ${
          actionData.options.find((opt) => opt.optionName === "points")
            ?.optionValue
        } points on ${action}`
      );

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `User ${userName} spent ${pointsToSpend} points on ${action}`,
          `Wise spender ${userName} spent ${pointsToSpend} points on ${action}`,
          new ReturnPointData(
            userName,
            -pointsToSpend,
            this.get(userName).points
          )
        )
      );
      return new ActionResult(true, "User spent points successfully");
    } catch (err) {
      this.logError({
        userName: userName,
        callingFunction: "spend",
        returnSocket: "coolpointsFailure",
        errMsg: err,
        errStack: err.stack,
        data: userName || "(anonymous)",
        userMessage: `Error: Unable to spend points. Let the head monkey in charge know`,
      });
      return new ActionResult(false, "Unable to spend points. Unknown error");
    }
  }

  /**
   * @summary Earn coolpoints
   * @param {String} userName user name
   * @param {String} action action was rewarded for
   * @return {ActionResult} The result of the operation
   */
  earn(userName, action) {
    try {
      if (!this.isUserEligibleForPoints(userName)) {
        this.logError({
          userName: userName,
          callingFunction: "earn",
          returnSocket: "coolpointsFailure",
          errMsg: `User ${userName || "(anonymous)"} is not registered or has something wrong with their account`,
          errStack: null,
          data: userName || "(anonymous)",
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return new ActionResult(
          false,
          "User is not registered or has something wrong with their account",
          ActionStatus.InvalidUser
        );
      }

      const actionStatus = this.isValidAction(
        userName,
        action,
        ActionType.Earnings,
        "earn"
      );
      if (!actionStatus.success) return actionStatus;

      const actionData = this.channel.modules.coolholeactionspoints.get(action);
      const pointsToEarn = actionData.options.find(
        (opt) => opt.optionName === "points"
      ).optionValue;

      this.add(userName, pointsToEarn);

      this.channel.logger.log(
        `User ${userName} was awarded ${pointsToEarn} points for ${action}`
      );

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `User ${userName} was awarded ${pointsToEarn} points for ${action}`,
          `${userName} was awarded ${pointsToEarn} points for ${action}`,
          new ReturnPointData(userName, pointsToEarn, this.get(userName).points)
        )
      );
      return new ActionResult(true, "User earned points successfully");
    } catch (err) {
      this.logError({
        userName: userName,
        callingFunction: "earn",
        returnSocket: "coolpointsFailure",
        errMsg: err,
        errStack: err.stack,
        data: userName || "(anonymous)",
        userMessage: `Error: Unable to award points. Let the head monkey in charge know`,
      });
      return new ActionResult(false, "Unable to earn points. Unknown error");
    }
  }

  /**
   * @summary Lose coolpoints and allows users to go negative
   * @param {String} userName user string
   * @param {String} action action was penalized for
   * @return {Object} object with success or failure and message
   */
  lose(userName, action) {
    try {
      if (!this.isUserEligibleForPoints(userName)) {
        this.logError({
          userName: userName,
          callingFunction: "lose",
          returnSocket: "coolpointsFailure",
          errMsg: `User ${userName || "(anonymous)"} is not registered or has something wrong with their account`,
          errStack: null,
          data: userName || "(anonymous)",
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return new ActionResult(
          false,
          "User is not registered or has something wrong with their account",
          ActionStatus.InvalidUser
        );
      }

      const actionStatus = this.isValidAction(
        userName,
        action,
        ActionType.Losses,
        "lose"
      );
      if (!actionStatus.success) return actionStatus;

      const actionData = this.channel.modules.coolholeactionspoints.get(action);
      const pointsToLose = actionData.options.find(
        (opt) => opt.optionName === "points"
      ).optionValue;

      this.subtract(userName, pointsToLose);

      this.channel.logger.log(
        `User ${userName} lost ${pointsToLose} points for ${action}`
      );

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `User ${userName} lost ${pointsToLose} points for ${action}`,
          `${userName} lost ${pointsToLose} points for ${action}`,
          new ReturnPointData(
            userName,
            -pointsToLose,
            this.get(userName).points
          )
        )
      );

      return new ActionResult(true, "User lost points successfully");
    } catch (err) {
      this.logError({
        userName: userName,
        callingFunction: "lose",
        returnSocket: "coolpointsFailure",
        errMsg: err,
        errStack: err.stack,
        data: userName || "(anonymous)",
        userMessage: `Error: Unable to lose points. Let the head monkey in charge know`,
      });

      return new ActionResult(false, "Unable to lose points. Unknown error");
    }
  }

  /**
   * @summary Payout a poll for each user
   * @param {Object} poll poll object
   */
  payoutPoll(poll) {
    const winningOption = poll.winningOption;
    const totalWagers = Array.from(poll.votes.values()).reduce(
      (acc, vote) => acc + vote.wager,
      0
    );
    for (const [_, choice] of poll.votes) {
      try {
        const { user: userName, option, wager } = choice;
        if (!this.isUserEligibleForPoints(userName)) {
          this.logError({
            userName: userName,
            callingFunction: "payoutPoll",
            returnSocket: "coolpointsFailure",
            errMsg: `User ${userName || "(anonymous)"} is not registered`,
            errStack: null,
            data: userName || "(anonymous)",
            userMessage: `Error: You must join cause if you wish to participate.`,
          });
          return new ActionResult(
            false,
            "User is not registered",
            ActionStatus.InvalidUser
          );
        }

        if (option !== winningOption) {
          this.subtract(userName, wager);
          this.channel.logger.log(
            `User ${userName} lost ${wager} points while betting on poll "${poll.title}"`
          );
          this.channel.broadcastAll(
            "updateCoolPointsResponse",
            new ReturnMsg(
              `User ${userName} lost ${wager} points for betting on the wrong poll option`,
              `${userName} lost ${wager} points for betting on the wrong poll option`,
              new ReturnPointData(userName, -wager, this.get(userName).points)
            )
          );
        } else {
          const totalWagersOfWinners = Array.from(poll.votes.values()).reduce(
            (acc, vote) =>
              vote.option === winningOption ? acc + vote.wager : acc,
            0
          );
          const shareOfThePot =
            Math.round(wager / totalWagersOfWinners) * totalWagers;
          this.add(userName, shareOfThePot);
          this.channel.logger.log(
            `User ${userName} earned ${shareOfThePot} points while betting on poll "${poll.title}"`
          );
          this.channel.broadcastAll(
            "updateCoolPointsResponse",
            new ReturnMsg(
              `User ${userName} earned ${shareOfThePot} points for betting on the winning poll option`,
              `${userName} earned ${shareOfThePot} points for betting on the winning poll option`,
              new ReturnPointData(
                userName,
                shareOfThePot,
                this.get(userName).points
              )
            )
          );
        }
      } catch (err) {
        this.logError({
          userName: null,
          callingFunction: "gamble",
          returnSocket: "coolpointsFailure",
          errMsg: err,
          errStack: err.stack,
          data: choice,
          userMessage: `Error: Unable to payout poll points. Let the head monkey in charge know`,
        });
        // Don't stop the loop; pay everyone out
        // return new ActionResult(
        //   false,
        //   "Unable to payout points. Unknown error",
        //   ActionStatus.UnknownError
        // );
      }
    }
    return new ActionResult(true, "Poll points paid out successfully");
  }

  /**
   * @summary Check what statuses should be applied for a user
   * @param {Object} userName username
   * @returns {Array} statuses to apply
   */
  checkStatuses(userName) {
    const statuses = [];
    this.channel.modules.coolholeactionspoints.coolpointsActions
      .filter((action) => action.actionType === ActionType.Statuses)
      .forEach((action) => {
        const actionStatus = this.isValidAction(
          userName,
          action.name,
          ActionType.Statuses,
          "checkStatuses"
        );
        if (actionStatus.success) statuses.push(action);
      });

    return statuses;
  }

  /**
   * @summary Applies statuses to a user's message
   * @param {Object} user user object
   * @param {Object} chatObj chat message object
   * @returns {Object} chat message object with statuses applied
   */
  handleChatStatuses(user, chatObj) {
    try {
      if (!this.isUserEligibleForPoints(user.getName())) {
        this.logError({
          userName: user.getName(),
          callingFunction: "handleChatStatuses",
          returnSocket: "coolpointsFailure",
          errMsg: `User ${user.getName() || "(anonymous)"} is not registered or logged in`,
          errStack: null,
          data: user.getName() || "(anonymous)",
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return;
      }

      const statuses = this.checkStatuses(user.getName());
      let res = JSON.parse(JSON.stringify(chatObj));
      let filters = [];
      let attemptToApplyAd = false;

      statuses.forEach((status) => {
        switch (status.name) {
          case "debtlvl0":
            filters.push(STUTTER_FILTER);
            break;
          case "debtlvl1":
            filters.push(LISP_FILTER);
            break;
          case "debtlvl2":
            attemptToApplyAd = true;
            break;
          case "debtlvl3":
            res.meta.coolholeMeta.otherClasses.push("shrink");
            break;
          case "debtlvl4":
            MISSING_LETTERS_FILTER.source = randomLettersRegex();
            filters.push(MISSING_LETTERS_FILTER);
            break;
          case "debtlvl5":
            res.meta.coolholeMeta.otherClasses.push("criticality-accident");
            break;
          default:
            break;
        }
      });

      // Apply filters first to message
      if (filters.length !== 0) {
        const statusFilterList = new FilterList(filters);
        res.msg = statusFilterList.filter(chatObj.msg);
      }

      // Then apply ad if needed
      if (attemptToApplyAd) {
        res.msg = this.maybeAppendAdToChat(res.msg);
      }

      return res;
    } catch (err) {
      this.logError({
        userName: user.getName(),
        callingFunction: "handleChatStatuses",
        returnSocket: "coolpointsFailure",
        errMsg: err,
        errStack: err.stack,
        data: user.getName() || "(anonymous)",
        userMessage: `Error: Unable to apply statuses. Let the head monkey in charge know`,
      });
    }
  }

  /**
   * Flips a coin and maybe appends an ad to a chat message
   * @param {String} msg chat message
   * @returns new chat message
   */
  maybeAppendAdToChat(msg) {
    // ~50% odds.. Maybe make this configurable
    const randomIndex = Math.floor(Math.random() * (ADS.length * 2));
    const shouldReplaceMessageWithAd = randomIndex < ADS.length;
    let resMsg = msg;

    if (shouldReplaceMessageWithAd) {
      const chosenAd = ADS[randomIndex];
      // 400 character limit - 2 for '- ' so just remove as much as we need
      const howMuchTextToRemove = Math.max(
        chosenAd.length + msg.length - 398,
        msg.length
      );
      resMsg = `${msg.substring(0, howMuchTextToRemove)}- ${chosenAd}`;
    }

    return resMsg;
  }

  /**
   * Handles the active earning action for logged in users. Runs on an interval and writes the interval userActiveIntervalIds keyed by the user's name + channel
   * @param {Object} user user object
   */
  handleActive(user) {
    if (!user.is(Flags.U_REGISTERED) || !user.is(Flags.U_LOGGED_IN)) {
      this.channel.logger.log(
        `Guest is not eligible for points. Skipping active check`
      );
      return;
    }
    // If the channel is dead or malformed, consider the user that joined in a bad state and hopefully this will be called again later
    if (
      !this.channel?.modules?.coolholeactionspoints ||
      (this.channel?.dead ?? false)
    ) {
      LOGGER.error(
        `Channel or channel modules are missing on init. Stopping for ${user.getName()}`
      );
      this.cleanUpActive(user);
    }

    const activeActionData =
      this.channel.modules.coolholeactionspoints.get("active");
    // Multiply by 1000 to convert to milliseconds
    const activeInterval =
      activeActionData.options.find((opt) => opt.optionName === "interval")
        .optionValue * 1000;
    this.userActiveIntervalIds[user.getName()] = setInterval(() => {
      // If the channel is dead or malformed, consider this interval dead
      if (
        !this.channel?.modules?.coolholeactionspoints ||
        (this.channel?.dead ?? false)
      ) {
        LOGGER.error(
          `Channel or channel modules are missing. Clearing interval for ${user.getName()}`
        );
        this.cleanUpActive(user);
        return;
      }

      // Has the interval changed? If so, clear and restart
      const curInterval =
        this.channel.modules.coolholeactionspoints
          .get("active")
          .options.find((opt) => opt.optionName === "interval").optionValue *
        1000;
      if (curInterval !== activeInterval) {
        this.channel.logger.log(
          `Interval has changed. Clearing interval and restarting for ${user.getName()}`
        );

        clearInterval(this.userActiveIntervalIds[user.getName()]);
        this.handleActive(user);
        return;
      }

      // Check if the action is still valid/active. If not, just return since I don't wanna build a hook to start this up again when it's turned on
      const actionStatus = this.isValidAction(
        user.getName(),
        "active",
        ActionType.Earnings,
        "active"
      );
      if (!actionStatus.success) return;

      if (user.is(Flags.U_AFK)) return;

      this.earn(user.getName(), "active");
    }, activeInterval);
  }

  /**
   * Clears interval and removes from userActiveIntervalIds
   * @param {Object} user user object
   */
  cleanUpActive(user) {
    this.channel.logger.log(`Clearing active interval for ${user.getName()}`);
    clearInterval(this.userActiveIntervalIds[user.getName()]);
    delete this.userActiveIntervalIds[user.getName()];
  }

  /**
   * Generic chat handler for coolpoints commands
   * @param {String} command command to handle
   * @param {Object} user user object
   * @param {String} msg message
   * @param {Object} meta meta object
   * @returns {void} nothing
   */
  handleChatCommand(command, user, msg, meta) {
    meta.coolholeMeta = meta.coolholeMeta || {};
    meta.coolholeMeta.otherClasses = meta.coolholeMeta.otherClasses || [];
    if (!user.channel.is(Flags.C_REGISTERED) && !user.is(Flags.U_REGISTERED)) {
      this.logError({
        userName: user.getName(),
        callingFunction: "handleChatCommand",
        returnSocket: "coolpointsFailure",
        errMsg: `User ${user.getName() || "(anonymous)"} is not registered or logged in`,
        errStack: null,
        data: user.getName() || "(anonymous)",
        userMessage: `Error: You must join cause if you wish to participate.`,
      });
      return new ActionResult(
        false,
        "User is not registered or has something wrong with their account"
      );
    }
    const msgWithoutCmd = msg.split(" ").slice(1).join(" ");

    if (!this.spend(user.getName(), command).success)
      return new ActionResult(false, `Unable to spend for ${command}`);

    switch (command) {
      case "secretary": {
        meta.coolholeMeta.otherClasses.push("secretary");
        this.channel.modules.chat.processChatMsg(user, {
          msg: msgWithoutCmd,
          meta,
        });
        break;
      }
      case "highlight": {
        meta.coolholeMeta.otherClasses.push("highlight");
        this.channel.modules.chat.processChatMsg(user, {
          msg: msgWithoutCmd,
          meta,
        });
        break;
      }
      case "danmu": {
        meta.coolholeMeta.otherClasses.push("danmu");
        this.channel.modules.chat.processChatMsg(user, {
          msg: msgWithoutCmd,
          meta,
        });
        break;
      }
      default: {
        this.logError({
          userName: user.getName(),
          callingFunction: "handleChatCommand",
          returnSocket: "coolpointsFailure",
          errMsg: `Command ${command} not found`,
          errStack: null,
          data: command,
          userMessage: `Error: Command ${command} not found`,
        });
        return new ActionResult(false, "Command not found");
      }
    }
  }
}

module.exports = Coolpoints;
