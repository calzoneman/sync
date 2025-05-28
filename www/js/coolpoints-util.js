/**
 * This file is additional functions/logic to make coolhole point features work.
 * It's grown big enough to deserve multiple files to make organization easier
 * but this is a fork and one file keeps required imports minimal.
 */

/**
 * ============================
 * Global Variables
 * ============================
 */

/**
 * ============================
 * Global functions
 * ============================
 */

/**
 * Initializes the points for the current user and applies fade-in animation
 * @param {Number} pts Points to initialize
 */
function initPointsForSelf(pts) {
  const pointsEl = $("#coinAmt");
  pointsEl.text(`${pts}`);
}

/**
 * Handles overlapping animations by removing the previous animation
 * @param {String} id Id of the element to animate
 * @param {String} animationName Name of the animation to apply
 */
function updateAnimation(id, animationName) {
  const el = document.getElementById(id);
  el.classList.add(animationName);
  Promise.all(
    el.getAnimations({ subtree: true }).map((animation) => animation.finished)
  )
    .then(() => el.classList.remove(animationName))
    .catch((error) => console.log(error));
  // TODO: This is a catch all error handler which picked up when an animation was cancelled.
  // That's just noise and should be more targeted if needed
  //.catch((err) => console.error(err));
}

/**
 * Applies a function after a given delay and restarts if called again before the delay is up
 * @param {Number} delay number of milliseconds to wait before calling the function
 * @param {Function} fn function to call
 * @returns function
 */
const debounce = (delay, fn) => {
  let timer;

  return (...arg) => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn.apply(this, arg);
    }, delay);
  };
};

/**
 * Applies coolpoints animation to a given element
 * @param {Element} ptEl point element
 * @param {Element} msgEl message element
 * @param {Number} diff difference in new and old points
 */
function animatePointUpdate(ptEl, msgEl, diff, btnEl = null) {
  const isPositive = diff > 0;
  const bounceAnimationName = isPositive ? "cpBounce" : "cpShake";
  const fadeAnimationName = isPositive ? "cpFadeGreen" : "cpFadeRed";
  const glowAnimationName = isPositive ? "cpGlowGreen" : "cpGlowRed";
  const msgText = isPositive ? `+${diff}` : `${diff}`;
  msgEl.text(msgText);
  if (btnEl) updateAnimation(btnEl.attr("id"), glowAnimationName);
  updateAnimation(ptEl.attr("id"), bounceAnimationName);
  updateAnimation(msgEl.attr("id"), fadeAnimationName);
}

/**
 * Applies the coolpoints to a users UI
 * @param {Number} incCoolPoints
 */
function applyPointsToSelf(incCoolPoints) {
  const pointsEl = $("#coinAmt");
  const messageEl = $("#coinMsg");
  const buttonEl = $("#cpPromptBtn");
  // TODO: Counter animation UI
  pointsEl.text(CLIENT.coolpoints);

  animatePointUpdate(pointsEl, messageEl, incCoolPoints, buttonEl);
}

/**
 * ============================
 * Bindings
 * ============================
 */

$(".cp-option-form-group input").each(function () {
  const classNames = $(this).attr("class").split(" ");
  if (classNames.includes("cs-checkbox")) {
    $(this).change(cpCheckboxChange);
  } else if (classNames.includes("cp-option-input")) {
    $(this).on("keyup keypress", debounce(1000, cpNumericInputChange));
  } else if (classNames.includes("cp-option-timeinput")) {
    $(this).on("keyup keypress", debounce(1000, cpTimeInputChange));
  }
});

/**
 * ============================
 * Coolpoints Admin Table
 * ============================
 */

// TODO: Copy of emotelist which idk seems unnecessary and a lot could be done in pug instead
class CoolpointsUserList {
  constructor(selector) {
    this._cols = 5;
    this._itemsPerPage = 25;
    this.elem = $(selector);
    this.initSearch();
    //this.initSortOption();
    this.table = this.elem.find(".users-coolpoints-table")[0];
    this.paginatorContainer = this.elem.find(
      ".users-coolpoints-paginator-container"
    );
    this.users = [];
    this.page = 0;
  }
  set itemsPerPage(val) {
    this.page = 0;
    this._itemsPerPage = val;
    this.handleChange();
  }
  get itemsPerPage() {
    return this._itemsPerPage;
  }
  set cols(val) {
    this.page = 0;
    this._cols = val;
    this.handleChange();
  }
  get cols() {
    return this._cols;
  }
}

/**
 * Initialize search bar
 */
CoolpointsUserList.prototype.initSearch = function () {
  this.searchbar = this.elem.find(".users-coolpoints-search");
  var self = this;

  this.searchbar.keyup(function () {
    var value = this.value.toLowerCase();
    if (value) {
      self.filter = function (user) {
        return user.user.toLowerCase().indexOf(value) >= 0;
      };
    } else {
      self.filter = null;
    }
    self.handleChange();
    self.loadPage(0);
  });

  this.searchbar.keydown(function (e) {
    if (e.key == "Enter") e.preventDefault();
  });
};

/**
 * Handle change in users
 */
CoolpointsUserList.prototype.handleChange = function () {
  this.usersCoolPoints = [...CHANNEL.usersCoolPoints];
  this.usersCoolPoints.sort((a, b) => b.points - a.points);

  if (this.filter) {
    this.usersCoolPoints = this.usersCoolPoints.filter(this.filter);
  }

  this.paginator = new NewPaginator(
    this.usersCoolPoints.length,
    this.itemsPerPage,
    this.loadPage.bind(this)
  );
  this.paginatorContainer.html("");
  this.paginatorContainer.append(this.paginator.elem);
  this.paginator.loadPage(this.page);
};

/**
 * Load a page of users
 * @param {Number} page page number
 */
CoolpointsUserList.prototype.loadPage = function (page) {
  var tbody = this.table.tBodies[0];
  tbody.innerHTML = "";

  var row;
  var start = page * this.itemsPerPage;
  if (start >= this.usersCoolPoints.length) return;
  var end = Math.min(start + this.itemsPerPage, this.usersCoolPoints.length);

  for (var i = start; i < end; i++) {
    row = document.createElement("tr");
    tbody.appendChild(row);

    (function (userData) {
      const userName = document.createElement("td");
      userName.className = "cp-table-user-name";
      userName.textContent = userData.user;
      row.appendChild(userName);

      const userPointsTd = document.createElement("td");
      const userPointsWrapper = document.createElement("div");
      userPointsWrapper.className = "cp-table-points-wrapper";
      userPointsTd.appendChild(userPointsWrapper);

      // Actual points element
      const userPoints = document.createElement("div");
      userPoints.textContent = userData.points;
      userPoints.id = `${userData.user}-userlist-points`;
      // FIX: This sucks. It adds the coolpoints icon but we just use img tag instead of pseudo element
      userPoints.className = "cp-table-points";

      // Message element that appears points change
      const userPointsMsg = document.createElement("span");
      userPointsMsg.id = `${userData.user}-userlist-points-msg`;
      userPointsMsg.className = "cp-table-points-msg";

      userPointsWrapper.appendChild(userPoints);
      userPointsWrapper.appendChild(userPointsMsg);
      row.appendChild(userPointsTd);

      const userFates = document.createElement("td");

      const userFatesWrapper = document.createElement("div");
      userFatesWrapper.className = "cp-table-user-fates-wrapper";
      userFates.appendChild(userFatesWrapper);

      const numberOfPointsInput = document.createElement("input");
      numberOfPointsInput.type = "text";
      numberOfPointsInput.inputMode = "numeric";
      numberOfPointsInput.className = "form-control px-3";
      numberOfPointsInput.placeholder = "Points";
      numberOfPointsInput.value = 0;
      // Don't allow negative numbers
      numberOfPointsInput.min = 0;
      numberOfPointsInput.onkeydown = function (e) {
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
      };

      userFatesWrapper.appendChild(numberOfPointsInput);

      const givePoints = document.createElement("button");
      givePoints.textContent = "Give";
      givePoints.className = "btn btn-default btn-pts-give";
      userFatesWrapper.appendChild(givePoints);

      const takePoints = document.createElement("button");
      takePoints.textContent = "Take";
      takePoints.className = "btn btn-default btn-pts-take";
      userFatesWrapper.appendChild(takePoints);

      givePoints.onclick = function () {
        const points = parseInt(numberOfPointsInput.value);
        if (!Number.isNaN(points) && points > 0) {
          socket.emit("applyPointsToUser", {
            targetName: userData.user,
            points: points,
          });
        }
      };
      takePoints.onclick = function () {
        const points = parseInt(numberOfPointsInput.value);
        if (!Number.isNaN(points) && points > 0) {
          socket.emit("applyPointsToUser", {
            targetName: userData.user,
            points: -points,
          });
        }
      };
      row.appendChild(userFates);
    })(this.usersCoolPoints[i]);
  }

  this.page = page;
};

// Initialize Coolpoints User List
window.USERCOOLPOINTSLIST = new CoolpointsUserList(
  "#cs-chancoolpoint-user-table"
);
//window.USERCOOLPOINTSLIST.sortAlphabetical = USEROPTS.emotelist_sort;

function applyPointsToTable(pointData) {
  const userCoolPointListItem = window.USERCOOLPOINTSLIST.usersCoolPoints.find(
    (d) => d.user === pointData.user
  );
  if (!userCoolPointListItem) return;
  userCoolPointListItem.points = CHANNEL.usersCoolPoints.find(
    (d) => d.user === pointData.user
  ).points;

  // Run animation
  const userPoints = $(`#${pointData.user}-userlist-points`);
  if (userPoints.length === 0) return; // If the user's points isn't visible, do nothing

  userPoints.text(userCoolPointListItem.points);
  const userPointsMsg = $(`#${pointData.user}-userlist-points-msg`);
  animatePointUpdate(userPoints, userPointsMsg, pointData.points);
  $(`#${pointData.user}-userlist-points`).text(userCoolPointListItem.points);

  // Update table
  // window.USERCOOLPOINTSLIST.handleChange();
}

/**
 * ============================
 * Coolpoints Admin Options
 * ============================
 */

/**
 * Sends the updated option to the server
 * @param {*} event event object
 * @returns void
 */
function cpNumericInputChange(event) {
  const el = $(event.target);

  const actionName = el.attr("data-actionName");
  const optionName = el.attr("data-optionName");
  const optionValue = el.val();

  const data = {
    actionName,
    optionName,
    optionValue,
  };
  socket.emit("setCpOptions", data);
}

/**
 * Disable all options related to an action not including the id provided
 * @param {String} id id that toggles these elements
 * @param {String} actionName action name of the elements we want disabled
 * @param {Bool} value should be disabled or not
 */
const setDisableOnRelatedOptions = (id, actionName, value) => {
  $(`[data-actionname='${actionName}']`).not(`#${id}`).prop("disabled", value);
};

/**
 * Sends the updated option to the server and disables related options
 * @param {*} event event object
 * @returns void
 */
function cpCheckboxChange(event) {
  const el = $(event.target);

  const actionName = el.attr("data-actionName");
  const optionName = el.attr("data-optionName");
  const optionValue = el.prop("checked");

  const data = {
    actionName,
    optionName,
    optionValue,
  };

  if (optionName === "enabled") {
    setDisableOnRelatedOptions(el.attr("id"), actionName, !optionValue);
  }

  socket.emit("setCpOptions", data);
}

/**
 * Sends the updated option to the server and validates time input
 * @param {*} event event object
 * @returns void
 */
function cpTimeInputChange(event) {
  const el = $(event.target);

  const key = el.attr("id");
  const actionName = el.attr("data-actionName");
  const optionName = el.attr("data-optionName");
  let optionValue = el.val();

  $("#cs-textbox-timeinput-validation-error-" + key).remove();
  el.parent().removeClass("has-error");

  try {
    optionValue = parseTimeout(el.val());
  } catch (error) {
    const msg = `Invalid timespan value '${optionValue}'. Please use the format HH:MM:SS or enter a single number for the number of seconds.`;
    const validationError = $("<p/>")
      .addClass("text-danger")
      .text(msg)
      .attr("id", "cs-textbox-timeinput-validation-error-" + key);
    validationError.insertAfter(event.target);
    el.parent().addClass("has-error");
    return;
  }

  const data = {
    actionName,
    optionName,
    optionValue,
  };
  socket.emit("setCpOptions", data);
}

/**
 * Updates UI with latest values for each action
 * @returns void
 */
function handleCPOptionChanges() {
  if (!CHANNEL.opts.cpOpts) return;

  $("#channeloptions").find(".text-danger").remove();
  $("#channeloptions").find(".has-error").removeClass("has-error");

  CHANNEL.opts.cpOpts.forEach((action) => {
    const { name: actionName } = action;
    action.options.forEach((option) => {
      const { optionName, optionType, optionValue } = option;
      if (CLIENT.rank >= 3) {
        // Update option inputs
        switch (optionType) {
          case "time":
            $(`#cp-${actionName}-${optionName}`).val(formatTime(optionValue));
            break;
          case "bool":
            $(`#cp-${actionName}-${optionName}`).prop("checked", optionValue);
            setDisableOnRelatedOptions(
              `cp-${actionName}-${optionName}`,
              actionName,
              !optionValue
            );
            break;
          case "int":
          default:
            $(`#cp-${actionName}-${optionName}`).val(optionValue);
            break;
        }
      }
      // Update user prompt/status of actions
      if (optionType === "bool" && optionName === "enabled") {
        if (optionValue) {
          $(`#cp-userprompt-${actionName}`).removeClass("cpActionDisabled");
        } else {
          $(`#cp-userprompt-${actionName}`).addClass("cpActionDisabled");
        }
      }
      if (optionType === "int" && optionName === "points") {
        $(`#cp-userprompt-${actionName}-pts`).text(`${optionValue} CP`);
      }
    });
  });
}

/**
 * ============================
 * Coolpoints User Prompt
 * ============================
 */
function showCoolPointsUserPrompt() {
  //updateCoolPointActionsUserPrompt();
  $("#coolPointsPrompt").modal();
}

/**
 * OLD SHIT BELOW HERE
 * IF I HAVEN'T GOTTEN RID OF IT IT'S BECAUSE I FORGOT TO IMPLEMENT IT
 */

// Bindings
$("#cp-greatreset").on("click", greatResetOnClick);

function greatResetOnClick() {
  if (CLIENT.rank < 3) {
    alert("I will kill you");
    return;
  }

  if (
    confirm(
      "All points for all users will be set to 0. Are you sure about this?"
    )
  ) {
    socket.emit("greatReset", {});
  }
}
