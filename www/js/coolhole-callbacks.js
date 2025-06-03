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
  total > 0 ? `${((count / total) * 100).toFixed(0)}%` : "0%";

/**
 * Validation Error code (stolen from validationerror callback)
 * @param {String} message Error message
 * @param {String} targetId Id for the field that caused the error
 * @return nothing idiot
 */
const validationError = (message, targetId) => {
  var target = $(targetId);
  target.parent().find(".text-danger").remove();

  var formGroup = target.parent();
  while (!formGroup.hasClass("form-group") && formGroup.length > 0) {
    formGroup = formGroup.parent();
  }

  if (formGroup.length > 0) {
    formGroup.addClass("has-error");
  }

  $("<p/>").addClass("text-danger").text(message).insertAfter(target);
};

/**
 * Validation Passed code (stolen from validationpassed callback)
 * @param {String} targetId Id for the field that caused the error
 * @return nothing idiot
 */
const validationPassed = (targetId) => {
  var target = $(targetId);
  target.parent().find(".text-danger").remove();

  var formGroup = target.parent();
  while (!formGroup.hasClass("form-group") && formGroup.length > 0) {
    formGroup = formGroup.parent();
  }

  if (formGroup.length > 0) {
    formGroup.removeClass("has-error");
  }
};

const triggerConfettiCelebration = (data) => {
  // intensity from a scale of 10 to 100
  const intensity = Math.max(
    Math.min(data.votes.reduce((a, b) => a + b.wager, 0) / 100, 100)
  );
  const defaults = {
    scalar: 2,
    spread: 300,
    particleCount: intensity,
    startVelocity: intensity,
  };
  const imgDefaults = {
    width: 32,
    height: 40,
  };

  // did you win?
  const didYouWin = data.votes.find(
    (vote) => vote.user === CLIENT.name && vote.isWinner
  );
  if (didYouWin) {
    confetti({
      ...defaults,
      shapes: ["image"],
      shapeOptions: {
        image: {
          ...imgDefaults,
          src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' id='ch-icon-ui-coin' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M12 0C18.6275 0 24 5.37253 24 12C24 18.6275 18.6275 24 12 24C5.37253 24 -1.2517e-06 18.6275 -1.2517e-06 12C-1.2517e-06 5.37253 5.37253 0 12 0Z' fill='%23F8C341'/%3E%3Cpath d='M12 2.66666C17.1547 2.66666 21.3333 6.84532 21.3333 12C21.3333 17.1547 17.1547 21.3333 12 21.3333C6.84534 21.3333 2.66668 17.1547 2.66668 12C2.66668 6.84532 6.84534 2.66666 12 2.66666Z' fill='%23CE8C00'/%3E%3Cpath d='M4.42132 4.82401L2.94932 5.29334L4.13865 6.28001L4.60798 7.75201L5.59465 6.56267L7.06665 6.09067L5.87732 5.10401L5.40798 3.63467L4.42132 4.82401Z' fill='%23FFED9A'/%3E%3Cpath d='M2.31733 9.552L1.79466 10.328L2.73066 10.3493L3.50666 10.872L3.52799 9.936L4.05066 9.16L3.11466 9.13866L2.33599 8.616L2.31733 9.552Z' fill='%23FFED9A'/%3E%3Cpath d='M8.74491 12.1445C8.74491 10.4221 10.1129 9.01498 11.8363 8.92071L12.2421 6.69H8.5237L6.58694 17.3372H10.3053L10.7113 15.1051C10.1269 14.8539 9.62959 14.44 9.28029 13.9141C8.93098 13.3882 8.74491 12.7732 8.74491 12.1445V12.1445Z' fill='%23F8C341'/%3E%3Cpath d='M13.8468 6.69L13.3884 9.20979C13.9578 9.46762 14.4403 9.88118 14.7785 10.4014C15.1168 10.9216 15.2965 11.5266 15.2965 12.1445C15.2965 13.8455 13.9622 15.2394 12.2689 15.3643L11.91 17.3372H15.6284L17.5652 6.69H13.8468Z' fill='%23F8C341'/%3E%3Cpath d='M10.759 10.7686C10.759 10.5684 11.0003 10.4433 11.1931 10.5435L13.8238 11.908C14.0166 12.0082 14.0166 12.2583 13.8238 12.3583L11.1931 13.7229C11.0003 13.8231 10.759 13.6979 10.759 13.4977V10.7686Z' fill='%23F8C341'/%3E%3C/svg%3E",
        },
      },
    });
    confetti({
      ...defaults,
      shapes: ["star"],
      colors: ["#f0f1f2", "#cb9b51", "#f6e27a"],
    });
    confetti({
      ...defaults,
      shapes: ["image"],
      shapeOptions: {
        image: {
          ...imgDefaults,
          src: "https://static.coolhole.org/img/CH_Emote-slash_gold.gif",
        },
      },
    });
  } else {
    confetti({
      ...defaults,
      shapes: ["image"],
      shapeOptions: {
        image: {
          ...imgDefaults,
          src: "https://static.coolhole.org/img/CH_Emote-slash_rope.png",
        },
      },
    });
    confetti({
      ...defaults,
      shapes: ["emoji"],
      shapeOptions: {
        emoji: {
          // thumbs down, pregnnant man, snail
          value: ["👎", "🫃", "🐌"],
        },
      },
    });
    confetti({
      ...defaults,
      shapes: ["image"],
      shapeOptions: {
        image: {
          ...imgDefaults,
          src: "https://static.coolhole.org/img/CH_Emote-slash_cope.png",
        },
      },
    });
  }
};

const CoolholeCallbacks = {
  channelCoolPointOpts: function (cpOpts) {
    CHANNEL.opts.cpOpts = cpOpts;
    handleCPOptionChanges();
  },
  coolpointsInitResponse: function (response) {
    // Set points for client and all other users
    // Ideally this would be in data.js if this wasn't a fork
    CLIENT.coolpoints =
      response.data.find((d) => d.user === CLIENT.name)?.points ?? 0; // If the user doesn't exist, set to 0
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
  // TODO: Move to coolpoints-utils.js or something
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
      class: "wrapInner" + (data.gamble ? " gamble" : ""),
    });
    const headerWrap = $("<div>", {
      class: "pollHeader",
    });
    const questionSpan = $("<span>", {
      html: data.title,
      css: {
        flexGrow: 1,
        fontSize: "24px",
      },
    });

    headerWrap.append(questionSpan);

    if (hasPermission("pollctl")) {
      let endPollButton = $("<button>", {
        class: "btn btn-danger btn-sm",
        text: "End Poll",
        css: {
          flexGrow: 0,
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
    const totalVotes = data.counts.some((c) => isNaN(c))
      ? 0
      : data.counts.reduce((a, b) => a + b, 0);

    for (const [i, option] of data.options.entries()) {
      const optionWrapper = $("<div>", {
        class: "option",
      });
      const optionButton = $("<button>", {
        class: "btn btn-default",
      });
      optionButton.click(function () {
        if (data.gamble) {
          $("#ch-poll-wager-option").val(i);
          $("#ch-poll-wager-wager").val(1);
          $("#ch-poll-wager-modal").modal();
        } else {
          socket.emit("vote", {
            option: i,
          });
        }
        optionsWrapper.find(".option button").removeClass("active");
        $(this).addClass("active");
      });
      const optionText = $("<span>", {
        html: option, // html because we apparently return tags and encoded characters
        css: {
          textWrap: "wrap",
        },
      });
      const optionPercentage = $("<span>", {
        text: `${data.counts[i]} (${
          data.counts[i] !== "?" && !isNaN(data.counts[i])
            ? toPercent(data.counts[i], totalVotes)
            : "?%"
        })`,
        class: "percentage",
      });

      optionButton.append(optionText, optionPercentage);
      optionWrapper.append(optionButton);
      optionsWrapper.append(optionWrapper);

      if (data.gamble && hasPermission("pollctl")) {
        optionWrapper.css({
          display: "grid",
          gridTemplateColumns: "3.5fr 1fr",
          gap: "10px",
        });
        const winningOptionButton = $("<button>", {
          class: "btn btn-danger btn-sm",
          css: {
            height: "100%",
            display: "flex",
            flexDirection: "column",
          },
        });
        winningOptionButton.click(function () {
          $("#ch-poll-winner-confirmation-title").text(
            `Choose "${option}" as the winner?`
          );
          $("#ch-poll-winner-confirmation-text").text(
            `Are you sure you want to end the poll with "${option}" as the winner?`
          );
          $("#ch-poll-winner-confirmation-option").val(i);
          $("#ch-poll-winner-confirmation-modal").modal();
        });
        const winningOptionText = $("<span>", {
          text: `End as winner`,
        });
        const winningOptionsTotal = $("<span>", {
          text: `${data.wagers[i]} CP wagered`,
          class: "percentage text-lottery",
        });
        $("#ch-poll-winner-confirmation-send-btn")
          .off("click")
          .on("click", function () {
            socket.emit("chooseWinningPollOption", {
              option: $("#ch-poll-winner-confirmation-option").val(),
            });
          });

        winningOptionButton.append(winningOptionText, winningOptionsTotal);
        optionWrapper.append(winningOptionButton);
      }
    }

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
        textAlign: "center",
        paddingTop: "10px",
        fontSize: "12px",
      },
    });

    if (data.gamble) {
      const wagerWrap = $("<div>", {
        class: "wager-wrap",
      });
      const staticWagerText = $("<span>", {
        class: "wager-text",
      });
      const wagerAmount = $("<span>", {
        class: "text-lottery",
      });
      wagerWrap.append(staticWagerText, wagerAmount);
      innerContentWrap.append(wagerWrap);

      if (data.totalWagers ?? 0 > 0) {
        staticWagerText.text("Total Wagers: ");
        wagerAmount.text(`${data.totalWagers} CP`);
      }

      // bindings for wagering on gamble
      $("#ch-poll-wager-send-btn")
        .off("click")
        .on("click", function () {
          const wager = parseInt($("#ch-poll-wager-wager").val());
          const option = parseInt($("#ch-poll-wager-option").val());
          if (isNaN(wager) || isNaN(option) || wager < 0 || option < 0) {
          }
          // disable all buttons
          $("#pollwrap .active .option button:not(.btn-danger)").each(
            function () {
              $(this).attr("disabled", true);
            }
          );

          socket.emit("vote", {
            option,
            wager,
          });
        });
      $("#ch-poll-wager-wager").keydown(function (e) {
        if (
          ![
            "Backspace",
            "Delete",
            "Tab",
            "Escape",
            "Enter",
            "ArrowLeft",
            "ArrowRight",
          ].includes(e.key) &&
          isNaN(e.key)
        ) {
          e.preventDefault();
        }
      });
      $("#ch-poll-wager-wager").on("focusout", function () {
        if (
          parseInt($(this).val()) === 0 ||
          CLIENT.coolpoints + 10000 < parseInt($(this).val())
        ) {
          validationError(
            `Invalid wager amount. Must be 1 ≤ and ≤ ${
              CLIENT.coolpoints + 10000
            }`,
            "#ch-poll-wager-wager"
          );
          $("#ch-poll-wager-send-btn").attr("disabled", true);
        } else {
          validationPassed("#ch-poll-wager-wager");
          $("#ch-poll-wager-send-btn").attr("disabled", false);
        }
      });
    }

    innerContentWrap.append(headerWrap, optionsWrapper, timestampSpan);
    well.append(innerContentWrap);
    pollWrap.append(well);

    if (!hasPermission("pollvote")) {
      pollWrap.find(".option button").attr("disabled", true);
    }
  },

  updatePoll: function (data) {
    var poll = $("#pollwrap .active");
    const totalVotes = data.counts.reduce((a, b) => a + b, 0);
    if (data.totalWagers ?? 0 > 0) {
      poll.find(".wager-wrap span.wager-text").text("Total Wagers: ");
      poll.find(".wager-wrap span.text-lottery").text(`${data.totalWagers} CP`);
    }
    poll
      .find(".option button span.percentage:not(.text-lottery)")
      .each(function (i) {
        $(this).text(
          `${data.counts[i]} (${
            data.counts[i] !== "?" && !isNaN(data.counts[i])
              ? toPercent(data.counts[i], totalVotes)
              : "?%"
          })`
        );
      });
    if (data.gamble && hasPermission("pollctl")) {
      poll
        .find(".option button span.percentage.text-lottery")
        .each(function (i) {
          $(this).text(`${data.wagers[i]} CP`);
        });
    }
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

  closeGamblePoll: function (data) {
    if ($("#pollwrap .active").length != 0) {
      const yourVote = data.votes.find((v) => v.user === CLIENT.name);
      const didYouWin = yourVote ? yourVote.isWinner : true; // if you didn't play, you won

      let poll = $("#pollwrap .active");
      poll.removeClass("active").addClass("muted");
      poll.find(".option button").each(function () {
        $(this).attr("disabled", true);
      });
      poll.find(".btn-danger").each(function () {
        $(this).remove();
      });
      poll.find(".btn-success").each(function () {
        $(this).remove();
      });
      poll.find(".option").css("display", "block");
      poll
        .find(`div.option:nth-child(${data.winningOption + 1}) button`)
        .css(
          "background-color",
          didYouWin ? "rgba(0, 255, 0, 0.5)" : "rgba(255, 0, 0, 0.5)"
        );
      poll
        .find(`div.option:nth-child(${yourVote.option + 1}) button`)
        .css("border", "1px solid #3E97A2");

      // Fun confetti stuff
      triggerConfettiCelebration(data);
    }
  },

  coolpointsVoteskipFail: function (response) {
    $("#voteskip").attr("disabled", false);
  },
};
