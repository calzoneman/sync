/**
 * Checks to see if a user is a mod or higher. Has to be a function since the CLIENT rank is set after this file is loaded.
 * @returns {boolean}
 */
const isModOrHigher = () => CLIENT.rank >= 2;

/**
 * Updates the UI with the current points for the user that was updated
 * @param {Object} data Point Repsonse Data
 */
const updateCoolPoints = (data) => {
  const user = CHANNEL.usersCoolPoints.find((d) => d.user === data.user);
  user.points = data.currentPoints;

  if (CLIENT.name === data.user) {
    CLIENT.coolpoints = data.currentPoints;
  }
};

/**
 * Converts a count and total to a string showing the percentage of that count against the total
 * @param {Number} count count of something
 * @param {Number} total total of something
 * @returns A string showing the percentage of the count against the total ie. "1 (100%)"
 */
const toPercent = (count, total) =>
  total > 0 ? `${((count / total) * 100).toFixed(0)}%` : "0.00%";

const CoolholeCallbacks = {
  channelCoolPointOpts: function (cpOpts) {
    CHANNEL.opts.cpOpts = cpOpts;
    handleCPOptionChanges();
  },
  coolpointsInitResponse: function (response) {
    // Set points for client and all other users
    // Ideally this would be in data.js if this wasn't a fork
    CLIENT.coolpoints = response.data.find(
      (d) => d.user === CLIENT.name
    ).points;
    CHANNEL.usersCoolPoints = response.data;

    // Update the UI
    // Check the users rank and fade in the counter/button
    initPointsForSelf(CLIENT.coolpoints);

    // Init CoolPoints User List
    if (CLIENT.rank >= 2) {
      setVisible("#cs-coolpoints-dd-toggle", isModOrHigher());
      setParentVisible("a[href='#cs-chancoolpoint-options']", isModOrHigher());
      setParentVisible(
        "a[href='#cs-chancoolpoint-user-table']",
        isModOrHigher()
      );
    }
    if (isModOrHigher) {
      window.USERCOOLPOINTSLIST.handleChange();
    }
  },
  updateCoolPointsResponse: function (response) {
    updateCoolPoints(response.data);

    if (CLIENT.name === response.data.user) {
      applyPointsToSelf(response.data.points);
    }
    if (isModOrHigher()) {
      applyPointsToTable(response.data);
    }
  },
  coolpointsFailure: function (response) {
    // TODO: Handle failures
    console.error(response);
  },
  /* REGION Polls */
  // Added to better style poll for Coolhole's "slate" theme
  newPoll: function (data) {
    CoolholeCallbacks.closePoll();
    // Poll message
    $("<div/>")
      .addClass("poll-notify")
      .html(data.initiator + ' opened a poll: "' + data.title + '"')
      .appendTo($("#messagebuffer"));
    scrollChat();

    const pollWrap = $("#pollwrap"); // main container
    // use well as the first background
    const well = $("<div>", {
      class: "well active",
    });
    // add an additional wrapper for layered colors
    const innerContentWrap = $("<div>", {
      class: "wrapInner",
    });
    const headerWrap = $("<div>", {
      class: "pollHeader",
    });
    const questionSpan = $("<span>", {
      html: data.title,
      css: {
        flex: 1,
        fontSize: "24px",
      },
    });
    const timestampSpan = $("<span>", {
      title: "Poll opened by " + data.initiator,
      text: `Poll opened by ${data.initiator} - ${
        new Date(data.timestamp).toTimeString().split(" ")[0]
      }`,
      data: {
        timestamp: data.timestamp,
        initiator: data.initiator,
      },
      css: {
        fontSize: "12px",
      },
    });

    headerWrap.append(questionSpan, timestampSpan);

    if (hasPermission("pollctl")) {
      let endPollButton = $("<button>", {
        class: "btn btn-danger btn-sm",
        text: "End Poll",
        css: {
          flex: 0,
          height: "30px",
        },
      });
      endPollButton.click(function () {
        socket.emit("closePoll");
      });
      headerWrap.append(endPollButton);
    }

    let closeButton = $("<button>", {
      class: "close",
      html: "&times;",
    });
    closeButton.click(function () {
      well.remove();
    });

    headerWrap.append(closeButton);

    const optionsWrapper = $("<div>", {
      class: "options",
    });
    const totalVotes = data.counts.reduce((a, b) => a + b, 0);

    data.options.forEach((option, i) => {
      const optionWrapper = $("<div>", {
        class: "option",
      });
      const optionButton = $("<button>", {
        class: "btn",
      });
      optionButton.click(function () {
        socket.emit("vote", {
          option: i,
        });
        optionsWrapper.find(".option button").removeClass("active");
        $(this).addClass("active");
      });
      const optionText = $("<span>", {
        html: option, // html because we apparently return tags and encoded characters
      });
      const optionPercentage = $("<span>", {
        text: `${data.counts[i]} (${toPercent(data.counts[i], totalVotes)})`,
        class: "percentage",
      });

      optionButton.append(optionText, optionPercentage);
      optionWrapper.append(optionButton);
      optionsWrapper.append(optionWrapper);
    });

    innerContentWrap.append(headerWrap, optionsWrapper);
    well.append(innerContentWrap);
    pollWrap.append(well);

    if (!hasPermission("pollvote")) {
      pollWrap.find(".option button").attr("disabled", true);
    }
  },

  updatePoll: function (data) {
    var poll = $("#pollwrap .active");
    const totalVotes = data.counts.reduce((a, b) => a + b, 0);
    poll.find(".option button span.percentage").each(function (i) {
      $(this).text(
        `${data.counts[i]} (${toPercent(data.counts[i], totalVotes)})`
      );
    });
  },

  closePoll: function () {
    if ($("#pollwrap .active").length != 0) {
      var poll = $("#pollwrap .active");
      poll.removeClass("active").addClass("muted");
      poll.find(".option button").each(function () {
        $(this).attr("disabled", true);
      });
      poll.find(".btn-danger").each(function () {
        $(this).remove();
      });
    }
  },
  coolpointsVoteskipFail: function (response) {
    $("#voteskip").attr("disabled", false);
  },
};
