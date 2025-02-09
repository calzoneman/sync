const link =
  /(\w+:\/\/(?:[^:/[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^/\s]*)*)/gi;
const XSS = require("./xss");

function sanitizedWithLinksReplaced(text) {
  return XSS.sanitizeText(text).replace(
    link,
    '<a href="$1" target="_blank" rel="noopener noreferer">$1</a>'
  );
}

class CoolholePoll {
  static create(
    createdBy,
    title,
    choices,
    options = { hideVotes: false, retainVotes: false, gamble: false }
  ) {
    let poll = new CoolholePoll();
    poll.createdAt = new Date();
    poll.createdBy = createdBy;
    poll.title = sanitizedWithLinksReplaced(title);
    poll.choices = choices.map((choice) => sanitizedWithLinksReplaced(choice));
    poll.hideVotes = options.hideVotes;
    poll.retainVotes = options.retainVotes;
    poll.gamble = options.gamble;
    poll.votes = new Map();
    return poll;
  }

  static fromChannelData({
    initiator,
    title,
    options,
    _counts,
    votes,
    timestamp,
    obscured,
    retainVotes,
    gamble,
  }) {
    let poll = new CoolholePoll();
    if (timestamp === undefined)
      // Very old polls still in the database lack timestamps
      timestamp = Date.now();
    poll.createdAt = new Date(timestamp);
    poll.createdBy = initiator;
    poll.title = title;
    poll.choices = options;
    poll.votes = new Map();
    Object.keys(votes).forEach((key) => {
      if (votes[key] !== null) poll.votes.set(key, votes[key]);
    });
    poll.hideVotes = obscured;
    poll.retainVotes = retainVotes || false;
    poll.gamble = gamble || false;
    return poll;
  }

  toChannelData() {
    let counts = new Array(this.choices.length);
    counts.fill(0);

    // TODO: it would be desirable one day to move away from using an Object here.
    // This is just for backwards-compatibility with the existing format.
    let votes = {};

    this.votes.forEach((index, key) => {
      votes[key] = index;
      counts[index]++;
    });

    return {
      title: this.title,
      initiator: this.createdBy,
      options: this.choices,
      counts,
      votes,
      obscured: this.hideVotes,
      retainVotes: this.retainVotes,
      timestamp: this.createdAt.getTime(),
      gamble: this.gamble,
    };
  }

  countVote(key, choiceObj) {
    if (choiceObj.option < 0 || choiceObj.option >= this.choices.length)
      return false;

    let changed = false;
    if (this.votes.has(key)) {
      if (this.gamble) return false; // Cant change vote when gambling

      const oldChoice = this.votes.get(key);
      changed = oldChoice.option !== choiceObj.option;
    } else {
      changed = true;
    }
    this.votes.set(key, choiceObj);
    return changed;
  }

  uncountVote(key) {
    let changed = this.votes.has(key);
    this.votes.delete(key);
    return changed;
  }

  toUpdateFrame(showHiddenVotes) {
    let counts = new Array(this.choices.length);
    counts.fill(0);

    this.votes.forEach((vote) => counts[vote.option]++);
    const totalWagers = Array.from(this.votes.values()).reduce((acc, vote) => {
      return acc + vote.wager;
    }, 0);

    if (this.hideVotes) {
      counts = counts.map((c) => {
        if (showHiddenVotes) return c;
        else return "?";
      });
    }

    return {
      title: this.title,
      options: this.choices,
      counts: counts,
      totalWagers,
      initiator: this.createdBy,
      timestamp: this.createdAt.getTime(),
      gamble: this.gamble,
      hideVotes: this.hideVotes,
    };
  }
}

exports.CoolholePoll = CoolholePoll;
