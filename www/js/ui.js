/* window focus/blur */
CyTube.ui.onPageFocus = function () {
    FOCUSED = true;
    clearInterval(TITLE_BLINK);
    TITLE_BLINK = false;
    document.title = PAGETITLE;
};

CyTube.ui.onPageBlur = function (event) {
    FOCUSED = false;
};

$(window).on('focus', CyTube.ui.onPageFocus).on('blur', CyTube.ui.onPageBlur);
// See #783
$(".modal").on('focus', CyTube.ui.onPageFocus);

$("#togglemotd").on('click', function () {
    var hidden = $("#motd")[0].style.display === "none";
    $("#motd").toggle();
    if (hidden) {
        $("#togglemotd").find(".glyphicon-plus")
            .removeClass("glyphicon-plus")
            .addClass("glyphicon-minus");
    } else {
        $("#togglemotd").find(".glyphicon-minus")
            .removeClass("glyphicon-minus")
            .addClass("glyphicon-plus");
    }
});

/* chatbox */

$("#modflair").on('click', function () {
    var m = $("#modflair");
    if (m.hasClass("label-success")) {
        USEROPTS.modhat = false;
        m.removeClass("label-success");
        if (SUPERADMIN) {
            USEROPTS.adminhat = true;
            m.addClass("label-danger");
        } else {
            m.addClass("label-default");
        }
    } else if (m.hasClass("label-danger")) {
        USEROPTS.adminhat = false;
        m.removeClass("label-danger")
            .addClass("label-default");
    } else {
        USEROPTS.modhat = true;
        m.removeClass("label-default")
            .addClass("label-success");
    }
    $("#us-modflair").prop("checked", USEROPTS.modhat);
    setOpt('modhat', USEROPTS.modhat);
});

$("#usercount").on('mouseenter', function (ev) {
    var breakdown = calcUserBreakdown();
    // re-using profile-box class for convenience
    var popup = $("<div/>")
        .addClass("profile-box")
        .css("top", (ev.clientY + 5) + "px")
        .css("left", (ev.clientX) + "px")
        .appendTo($("#usercount"));

    var contents = "";
    for(var key in breakdown) {
        contents += "<strong>" + key + ":&nbsp;</strong>" + breakdown[key];
        contents += "<br>"
    }

    popup.html(contents);
});

$("#usercount").on('mousemove', function (ev) {
    var popup = $("#usercount").find(".profile-box");
    if(popup.length == 0)
        return;

    popup.css("top", (ev.clientY + 5) + "px");
    popup.css("left", (ev.clientX) + "px");
});

$("#usercount").on('mouseleave', function () {
    $("#usercount").find(".profile-box").remove();
});

$("#messagebuffer").on('scroll', function (ev) {
    if (IGNORE_SCROLL_EVENT) {
        // Skip event, this was triggered by scrollChat() and not by a user action.
        // Reset for next event.
        IGNORE_SCROLL_EVENT = false;
        return;
    }

    var m = $("#messagebuffer");
    var lastChildHeight = 0;
    var messages = m.children();
    if (messages.length > 0) {
        lastChildHeight = messages[messages.length - 1].clientHeight || 0;
    }

    var isCaughtUp = m.height() + m.scrollTop() >= m.prop("scrollHeight") - lastChildHeight;
    if (isCaughtUp) {
        SCROLLCHAT = true;
        $("#newmessages-indicator").remove();
    } else {
        SCROLLCHAT = false;
    }
});

$("#guestname").on('keydown', function (ev) {
    if (ev.keyCode === 13) {
        socket.emit("login", {
            name: $("#guestname").val()
        });
    }
});


CyTube.chatTabCompleteData = {
    context: {}
};

function chatTabComplete(chatline) {
    if (!CyTube.tabCompleteMethods) {
        console.error('Missing CyTube.tabCompleteMethods!');
        return;
    }
    var currentText = chatline.value;
    var currentPosition = chatline.selectionEnd;
    if (typeof currentPosition !== 'number' || !chatline.setSelectionRange) {
        // Bail, we're on IE8 or something similarly dysfunctional
        return;
    }
    var firstWord = !/\s/.test(currentText.trim());
    var options = [];
    var userlistElems = document.getElementById("userlist").children;
    for (var i = 0; i < userlistElems.length; i++) {
        var username = userlistElems[i].children[1].textContent;
        if (firstWord) {
            username += ':';
        }
        options.push(username);
    }

    CHANNEL.emotes.forEach(function (emote) {
        options.push(emote.name);
    });

    var method = USEROPTS.chat_tab_method;
    if (!CyTube.tabCompleteMethods[method]) {
        console.error("Unknown chat tab completion method '" + method + "', using default");
        method = "Cycle options";
    }

    var result = CyTube.tabCompleteMethods[method](
            currentText,
            currentPosition,
            options,
            CyTube.chatTabCompleteData.context
    );

    chatline.value = result.text;
    chatline.setSelectionRange(result.newPosition, result.newPosition);
}

/* emote autocomplete */
var EMOTE_SUGGEST_IDX = 0;
function emoteLastWord() {
    var words = $("#chatline").val().split(" ");
    return words[words.length - 1].toLowerCase();
}
function emoteAccept() {
    var item = $("#emote-suggestions .active");
    if (!item.length) item = $("#emote-suggestions").children().first();
    if (!item.length) return;
    var words = $("#chatline").val().split(" ");
    words[words.length - 1] = item.data("name") + " ";
    $("#chatline").val(words.join(" "));
    $("#emote-suggestions").hide();
}
function emoteRefresh() {
    var partial = emoteLastWord();
    var popup = $("#emote-suggestions");
    if (partial.length < 2 || !CHANNEL.emotes || !CHANNEL.emotes.length) { popup.hide(); return; }
    var matches = CHANNEL.emotes.filter(function(e) {
        return e.name.toLowerCase().indexOf(partial) === 0;
    }).slice(0, 8);
    if (!matches.length) { popup.hide(); return; }
    popup.empty();
    matches.forEach(function(e) {
        $("<div>").addClass("emote-suggest-item")
            .data("name", e.name)
            .html('<img src="' + e.image + '">' + e.name)
            .appendTo(popup);
    });
    popup.children().first().addClass("active");
    EMOTE_SUGGEST_IDX = 0;
    var cl = $("#chatline"), off = cl.offset();
    popup.css({ left: off.left, width: cl.outerWidth() }).show();
    popup.css("top", off.top - popup.outerHeight() - 2);
}
$("#chatline").on("input", emoteRefresh);
$(document).on("mousedown", function(e) {
    if (!$(e.target).closest("#emote-suggestions, #chatline").length)
        $("#emote-suggestions").hide();
});
$(document).on("mousedown", "#emote-suggestions .emote-suggest-item", function() {
    EMOTE_SUGGEST_IDX = $(this).index();
    $("#emote-suggestions .active").removeClass("active");
    $(this).addClass("active");
    emoteAccept();
    $("#chatline").focus();
});
$("body").append('<div id="emote-suggestions" style="display:none;position:absolute;z-index:9999;background:#272b30;border:1px solid #555;border-radius:4px;overflow-y:auto;max-height:220px;box-shadow:0 2px 8px rgba(0,0,0,.5);color:#c8c8c8"></div>');

$("#chatline").on('keydown', function(ev) {
    var open = $("#emote-suggestions").is(":visible");
    if (open) {
        if (ev.keyCode == 27) { // Escape
            $("#emote-suggestions").hide();
            ev.preventDefault(); return false;
        } else if (ev.keyCode == 9 || (ev.keyCode == 39 && this.selectionStart === this.value.length)) { // Tab or right arrow at end
            emoteAccept();
            ev.preventDefault(); return false;
        } else if (ev.keyCode == 38 || ev.keyCode == 40) { // Up/down navigate
            var items = $("#emote-suggestions").children();
            items.eq(EMOTE_SUGGEST_IDX).removeClass("active");
            EMOTE_SUGGEST_IDX = ev.keyCode == 38
                ? (EMOTE_SUGGEST_IDX - 1 + items.length) % items.length
                : (EMOTE_SUGGEST_IDX + 1) % items.length;
            items.eq(EMOTE_SUGGEST_IDX).addClass("active")[0].scrollIntoView({ block: "nearest" });
            ev.preventDefault(); return false;
        }
    }
    // Enter/return
    if(ev.keyCode == 13) {
        $("#emote-suggestions").hide();
        if (CHATTHROTTLE) {
            return;
        }
        var msg = $("#chatline").val();
        if(msg.trim()) {
            var meta = {};
            if (USEROPTS.adminhat && CLIENT.rank >= 255) {
                msg = "/a " + msg;
            } else if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {
                meta.modflair = CLIENT.rank;
            }

            // The /m command no longer exists, so emulate it clientside
            if (CLIENT.rank >= 2 && msg.indexOf("/m ") === 0) {
                meta.modflair = CLIENT.rank;
                msg = msg.substring(3);
            }

            socket.emit("chatMsg", {
                msg: msg,
                meta: meta
            });
            CHATHIST.push($("#chatline").val());
            CHATHISTIDX = CHATHIST.length;
            $("#chatline").val("");
        }
        return;
    }
    else if(ev.keyCode == 9) { // Tab completion
        try {
            chatTabComplete(ev.target);
        } catch (error) {
            console.error(error);
        }
        ev.preventDefault();
        return false;
    }
    else if(ev.keyCode == 38) { // Up arrow (input history)
        if(CHATHISTIDX == CHATHIST.length) {
            CHATHIST.push($("#chatline").val());
        }
        if(CHATHISTIDX > 0) {
            CHATHISTIDX--;
            $("#chatline").val(CHATHIST[CHATHISTIDX]);
        }

        ev.preventDefault();
        return false;
    }
    else if(ev.keyCode == 40) { // Down arrow (input history)
        if(CHATHISTIDX < CHATHIST.length - 1) {
            CHATHISTIDX++;
            $("#chatline").val(CHATHIST[CHATHISTIDX]);
        }

        ev.preventDefault();
        return false;
    }
});

/* poll controls */
$("#newpollbtn").on('click', showPollMenu);

/* search controls */
$("#library_search").on('click', function() {
    if (!hasPermission("seeplaylist")) {
        $("#searchcontrol .alert").remove();
        var al = makeAlert("Permission Denied",
            "This channel does not allow you to search its library",
            "alert-danger");
        al.find(".alert").insertAfter($("#library_query").parent());
        return;
    }

    socket.emit("searchMedia", {
        source: "library",
        query: $("#library_query").val().toLowerCase()
    });
});

$("#library_query").on('keydown', function(ev) {
    if(ev.keyCode == 13) {
        if (!hasPermission("seeplaylist")) {
            $("#searchcontrol .alert").remove();
            var al = makeAlert("Permission Denied",
                "This channel does not allow you to search its library",
                "alert-danger");
            al.find(".alert").insertAfter($("#library_query").parent());
            return;
        }

        socket.emit("searchMedia", {
            source: "library",
            query: $("#library_query").val().toLowerCase()
        });
    }
});

$("#youtube_search").on('click', function () {
    var query = $("#library_query").val().toLowerCase();
    try {
        parseMediaLink(query);
        makeAlert("Media Link", "If you already have the link, paste it " +
                  "in the 'Media URL' box under Playlist Controls.  This "+
                  "searchbar works like YouTube's search function.",
                  "alert-danger")
            .insertBefore($("#library"));
    } catch (e) {}

    socket.emit("searchMedia", {
        source: "yt",
        query: query
    });
});

/* user playlists */

$("#userpl_save").on('click', function() {
    if($("#userpl_name").val().trim() == "") {
        makeAlert("Invalid Name", "Playlist name cannot be empty", "alert-danger")
            .insertAfter($("#userpl_save").parent());
        return;
    }
    socket.emit("clonePlaylist", {
        name: $("#userpl_name").val()
    });
});

/* video controls */

$("#mediarefresh").on('click', function() {
    PLAYER.mediaType = "";
    PLAYER.mediaId = "";
    // playerReady triggers the server to send a changeMedia.
    // the changeMedia handler then reloads the player
    socket.emit("playerReady");
});

/* playlist controls */

$("#queue").sortable({
    start: function(ev, ui) {
        PL_FROM = ui.item.data("uid");
    },
    update: function(ev, ui) {
        var prev = ui.item.prevAll();
        if(prev.length == 0)
            PL_AFTER = "prepend";
        else
            PL_AFTER = $(prev[0]).data("uid");
        socket.emit("moveMedia", {
            from: PL_FROM,
            after: PL_AFTER
        });
        $("#queue").sortable("cancel");
    }
});
$("#queue").disableSelection();

function queue(pos, src) {
    if (!src) {
        src = "url";
    }

    if (src === "customembed") {
        var title = $("#customembed-title").val();
        if (!title) {
            title = false;
        }
        var content = $("#customembed-content").val();

        socket.emit("queue", {
            id: content,
            title: title,
            pos: pos,
            type: "cu",
            temp: $(".add-temp").prop("checked")
        });
    } else {
        var linkList = $("#mediaurl").val();
        var links = linkList.split(",http").map(function (link, i) {
            if (i > 0) {
                return "http" + link;
            } else {
                return link;
            }
        });

        if (pos === "next") links = links.reverse();
        if (pos === "next" && $("#queue li").length === 0) links.unshift(links.pop());
        var emitQueue = [];
        var addTemp = $(".add-temp").prop("checked");
        var notification = document.getElementById("addfromurl-queue");
        if (!notification) {
            notification = document.createElement("div");
            notification.id = "addfromurl-queue";
            document.getElementById("addfromurl").appendChild(notification);
        }

        links.forEach(function (link) {
            var data;

            try {
                data = parseMediaLink(link);
            } catch (error) {
                Callbacks.queueFail({
                    link: link,
                    msg: error.message
                });
                return;
            }

            var duration = undefined;
            var title = undefined;
            if (data.type === "fi") {
                if (data.id.match(/^http:/)) {
                    Callbacks.queueFail({
                        link: data.id,
                        msg: "Raw files must begin with 'https'.  Plain http is not supported."
                    });
                    return;
                }

                // Explicit checks for kissanime and mega.nz since everyone
                // asks about them
                if (data.id.match(/kissanime|kimcartoon|kisscartoon/i)) {
                    Callbacks.queueFail({
                        link: data.id,
                        msg: "Kisscartoon and Kissanime are not supported.  See https://git.io/vxS9n" +
                             " for more information about why these cannot be supported."
                    });
                    return;
                } else if (data.id.match(/mega\.nz/)) {
                    Callbacks.queueFail({
                        link: data.id,
                        msg: "Mega.nz is not supported.  See https://git.io/fx6fz" +
                             " for more information about why mega.nz cannot be supported."
                    });
                    return;
                }

                // Raw files allow title overrides since the ffprobe tag data
                // is not always correct.
                title = $("#addfromurl-title-val").val();
            }

            if (data.id == null || data.type == null) {
                makeAlert("Error", "Failed to parse link " + link +
                          ".  Please check that it is correct",
                          "alert-danger", true)
                    .insertAfter($("#addfromurl"));
            } else {
                emitQueue.push({
                    id: data.id,
                    type: data.type,
                    pos: pos,
                    duration: duration,
                    title: title,
                    temp: addTemp,
                    link: link
                });
            }
        });

        var nextQueueDelay = 1020;
        function next() {
            var data = emitQueue.shift();
            if (!data) {
                $("#mediaurl").val("");
                $("#addfromurl-title").remove();
                return;
            }

            var link = data.link;
            delete data.link;

            socket.emit("queue", data);
            startQueueSpinner(data);
            if (emitQueue.length > 0) {
                notification.textContent = "Waiting to queue " + emitQueue[0].link;
            } else {
                notification.textContent = "";
            }

            setTimeout(next, nextQueueDelay);
        }

        next();
    }
}

$("#queue_next").on('click', queue.bind(this, "next", "url"));
$("#queue_end").on('click', queue.bind(this, "end", "url"));
$("#ce_queue_next").on('click', queue.bind(this, "next", "customembed"));
$("#ce_queue_end").on('click', queue.bind(this, "end", "customembed"));

$("#mediaurl").on('keyup', function(ev) {
    if (ev.keyCode === 13) {
        queue("end", "url");
    } else {
        var editTitle = false;
        try {
            if (parseMediaLink($("#mediaurl").val()).type === "fi") {
                editTitle = true;
            }
        } catch (error) {
        }

        if (editTitle) {
            var title = $("#addfromurl-title");
            if (title.length === 0) {
                title = $("<div/>")
                    .attr("id", "addfromurl-title")
                    .appendTo($("#addfromurl"));
                $("<span/>").text("Title (optional; for raw files only)")
                    .appendTo(title);
                $("<input/>").addClass("form-control")
                    .attr("type", "text")
                    .attr("id", "addfromurl-title-val")
                    .on('keydown', function (ev) {
                        if (ev.keyCode === 13) {
                            queue("end", "url");
                        }
                    })
                    .appendTo($("#addfromurl-title"));
            }
        } else {
            $("#addfromurl-title").remove();
        }
    }
});

$("#customembed-content").on('keydown', function(ev) {
    if (ev.keyCode === 13) {
        queue("end", "customembed");
    }
});

$("#qlockbtn").on('click', function() {
    socket.emit("togglePlaylistLock");
});

$("#voteskip").on('click', function() {
    socket.emit("voteskip");
    $("#voteskip").attr("disabled", true);
});

$("#getplaylist").on('click', function() {
    var callback = function(data) {
        var idx = socket.listeners("errorMsg").indexOf(errCallback);
        if (idx >= 0) {
            socket.listeners("errorMsg").splice(idx);
        }
        idx = socket.listeners("playlist").indexOf(callback);
        if (idx >= 0) {
            socket.listeners("playlist").splice(idx);
        }
        var list = [];
        for(var i = 0; i < data.length; i++) {
            var entry = formatURL(data[i].media);
            list.push(entry);
        }
        var urls = list.join(",");

        var outer = $("<div/>").addClass("modal fade")
            .appendTo($("body"));
        modal = $("<div/>").addClass("modal-dialog").appendTo(outer);
        modal = $("<div/>").addClass("modal-content").appendTo(modal);
        var head = $("<div/>").addClass("modal-header")
            .appendTo(modal);
        $("<button/>").addClass("close")
            .attr("data-dismiss", "modal")
            .attr("aria-hidden", "true")
            .html("&times;")
            .appendTo(head);
        $("<h3/>").text("Playlist URLs").appendTo(head);
        var body = $("<div/>").addClass("modal-body").appendTo(modal);
        $("<input/>").addClass("form-control").attr("type", "text")
            .val(urls)
            .appendTo(body);
        $("<div/>").addClass("modal-footer").appendTo(modal);
        outer.on("hidden.bs.modal", function() {
            outer.remove();
        });
        outer.modal();
    };
    socket.on("playlist", callback);
    var errCallback = function(data) {
        if (data.code !== "REQ_PLAYLIST_LIMIT_REACHED") {
            return;
        }

        var idx = socket.listeners("errorMsg").indexOf(errCallback);
        if (idx >= 0) {
            socket.listeners("errorMsg").splice(idx);
        }

        idx = socket.listeners("playlist").indexOf(callback);
        if (idx >= 0) {
            socket.listeners("playlist").splice(idx);
        }
    };
    socket.on("errorMsg", errCallback);
    socket.emit("requestPlaylist");
});

$("#clearplaylist").on('click', function() {
    var clear = confirm("Are you sure you want to clear the playlist?");
    if(clear) {
        socket.emit("clearPlaylist");
    }
});

$("#shuffleplaylist").on('click', function() {
    var shuffle = confirm("Are you sure you want to shuffle the playlist?");
    if(shuffle) {
        socket.emit("shufflePlaylist");
    }
});

/* channel ranks stuff */
function chanrankSubmit(rank) {
    var name = $("#cs-chanranks-name").val();
    socket.emit("setChannelRank", {
        name: name,
        rank: rank
    });
}
$("#cs-chanranks-mod").on('click', chanrankSubmit.bind(this, 2));
$("#cs-chanranks-adm").on('click', chanrankSubmit.bind(this, 3));
$("#cs-chanranks-owner").on('click', chanrankSubmit.bind(this, 4));

["#showmediaurl", "#showsearch", "#showcustomembed", "#showplaylistmanager"]
    .forEach(function (id) {
    $(id).on('click', function () {
        var wasActive = $(id).hasClass("active");
        $(".plcontrol-collapse").collapse("hide");
        $("#plcontrol button.active").button("toggle");
        if (!wasActive) {
            $(id).button("toggle");
        }
    });
});
$("#plcontrol button").button();
$("#plcontrol button").button("hide");
$(".plcontrol-collapse").collapse();
$(".plcontrol-collapse").collapse("hide");

$(".cs-checkbox").on('change', function () {
    var box = $(this);
    var key = box.attr("id").replace("cs-", "");
    var value = box.prop("checked");
    var data = {};
    data[key] = value;
    socket.emit("setOptions", data);
});

$(".cs-textbox").on('keyup', function () {
    var box = $(this);
    var key = box.attr("id").replace("cs-", "");
    var value = box.val();
    var lastkey = Date.now();
    box.data("lastkey", lastkey);

    setTimeout(function () {
        if (box.data("lastkey") !== lastkey || box.val() !== value) {
            return;
        }

        var data = {};
        if (key.match(/chat_antiflood_(burst|sustained)/)) {
            data = {
                chat_antiflood_params: {
                    burst: $("#cs-chat_antiflood_burst").val(),
                    sustained: $("#cs-chat_antiflood_sustained").val()
                }
            };
        } else {
            data[key] = value;
        }
        socket.emit("setOptions", data);
    }, 1000);
});

$(".cs-textbox-timeinput").on('keyup', function (event) {
    var box = $(this);
    var key = box.attr("id").replace("cs-", "");
    var value = box.val();
    var lastkey = Date.now();
    box.data("lastkey", lastkey);

    setTimeout(function () {
        if (box.data("lastkey") !== lastkey || box.val() !== value) {
            return;
        }

        $("#cs-textbox-timeinput-validation-error-" + key).remove();
        $(event.target).parent().removeClass("has-error");
        var data = {};
        try {
            data[key] = parseTimeout(value);
        } catch (error) {
            var msg = "Invalid timespan value '" + value + "'.  Please use the format " +
                      "HH:MM:SS or enter a single number for the number of seconds.";
            var validationError = $("<p/>").addClass("text-danger").text(msg)
                    .attr("id", "cs-textbox-timeinput-validation-error-" + key);
            validationError.insertAfter(event.target);
            $(event.target).parent().addClass("has-error");
            return;
        }
        socket.emit("setOptions", data);
    }, 1000);
});

$("#cs-chanlog-refresh").on('click', function () {
    socket.emit("readChanLog");
});

$("#cs-chanlog-filter").on('change', filterChannelLog);

$("#cs-motdsubmit").on('click', function () {
    socket.emit("setMotd", {
        motd: $("#cs-motdtext").val()
    });
});

$("#cs-csssubmit").on('click', function () {
    socket.emit("setChannelCSS", {
        css: $("#cs-csstext").val()
    });
});

$("#cs-jssubmit").on('click', function () {
    socket.emit("setChannelJS", {
        js: $("#cs-jstext").val()
    });
});

$("#cs-chatfilters-newsubmit").on('click', function () {
    var name = $("#cs-chatfilters-newname").val();
    var regex = $("#cs-chatfilters-newregex").val();
    var flags = $("#cs-chatfilters-newflags").val();
    var replace = $("#cs-chatfilters-newreplace").val();
    var entcheck = checkEntitiesInStr(regex);
    if (entcheck) {
        alert("Warning: " + entcheck.src + " will be replaced by " +
              entcheck.replace + " in the message preprocessor.  This " +
              "regular expression may not match what you intended it to " +
              "match.");
    }

    socket.emit("addFilter", {
        name: name,
        source: regex,
        flags: flags,
        replace: replace,
        active: true
    });

    socket.once("addFilterSuccess", function () {
        $("#cs-chatfilters-newname").val("");
        $("#cs-chatfilters-newregex").val("");
        $("#cs-chatfilters-newflags").val("");
        $("#cs-chatfilters-newreplace").val("");
    });
});

$("#cs-emotes-newsubmit").on('click', function () {
    var name = $("#cs-emotes-newname").val();
    var image = $("#cs-emotes-newimage").val();

    socket.emit("updateEmote", {
        name: name,
        image: image,
    });

    $("#cs-emotes-newname").val("");
    $("#cs-emotes-newimage").val("");
});

$("#cs-chatfilters-export").on('click', function () {
    var callback = function (data) {
        socket.listeners("chatFilters").splice(
            socket.listeners("chatFilters").indexOf(callback)
        );

        $("#cs-chatfilters-exporttext").val(JSON.stringify(data));
    };

    socket.on("chatFilters", callback);
    socket.emit("requestChatFilters");
});

$("#cs-chatfilters-import").on('click', function () {
    var text = $("#cs-chatfilters-exporttext").val();
    var choose = confirm("You are about to import filters from the contents of the textbox below the import button.  If this is empty, it will clear all of your filters.  Are you sure you want to continue?");
    if (!choose) {
        return;
    }

    if (text.trim() === "") {
        text = "[]";
    }

    var data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        alert("Invalid import data: " + e);
        return;
    }

    socket.emit("importFilters", data);
});

$("#cs-emotes-export").on('click', function () {
    var em = CHANNEL.emotes.map(function (f) {
        return {
            name: f.name,
            image: f.image
        };
    });
    $("#cs-emotes-exporttext").val(JSON.stringify(em));
});

$("#cs-emotes-import").on('click', function () {
    var text = $("#cs-emotes-exporttext").val();
    var choose = confirm("You are about to import emotes from the contents of the textbox below the import button.  If this is empty, it will clear all of your emotes.  Are you sure you want to continue?");
    if (!choose) {
        return;
    }

    if (text.trim() === "") {
        text = "[]";
    }

    var data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        alert("Invalid import data: " + e);
        return;
    }

    socket.emit("importEmotes", data);
});

var toggleUserlist = function () {
    var direction = !USEROPTS.layout.match(/synchtube/) ? "glyphicon-chevron-right" : "glyphicon-chevron-left"
    if ($("#userlist")[0].style.display === "none") {
        $("#userlist").show();
        $("#userlisttoggle").removeClass(direction).addClass("glyphicon-chevron-down");
    } else {
        $("#userlist").hide();
        $("#userlisttoggle").removeClass("glyphicon-chevron-down").addClass(direction);
    }
    scrollChat();
};

$("#usercount").on('click', toggleUserlist);
$("#userlisttoggle").on('click', toggleUserlist);

$(".add-temp").on('change', function () {
    $(".add-temp").prop("checked", $(this).prop("checked"));
});

/*
 * Fixes #417 which is caused by changes in Bootstrap 3.3.0
 * (see twbs/bootstrap#15136)
 *
 * Whenever the active tab in channel options is changed,
 * the modal must be updated so that the backdrop is resized
 * appropriately.
 */
$("#channeloptions li > a[data-toggle='tab']").on("shown.bs.tab", function () {
    $("#channeloptions").data("bs.modal").handleUpdate();
});

applyOpts();

(function () {
    var embed = document.querySelector("#videowrap .embed-responsive");
    if (!embed) {
        return;
    }

    if (typeof window.MutationObserver === "function") {
        var mr = new MutationObserver(function (records) {
            records.forEach(function (record) {
                if (record.type !== "childList") return;
                if (!record.addedNodes || record.addedNodes.length === 0) return;

                var elem = record.addedNodes[0];
                if (elem.id === "ytapiplayer") handleVideoResize();
            });
        });

        mr.observe(embed, { childList: true });
    } else {
        /*
         * DOMNodeInserted is deprecated.  This code is here only as a fallback
         * for browsers that do not support MutationObserver
         */
        embed.addEventListener("DOMNodeInserted", function (ev) {
            if (ev.target.id === "ytapiplayer") handleVideoResize();
        });
    }
})();

var EMOTELISTMODAL = $("#emotelist");
EMOTELISTMODAL.find(".emotelist-alphabetical").change(function () {
    USEROPTS.emotelist_sort = this.checked;
    setOpt("emotelist_sort", USEROPTS.emotelist_sort);
});
EMOTELISTMODAL.find(".emotelist-alphabetical").prop("checked", USEROPTS.emotelist_sort);

/* emote browser panel */
var EMOTE_BROWSER_OFFSET = 0;
var EMOTE_BROWSER_BATCH = 40;
var EMOTE_BROWSER_FILTER = '';

$('body').append(
    '<div id="emote-browser">' +
    '<input id="emote-browser-search" class="form-control input-sm" type="text" placeholder="Search emotes…">' +
    '<div id="emote-browser-grid"></div>' +
    '<div class="emote-browser-resize-handle ne" data-dir="ne"></div>' +
    '<div class="emote-browser-resize-handle nw" data-dir="nw"></div>' +
    '<div class="emote-browser-resize-handle se" data-dir="se"></div>' +
    '<div class="emote-browser-resize-handle sw" data-dir="sw"></div>' +
    '</div>'
);

function updateEmoteBrowserScale() {
    var panel = document.getElementById('emote-browser');
    if (!panel) return;

    var panelWidth = panel.clientWidth;
    var panelHeight = panel.clientHeight;
    var itemByWidth = Math.floor((panelWidth - 48) / 6);
    var itemByHeight = Math.floor((panelHeight - 90) / 4);
    var itemSize = Math.max(40, Math.min(88, itemByWidth, itemByHeight));
    var imageSize = Math.max(36, itemSize - 4);

    panel.style.setProperty('--emote-browser-item-size', itemSize + 'px');
    panel.style.setProperty('--emote-browser-image-size', imageSize + 'px');
}

function emoteBrowserMatches() {
    if (!CHANNEL.emotes) return [];
    var f = EMOTE_BROWSER_FILTER.toLowerCase();
    return f ? CHANNEL.emotes.filter(function(e) { return e.name.toLowerCase().indexOf(f) !== -1; })
             : CHANNEL.emotes;
}

function emoteBrowserRenderMore() {
    var matches = emoteBrowserMatches();
    var end = Math.min(EMOTE_BROWSER_OFFSET + EMOTE_BROWSER_BATCH, matches.length);
    var grid = document.getElementById('emote-browser-grid');
    for (var i = EMOTE_BROWSER_OFFSET; i < end; i++) {
        (function(emote) {
            var item = document.createElement('div');
            item.className = 'emote-browser-item';
            item.title = emote.name;
            var img = document.createElement('img');
            img.src = emote.image;
            item.appendChild(img);
            item.addEventListener('click', function() {
                var cl = document.getElementById('chatline');
                var val = cl.value;
                if (val && !val.charAt(val.length - 1).match(/\s/)) val += ' ';
                cl.value = val + emote.name;
                $("#emote-browser").hide();
                cl.focus();
            });
            grid.appendChild(item);
        })(matches[i]);
    }
    EMOTE_BROWSER_OFFSET = end;
}

function emoteBrowserReset() {
    EMOTE_BROWSER_OFFSET = 0;
    document.getElementById('emote-browser-grid').innerHTML = '';
    emoteBrowserRenderMore();
}

function emoteBrowserPosition() {
    var btn = $("#emotelistbtn"), off = btn.offset();
    var panel = $("#emote-browser");
    var pw = panel.outerWidth(), ph = panel.outerHeight();
    var ww = $(window).width(), wh = $(window).height();
    var left = off.left;
    if (left + pw > ww - 8) left = Math.max(8, off.left + btn.outerWidth() - pw);
    var top = off.top - ph - 4;
    if (top < 8) top = off.top + btn.outerHeight() + 4;
    panel.css({ top: top, left: left });
}

function clampEmoteBrowserToViewport() {
    var panel = document.getElementById('emote-browser');
    if (!panel) return;

    var rect = panel.getBoundingClientRect();
    var maxLeft = window.innerWidth - rect.width - 8;
    var maxTop = window.innerHeight - rect.height - 8;
    var left = Math.min(Math.max(rect.left, 8), Math.max(8, maxLeft));
    var top = Math.min(Math.max(rect.top, 8), Math.max(8, maxTop));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
}

$(document).on('mousedown', '#emote-browser .emote-browser-resize-handle', function (ev) {
    ev.preventDefault();
    ev.stopPropagation();

    var panel = document.getElementById('emote-browser');
    var dir = ev.target.getAttribute('data-dir');
    if (!panel || !dir) return;

    var startX = ev.clientX;
    var startY = ev.clientY;
    var startRect = panel.getBoundingClientRect();
    var minW = 260, minH = 220;
    var maxW = Math.floor(window.innerWidth * 0.9);
    var maxH = Math.floor(window.innerHeight * 0.85);

    function onMove(moveEv) {
        var dx = moveEv.clientX - startX;
        var dy = moveEv.clientY - startY;
        var left = startRect.left;
        var top = startRect.top;
        var width = startRect.width;
        var height = startRect.height;

        if (dir.indexOf('e') !== -1) {
            width = Math.max(minW, Math.min(maxW, startRect.width + dx));
        }
        if (dir.indexOf('s') !== -1) {
            height = Math.max(minH, Math.min(maxH, startRect.height + dy));
        }
        if (dir.indexOf('w') !== -1) {
            width = Math.max(minW, Math.min(maxW, startRect.width - dx));
            left = startRect.right - width;
        }
        if (dir.indexOf('n') !== -1) {
            height = Math.max(minH, Math.min(maxH, startRect.height - dy));
            top = startRect.bottom - height;
        }

        panel.style.left = Math.max(8, left) + 'px';
        panel.style.top = Math.max(8, top) + 'px';
        panel.style.width = width + 'px';
        panel.style.height = height + 'px';
        updateEmoteBrowserScale();
        clampEmoteBrowserToViewport();
    }

    function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
});

$("#emotelistbtn").on('click', function () {
    var panel = $("#emote-browser");
    if (panel.is(':visible')) { panel.hide(); return; }
    EMOTE_BROWSER_FILTER = '';
    $("#emote-browser-search").val('');
    emoteBrowserReset();
    panel.show();
    updateEmoteBrowserScale();
    emoteBrowserPosition();
    clampEmoteBrowserToViewport();
    document.getElementById('emote-browser-search').focus();
});

$(document).on('click.emotebrowser', function (e) {
    if (!$(e.target).closest('#emote-browser, #emotelistbtn').length)
        $("#emote-browser").hide();
});

$(document).on('input', '#emote-browser-search', function () {
    EMOTE_BROWSER_FILTER = this.value;
    emoteBrowserReset();
});

document.getElementById('emote-browser-grid').addEventListener('scroll', function () {
    if (this.scrollTop + this.clientHeight >= this.scrollHeight - 60)
        emoteBrowserRenderMore();
});

$(window).on('resize', function () {
    updateEmoteBrowserScale();
    if ($("#emote-browser").is(':visible')) {
        clampEmoteBrowserToViewport();
    }
});

$("#fullscreenbtn").on('click', function () {
    var elem = document.querySelector("#videowrap .embed-responsive");
    // this shit is why frontend web development sucks
    var fn = elem.requestFullscreen ||
        elem.mozRequestFullScreen || // Mozilla has to be different and use a capital 'S'
        elem.webkitRequestFullscreen ||
        elem.msRequestFullscreen;

    if (fn) {
        fn.call(elem);
    }
});

function handleCSSJSTooLarge(selector) {
    if (this.value.length > 20000) {
        let notice = document.querySelector(selector);
        if (notice !== null) {
            return;
        }

        notice = makeAlert("Maximum Size Exceeded", "Inline CSS and JavaScript are " +
                "limited to 20,000 characters or less.  If you need more room, you " +
                "need to use the external CSS or JavaScript option.", "alert-danger")
                .attr("id", selector.replace(/#/, ""));

        // makeAlert returns jQuery
        this.parentNode.insertBefore(notice[0], this);
    } else {
        let notice = document.querySelector(selector);
        notice?.remove();
    }
}

['#cs-csstext', '#cs-jstext'].forEach((selector)=>{
    elem = document.querySelector(selector);
    elem.addEventListener('input', handleCSSJSTooLarge.bind(elem, `${selector}-too-big`));
});

$("#resize-video-larger").on('click', function () {
    try {
        CyTube.ui.changeVideoWidth(1);
    } catch (error) {
        console.error(error);
    }
});

$("#resize-video-smaller").on('click', function () {
    try {
        CyTube.ui.changeVideoWidth(-1);
    } catch (error) {
        console.error(error);
    }
});

var CSTBots = (function () {
    function apiBase() {
        return '/api/v1/channels/' + CHANNEL.name;
    }

    function load() {
        $.getJSON(apiBase() + '/bots', function (bots) {
            var tbody = $('#cs-bots-list').empty();
            bots.forEach(function (bot) {
                var lastConn = bot.last_connected
                    ? new Date(bot.last_connected).toLocaleString()
                    : 'Never';
                var rankLabel = bot.rank >= 5 ? 'Creator' : bot.rank >= 4 ? 'Owner' : bot.rank >= 3 ? 'Admin' : 'Mod';
                var row = $('<tr>');
                if (bot.active) {
                    row.append($('<td>').append(
                        $('<button class="btn btn-xs btn-danger">').text('Revoke')
                            .on('click', function () { revoke(bot.id); })
                    ));
                } else {
                    row.append($('<td>').append($('<span class="text-muted">').text('Revoked')));
                }
                row.append($('<td>').text(bot.name));
                row.append($('<td>').text(rankLabel + ' (' + bot.rank + ')'));
                row.append($('<td>').text(bot.created_by));
                row.append($('<td>').text(lastConn));
                tbody.append(row);
            });
        }).fail(function () {
            $('#cs-bots-list').html('<tr><td colspan="5" class="text-danger">Failed to load bots</td></tr>');
        });
    }

    function revoke(id) {
        if (!confirm('Revoke this bot token? Any connected bot will be disconnected immediately.')) return;
        $.ajax({
            url: apiBase() + '/bots/' + id,
            method: 'DELETE'
        }).done(function () {
            load();
        }).fail(function (xhr) {
            alert('Failed to revoke: ' + (xhr.responseJSON && xhr.responseJSON.error || xhr.statusText));
        });
    }

    $('#cs-bots-issue').on('click', function () {
        var name = $('#cs-bots-name').val().trim();
        var rank = parseInt($('#cs-bots-rank').val(), 10);
        if (!name) { alert('Bot name is required'); return; }
        $.ajax({
            url: apiBase() + '/bots',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ name: name, rank: rank })
        }).done(function (data) {
            $('#cs-bots-token-value').text(data.token);
            $('.cs-bots-token-result').show();
            $('#cs-bots-name').val('');
            load();
        }).fail(function (xhr) {
            alert('Failed to create bot: ' + (xhr.responseJSON && xhr.responseJSON.error || xhr.statusText));
        });
    });

    $('.cs-bots-copy').on('click', function () {
        var text = $('#cs-bots-token-value').text();
        navigator.clipboard.writeText(text).catch(function () {
            var el = document.getElementById('cs-bots-token-value');
            var range = document.createRange();
            range.selectNodeContents(el);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
        });
    });

    return { load: load };
})();

var CSTShows = (function () {
    var selectedId = null;
    var draftPlaylist = [];
    var timezoneOptionsLoaded = false;
    var resolvingTitles = false;

    function apiBase() {
        return '/api/v1/channels/' + CHANNEL.name + '/shows';
    }

    function loadTimezoneOptions() {
        if (timezoneOptionsLoaded) return;
        timezoneOptionsLoaded = true;
        var select = $('#cs-shows-timezone').empty();
        var tzs = [];
        if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
            try {
                tzs = Intl.supportedValuesOf('timeZone') || [];
            } catch (_err) {
                tzs = [];
            }
        }
        if (!tzs.length) {
            tzs = [
                'UTC',
                'Europe/Berlin',
                'Europe/London',
                'America/New_York',
                'America/Chicago',
                'America/Denver',
                'America/Los_Angeles',
                'Asia/Tokyo',
                'Asia/Kolkata',
                'Australia/Sydney'
            ];
        }
        tzs.forEach(function (tz) {
            $('<option>').attr('value', tz).text(tz).appendTo(select);
        });
    }

    function toLocalDateInput(ms) {
        if (!ms) return '';
        var d = new Date(ms);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '-' +
            pad(d.getMonth() + 1) + '-' +
            pad(d.getDate()) + 'T' +
            pad(d.getHours()) + ':' +
            pad(d.getMinutes());
    }

    function renderDraftPlaylist() {
        var ul = $('#cs-shows-playlist-list').empty();
        if (!draftPlaylist.length) {
            ul.append('<li class="queue_entry text-muted">No items in show playlist</li>');
            return;
        }

        draftPlaylist.forEach(function (item, idx) {
            var li = $('<li class="queue_entry">').attr('data-idx', idx);
            var title = item.title || item.id || (item.type + ':' + item.id);
            $('<span>').text('[' + item.type + '] ' + title).appendTo(li);
            var controls = $('<div class="btn-group pull-right">').appendTo(li);
            $('<button class="btn btn-xs btn-default" type="button" title="Move up">')
                .html('<span class="glyphicon glyphicon-arrow-up"></span>')
                .on('click', function () {
                    if (idx <= 0) return;
                    var tmp = draftPlaylist[idx - 1];
                    draftPlaylist[idx - 1] = draftPlaylist[idx];
                    draftPlaylist[idx] = tmp;
                    renderDraftPlaylist();
                })
                .appendTo(controls);
            $('<button class="btn btn-xs btn-default" type="button" title="Move down">')
                .html('<span class="glyphicon glyphicon-arrow-down"></span>')
                .on('click', function () {
                    if (idx >= draftPlaylist.length - 1) return;
                    var tmp = draftPlaylist[idx + 1];
                    draftPlaylist[idx + 1] = draftPlaylist[idx];
                    draftPlaylist[idx] = tmp;
                    renderDraftPlaylist();
                })
                .appendTo(controls);
            $('<button class="btn btn-xs btn-danger" type="button" title="Remove">')
                .html('<span class="glyphicon glyphicon-remove"></span>')
                .on('click', function () {
                    draftPlaylist.splice(idx, 1);
                    renderDraftPlaylist();
                })
                .appendTo(controls);
            ul.append(li);
        });
    }

    function resolveDraftTitles() {
        if (resolvingTitles || draftPlaylist.length === 0) {
            return;
        }

        var unresolved = draftPlaylist.filter(function (item) {
            return !item.title || item.title === item.id;
        }).map(function (item) {
            return { id: item.id, type: item.type };
        });

        if (unresolved.length === 0) {
            return;
        }

        resolvingTitles = true;
        $.ajax({
            url: apiBase() + '/resolve-media',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ items: unresolved })
        }).done(function (data) {
            var map = {};
            (data.items || []).forEach(function (item) {
                map[item.type + ':' + item.id] = item.title || item.id;
            });

            draftPlaylist.forEach(function (item) {
                var key = item.type + ':' + item.id;
                if (map[key]) {
                    item.title = map[key];
                }
            });
            renderDraftPlaylist();
        }).always(function () {
            resolvingTitles = false;
        });
    }

    function addUrlToDraft(pos) {
        var raw = $('#cs-shows-mediaurl').val();
        if (!raw) {
            return;
        }

        var links = raw.trim().split(/\s+/).filter(function (x) { return x.trim() !== ''; });
        if (links.length === 0) return;

        var added = 0;
        var duplicates = 0;
        var parseFail = 0;

        links.forEach(function (link) {
            var media = parseMediaLink(link);
            if (!media || !media.id || !media.type) {
                parseFail++;
                return;
            }

            var isDupe = draftPlaylist.some(function (item) {
                return item.id === media.id && item.type === media.type;
            });
            if (isDupe) {
                duplicates++;
                return;
            }

            var entry = {
                id: media.id,
                type: media.type,
                title: media.id,
                pos: pos === 'next' ? 'next' : 'end'
            };

            if (pos === 'next') {
                draftPlaylist.unshift(entry);
            } else {
                draftPlaylist.push(entry);
            }
            added++;
        });

        $('#cs-shows-mediaurl').val('');
        renderDraftPlaylist();
        resolveDraftTitles();

        if (parseFail > 0 || duplicates > 0) {
            var parts = [];
            if (added > 0) parts.push('added ' + added);
            if (duplicates > 0) parts.push('skipped duplicates ' + duplicates);
            if (parseFail > 0) parts.push('failed to parse ' + parseFail);
            alert(parts.join(', '));
        }
    }

    function readFormPayload() {
        var scheduledRaw = $('#cs-shows-scheduled-for').val();
        var timezone = $('#cs-shows-timezone').val().trim();
        if (!timezone) {
            timezone = 'UTC';
        }
        return {
            name: $('#cs-shows-name').val().trim(),
            scheduled_for: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
            timezone: timezone,
            recurrence: $('#cs-shows-recurrence').val(),
            fill_mode: $('#cs-shows-fill-mode').val(),
            conflict_mode: $('#cs-shows-conflict-mode').val(),
            start_playback: $('#cs-shows-start-playback').prop('checked'),
            playlist: draftPlaylist.map(function (item) {
                return { id: item.id, type: item.type, pos: item.pos || 'end' };
            }),
            status: 'scheduled'
        };
    }

    function clearForm() {
        loadTimezoneOptions();
        selectedId = null;
        $('#cs-shows-name').val('');
        $('#cs-shows-scheduled-for').val('');
        var detectedTz = 'UTC';
        if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
            detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        }
        if ($('#cs-shows-timezone option[value="' + detectedTz + '"]').length === 0) {
            $('<option>').attr('value', detectedTz).text(detectedTz).appendTo('#cs-shows-timezone');
        }
        $('#cs-shows-timezone').val(detectedTz);
        $('#cs-shows-recurrence').val('none');
        $('#cs-shows-fill-mode').val('append');
        $('#cs-shows-conflict-mode').val('force');
        $('#cs-shows-start-playback').prop('checked', false);
        $('#cs-shows-mediaurl').val('');
        draftPlaylist = [];
        renderDraftPlaylist();
    }

    function selectShow(show) {
        loadTimezoneOptions();
        selectedId = show.id;
        $('#cs-shows-name').val(show.name);
        $('#cs-shows-scheduled-for').val(toLocalDateInput(show.scheduled_for));
        var showTz = show.timezone || 'UTC';
        if ($('#cs-shows-timezone option[value="' + showTz + '"]').length === 0) {
            $('<option>').attr('value', showTz).text(showTz).appendTo('#cs-shows-timezone');
        }
        $('#cs-shows-timezone').val(showTz);
        $('#cs-shows-recurrence').val(show.recurrence || 'none');
        $('#cs-shows-fill-mode').val(show.fill_mode || 'append');
        $('#cs-shows-conflict-mode').val(show.conflict_mode || 'force');
        $('#cs-shows-start-playback').prop('checked', !!show.start_playback);
        draftPlaylist = (show.playlist || []).map(function (item) {
            return {
                id: item.id,
                type: item.type,
                title: item.id,
                pos: item.pos || 'end'
            };
        });
        renderDraftPlaylist();
        resolveDraftTitles();
    }

    function action(id, actionName) {
        $.ajax({
            url: apiBase() + '/' + id + '/action',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ action: actionName })
        }).done(function () {
            load();
        }).fail(function (xhr) {
            alert('Failed action: ' + ((xhr.responseJSON && xhr.responseJSON.error) || xhr.statusText));
        });
    }

    function render(shows) {
        var tbody = $('#cs-shows-list').empty();
        if (!shows.length) {
            tbody.append('<tr><td colspan="6" class="text-muted">No shows configured</td></tr>');
            return;
        }

        shows.forEach(function (show) {
            var row = $('<tr>');
            row.append($('<td>').append(
                $('<a href=\"javascript:void(0)\">').text(show.name).on('click', function () { selectShow(show); })
            ));
            row.append($('<td>').text(show.status));
            row.append($('<td>').text(show.next_run_at ? new Date(show.next_run_at).toLocaleString(undefined, { timeZone: show.timezone || 'UTC' }) : 'N/A'));
            row.append($('<td>').text(show.timezone || 'UTC'));
            row.append($('<td>').text(show.recurrence || 'none'));

            var actions = $('<td>');
            $('<button class=\"btn btn-xs btn-primary\" style=\"margin-right:4px\">Run</button>')
                .on('click', function () { action(show.id, 'run'); })
                .appendTo(actions);
            $('<button class=\"btn btn-xs btn-default\" style=\"margin-right:4px\">Pause</button>')
                .on('click', function () { action(show.id, 'pause'); })
                .appendTo(actions);
            $('<button class=\"btn btn-xs btn-success\" style=\"margin-right:4px\">Resume</button>')
                .on('click', function () { action(show.id, 'resume'); })
                .appendTo(actions);
            $('<button class=\"btn btn-xs btn-warning\" style=\"margin-right:4px\">Cancel</button>')
                .on('click', function () { action(show.id, 'cancel'); })
                .appendTo(actions);
            $('<button class=\"btn btn-xs btn-danger\">Delete</button>')
                .on('click', function () {
                    if (!confirm('Delete this show?')) return;
                    $.ajax({ url: apiBase() + '/' + show.id, method: 'DELETE' })
                        .done(load)
                        .fail(function (xhr) {
                            alert('Delete failed: ' + ((xhr.responseJSON && xhr.responseJSON.error) || xhr.statusText));
                        });
                })
                .appendTo(actions);
            row.append(actions);
            tbody.append(row);
        });
    }

    function load() {
        $.getJSON(apiBase(), render).fail(function () {
            $('#cs-shows-list').html('<tr><td colspan=\"6\" class=\"text-danger\">Failed to load shows</td></tr>');
        });
    }

    $('#cs-shows-create').on('click', function () {
        var payload = readFormPayload();

        $.ajax({
            url: apiBase(),
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).done(function () {
            clearForm();
            load();
        }).fail(function (xhr) {
            alert('Create failed: ' + ((xhr.responseJSON && xhr.responseJSON.error) || xhr.statusText));
        });
    });

    $('#cs-shows-update').on('click', function () {
        if (!selectedId) {
            alert('Select a show first');
            return;
        }

        var payload = readFormPayload();

        $.ajax({
            url: apiBase() + '/' + selectedId,
            method: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(payload)
        }).done(function () {
            load();
        }).fail(function (xhr) {
            alert('Update failed: ' + ((xhr.responseJSON && xhr.responseJSON.error) || xhr.statusText));
        });
    });

    $('#cs-shows-add-next').on('click', function () { addUrlToDraft('next'); });
    $('#cs-shows-add-end').on('click', function () { addUrlToDraft('end'); });
    $('#cs-shows-mediaurl').on('keyup', function (ev) {
        if (ev.keyCode === 13) {
            addUrlToDraft('end');
        }
    });
    $('#cs-shows-clear').on('click', clearForm);
    $('#cs-shows-playlist-list').sortable({
        update: function () {
            var nextDraft = [];
            $('#cs-shows-playlist-list > li').each(function () {
                var idx = parseInt($(this).attr('data-idx'), 10);
                if (!isNaN(idx) && draftPlaylist[idx]) {
                    nextDraft.push(draftPlaylist[idx]);
                }
            });
            if (nextDraft.length === draftPlaylist.length) {
                draftPlaylist = nextDraft;
                renderDraftPlaylist();
            }
        }
    }).disableSelection();
    renderDraftPlaylist();
    clearForm();

    return { load: load };
})();
