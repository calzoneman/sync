var ChannelModule = require("./module");
var FilterList = require("cytubefilters");
var LOGGER = require("@calzoneman/jsli")("coolpoints");
var Flags = require("../flags");
import { ActionType } from "./coolholepoints-actions-options";

/**
 * @typedef {Object} ActionResult
 * @property {boolean} success - Indicates if the operation was successful.
 * @property {string} message - Optional message detailing the result.
 */
class ActionResult {
  constructor(success, message) {
    this.success = success;
    this.message = message;
  }
}

/**
 * @typedef {Object} ErrorObject
 * @property {Object} user User information
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
   * @param {Object} user user object
   * @returns {Boolean} if user is eligible for points
   */
  isUserEligibleForPoints(user) {
    return (
      user.channel.is(Flags.C_REGISTERED) &&
      user.is(Flags.U_REGISTERED) &&
      user.is(Flags.U_LOGGED_IN)
    );
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
    const { user, callingFunction, data, returnSocket, userMessage } =
      errorObject;
    LOGGER.error(
      `Exception caught in ${callingFunction} for CoolPoints. Here's hopefully relevant data: ${JSON.stringify(
        data ? data : {}
      )} Error:  ${errorObject.err} \n Stack: ${errorObject.err.stack}`
    );
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
      this.isUserEligibleForPoints(user) &&
      user.getName() &&
      !this.exists(user.getName())
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
    const curPoints = this.get(name)?.points ?? 0;
    this.set(name, curPoints + points);
    this.dirty = true;
  }

  /**
   * Subtract coolpoints for a user
   * @param {String} name User's name
   * @param {Number} points User's coolpoints
   */
  subtract(name, points) {
    this.set(name, (this.get(name)?.points ?? 0) - points);
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
        user,
        callingFunction: "canUpdateOthersPoints",
        returnSocket: socketName,
        err: `User's rank does not allow ${user.getName()} update other's points`,
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
      if (!this.isUserEligibleForPoints(user)) {
        this.logError({
          user,
          callingFunction: "applyPointsToUser",
          returnSocket: "coolpointsFailure",
          err: `User is not registered or logged in`,
          data: user,
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return;
      }

      const { targetName, points } = data;
      if (!this.canUpdateOthersPoints(user, "applyPointsToUser")) return;

      const target = this.get(targetName);
      if (!target) {
        this.logError({
          user,
          callingFunction: "applyPointsToUser",
          returnSocket: "coolpointsFailure",
          err: `User ${targetName} not found to apply points to`,
          data: targetName,
          userMessage: `Error: User ${targetName} not found to apply points to`,
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

      LOGGER.info(`${user.getName()} applied ${points} to user ${targetName}`);
    } catch (err) {
      this.logError({
        user,
        callingFunction: "applyPointsToUser",
        returnSocket: "coolpointsFailure",
        err,
        data: { user: data.targetName, points: data.points },
        userMessage: `Error: Unable to apply points to user ${data.targetName}. Let the head monkey in charge know`,
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
      // If the cp option is disabled, just exit early (allow the skip to proceed)
      if (
        !this.channel.modules.coolholeactionspoints
          .get("skip")
          .options.find((opt) => opt.optionName === "enabled").optionValue
      )
        return true;

      if (this.spend(user, "skip").success) {
        return true;
      } else {
        user.socket.emit("coolpointsVoteskipFail"); // this re-enables the skip button
        return false;
      }
    } catch (err) {
      this.logError({
        user,
        callingFunction: "handleSkipping",
        returnSocket: "coolpointsFailure",
        err,
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

  /* 2025-01-29 Miles - HACK: Alot of this is duplicate code from `lose` and `isValidAction`.
   * This function uses the "Losses" in point options. Losses are a bit different than the Earnings,
   * Expenditures, and Statuses in that the user MAY NOT be present when the losses occur. In this particular
   * context, the user MAY NOT be present when his video is skipped. Most of the existing architecture at this time
   * is built around assuming the user IS present when the Earning, Expenditure, and Status occurs.
   * Streeeggs was saying we might rearchitect the Earnings, Expenditures, and Statuses to also handle when the
   * user is currently not present. So, currently this function just gets it done; it and others may be rewritten in the future.
   */
  handleSkipped(queueby) {
    let user = this.channel.users.find((x) => x.account.name === queueby);
    const action = "skipped";
    const callingFunction = "handleSkipped";

    try {
      // 1) check if channel is registered
      this.channel.is(Flags.C_REGISTERED);

      // 2) is action valid
      const pointData = this.get(queueby);
      if (!pointData) {
        this.logError({
          user,
          callingFunction,
          returnSocket: "coolpointsFailure",
          err: `User ${queueby} not found for point ${action}`,
          data: { user: queueby, action },
          userMessage: `Error: Your video was skipped, but you're not a registered user. No point loss for now...`,
        });
        return;
      }

      const actionData = this.channel.modules.coolholeactionspoints.get(action);
      if (!actionData) {
        this.logError({
          user,
          callingFunction,
          returnSocket: "coolpointsFailure",
          err: `Action ${action} does not exist.`,
          data: { user: queueby, action },
          userMessage: `Error: This disturbance was felt. Your action was recorded.`,
        });
        return;
      }

      if (
        actionData.options.find((opt) => opt.optionName === "enabled")
          .optionValue === false
      ) {
        this.logError({
          user,
          callingFunction,
          returnSocket: "coolpointsFailure",
          err: `Action ${action} is not enabled`,
          data: { user: queueby, action },
          userMessage: `Error: Action ${action} has been deemed too powerful. It's been disabled for now.`,
        });
        return;
      }

      // 3) subtract
      const pointsToLose =
        actionData.options.find((opt) => opt.optionName === "points")
          .optionValue ?? 0;

      this.subtract(queueby, pointsToLose);

      LOGGER.info(`User ${queueby} lost ${pointsToLose} points for ${action}`);

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `User ${queueby} lost ${pointsToLose} points for ${action}`,
          `${queueby} lost ${pointsToLose} points for ${action}`,
          new ReturnPointData(queueby, -pointsToLose, this.get(queueby).points)
        )
      );
    } catch (err) {
      this.logError({
        user,
        callingFunction: "handleSkipped",
        returnSocket: "coolpointsFailure",
        err,
        data: { user: queueby || "(anonymous)" },
        userMessage: `Error: Unable to lose points from video being skipped. Let the head monkey in charge know`,
      });
    }
  }

  /**
   * @summary Validates an action for a user
   * @param {Object} user user object
   * @param {String} action action to validate
   * @param {String} expectedActionType expected action type
   * @param {String} callingFunction calling function
   * @returns {Boolean} if the action is valid
   */
  isValidAction(user, action, expectedActionType, callingFunction) {
    const pointData = this.get(user.getName());
    if (!pointData) {
      this.logError({
        user,
        callingFunction,
        returnSocket: "coolpointsFailure",
        err: `User ${user.getName()} not found for point ${action}`,
        data: { user: user.getName(), action },
        userMessage: `Error: You were not found... Good luck with that`,
      });
      return false;
    }

    const actionData = this.channel.modules.coolholeactionspoints.get(action);
    if (actionData.actionType !== expectedActionType) {
      this.logError({
        user,
        callingFunction,
        returnSocket: "coolpointsFailure",
        err: `Action ${action} is not an ${expectedActionType}`,
        data: { user: user.getName(), action },
        userMessage: `Error: This disturbance was felt. Your action was recorded.`,
      });
      return false;
    }

    if (
      actionData.options.find((opt) => opt.optionName === "enabled")
        .optionValue === false
    ) {
      if (action !== "active")
        // "Active" still runs even if it's inactive; no need to log
        this.logError({
          user,
          callingFunction,
          returnSocket: "coolpointsFailure",
          err: `Action ${action} is not enabled`,
          data: { user: user.getName(), action },
          userMessage: `Error: Action ${action} has been deemed too powerful. It's been disabled for now.`,
        });
      return false;
    }

    switch (expectedActionType) {
      case ActionType.Expenditures:
        if (
          pointData.points <
          actionData.options.find((opt) => opt.optionName === "points")
            .optionValue
        ) {
          this.logError({
            user,
            callingFunction,
            returnSocket: "coolpointsFailure",
            err: `User ${user.getName()} does not have enough points to spend on ${action}`,
            data: { user: user.getName(), action },
            userMessage: `Error: You have not done enough for society to earn ${action}`,
          });
          return false;
        }
        break;
      case ActionType.Statuses:
        if (
          pointData.points <=
          actionData.options.find((opt) => opt.optionName === "points")
            .optionValue
        ) {
          return true;
        }
        return false;
      case ActionType.Losses:
      case ActionType.Earnings:
        break;
    }

    return true;
  }

  /**
   * @summary Spend coolpoints
   * @param {Object} user user object
   * @param {String} action action to spend points on
   * @return {ActionResult} The result of the operation.
   */
  spend(user, action) {
    try {
      if (!this.isUserEligibleForPoints(user)) {
        this.logError({
          user,
          callingFunction: "spend",
          returnSocket: "coolpointsFailure",
          err: `User ${user.getName()} is not registered or logged in`,
          data: user.getName(),
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return new ActionResult(false, "User is not registered or logged in");
      }

      if (!this.isValidAction(user, action, ActionType.Expenditures, "spend"))
        return new ActionResult(false, "Action is not valid");

      const actionData = this.channel.modules.coolholeactionspoints.get(action);
      const pointsToSpend = actionData.options.find(
        (opt) => opt.optionName === "points"
      ).optionValue;

      this.subtract(user.getName(), pointsToSpend);

      LOGGER.info(
        `User ${user.getName()} spent ${
          actionData.options.find((opt) => opt.optionName === "points")
            ?.optionValue
        } points on ${action}`
      );

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `User ${user.getName()} spent ${pointsToSpend} points on ${action}`,
          `Wise spender ${user.getName()} spent ${pointsToSpend} points on ${action}`,
          new ReturnPointData(
            user.getName(),
            -pointsToSpend,
            this.get(user.getName()).points
          )
        )
      );
      return new ActionResult(true, "User spent points successfully");
    } catch (err) {
      this.logError({
        user,
        callingFunction: "spend",
        returnSocket: "coolpointsFailure",
        err,
        data: user.getName(),
        userMessage: `Error: Unable to spend points. Let the head monkey in charge know`,
      });
      return new ActionResult(false, "Unable to spend points. Unknown error");
    }
  }

  /**
   * @summary Earn coolpoints
   * @param {Object} user user object
   * @param {String} action action was rewarded for
   * @return {ActionResult} The result of the operation
   */
  earn(user, action) {
    try {
      if (!this.isUserEligibleForPoints(user)) {
        this.logError({
          user,
          callingFunction: "earn",
          returnSocket: "coolpointsFailure",
          err: `User ${user.getName()} is not registered or logged in`,
          data: user.getName(),
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return new ActionResult(false, "User is not registered or logged in");
      }

      if (!this.isValidAction(user, action, ActionType.Earnings, "earn"))
        return new ActionResult(false, "Action is not valid");

      const actionData = this.channel.modules.coolholeactionspoints.get(action);
      const pointsToEarn = actionData.options.find(
        (opt) => opt.optionName === "points"
      ).optionValue;

      this.add(user.getName(), pointsToEarn);

      LOGGER.info(
        `User ${user.getName()} was awarded ${pointsToEarn} points for ${action}`
      );

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `User ${user.getName()} was awarded ${pointsToEarn} points for ${action}`,
          `${user.getName()} was awarded ${pointsToEarn} points for ${action}`,
          new ReturnPointData(
            user.getName(),
            pointsToEarn,
            this.get(user.getName()).points
          )
        )
      );
      return new ActionResult(true, "User earned points successfully");
    } catch (err) {
      this.logError({
        user,
        callingFunction: "earn",
        returnSocket: "coolpointsFailure",
        err,
        data: user.getName(),
        userMessage: `Error: Unable to award points. Let the head monkey in charge know`,
      });
      return new ActionResult(false, "Unable to earn points. Unknown error");
    }
  }

  /**
   * @summary Lose coolpoints and allows users to go negative
   * @param {Object} user user object
   * @param {String} action action was penalized for
   * @return {Object} object with success or failure and message
   */
  lose(user, action) {
    try {
      if (!this.isUserEligibleForPoints(user)) {
        this.logError({
          user,
          callingFunction: "lose",
          returnSocket: "coolpointsFailure",
          err: `User ${user.getName()} is not registered or logged in`,
          data: user.getName(),
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return new ActionResult(false, "User is not registered or logged in");
      }

      if (!this.isValidAction(user, action, ActionType.Losses, "lose"))
        return new ActionResult(false, "Action is not valid");

      const actionData = this.channel.modules.coolholeactionspoints.get(action);
      const pointsToLose = actionData.options.find(
        (opt) => opt.optionName === "points"
      ).optionValue;

      this.subtract(user.getName(), pointsToLose);

      LOGGER.info(
        `User ${user.getName()} lost ${pointsToLose} points for ${action}`
      );

      this.channel.broadcastAll(
        "updateCoolPointsResponse",
        new ReturnMsg(
          `User ${user.getName()} lost ${pointsToLose} points for ${action}`,
          `${user.getName()} lost ${pointsToLose} points for ${action}`,
          new ReturnPointData(
            user.getName(),
            -pointsToLose,
            this.get(user.getName()).points
          )
        )
      );

      return new ActionResult(true, "User lost points successfully");
    } catch (err) {
      this.logError({
        user,
        callingFunction: "lose",
        returnSocket: "coolpointsFailure",
        err,
        data: user.getName(),
        userMessage: `Error: Unable to lose points. Let the head monkey in charge know`,
      });

      return new ActionResult(false, "Unable to lose points. Unknown error");
    }
  }

  /**
   * @summary Check what statuses should be applied for a user
   * @param {Object} user user object
   * @returns {Array} statuses to apply
   */
  checkStatuses(user) {
    const statuses = [];
    this.channel.modules.coolholeactionspoints.coolpointsActions
      .filter((action) => action.actionType === ActionType.Statuses)
      .forEach((action) => {
        if (
          this.isValidAction(
            user,
            action.name,
            ActionType.Statuses,
            "checkStatuses"
          )
        ) {
          statuses.push(action);
        }
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
      if (!this.isUserEligibleForPoints(user)) {
        this.logError({
          user,
          callingFunction: "handleChatStatuses",
          returnSocket: "coolpointsFailure",
          err: `User ${user.getName()} is not registered or logged in`,
          data: user.getName(),
          userMessage: `Error: You must join cause if you wish to participate.`,
        });
        return;
      }

      const statuses = this.checkStatuses(user);
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
        user,
        callingFunction: "handleChatStatuses",
        returnSocket: "coolpointsFailure",
        err,
        data: user.getName(),
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
      LOGGER.info(`Guest is not eligible for points. Skipping active check`);
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
        LOGGER.info(
          `Interval has changed. Clearing interval and restarting for ${user.getName()}`
        );

        clearInterval(this.userActiveIntervalIds[user.getName()]);
        this.handleActive(user);
        return;
      }

      // Check if the action is still valid/active. If not, just return since I don't wanna build a hook to start this up again when it's turned on
      if (!this.isValidAction(user, "active", ActionType.Earnings, "active"))
        return;

      if (user.is(Flags.U_AFK)) return;

      this.earn(user, "active");
    }, activeInterval);
  }

  /**
   * Clears interval and removes from userActiveIntervalIds
   * @param {Object} user user object
   */
  cleanUpActive(user) {
    LOGGER.info(`Clearing active interval for ${user.getName()}`);
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
    if (!this.isUserEligibleForPoints(user)) {
      this.logError({
        user,
        callingFunction: "handleChatCommand",
        returnSocket: "coolpointsFailure",
        err: `User ${user.getName()} is not registered or logged in`,
        data: user.getName(),
        userMessage: `Error: You must join cause if you wish to participate.`,
      });
      return new ActionResult(false, "User is not registered or logged in");
    }
    const msgWithoutCmd = msg.split(" ").slice(1).join(" ");

    if (!this.spend(user, command).success)
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
          user,
          callingFunction: "handleChatCommand",
          returnSocket: "coolpointsFailure",
          err: `Command ${command} not found`,
          data: command,
          userMessage: `Error: Command ${command} not found`,
        });
        return new ActionResult(false, "Command not found");
      }
    }
  }
}

module.exports = Coolpoints;
