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

$(window).focus(CyTube.ui.onPageFocus).blur(CyTube.ui.onPageBlur);
// See #783
$(".modal").focus(CyTube.ui.onPageFocus);

$("#togglemotd").click(function () {
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

$("#modflair").click(function () {
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

$("#usercount").mouseenter(function (ev) {
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

$("#usercount").mousemove(function (ev) {
    var popup = $("#usercount").find(".profile-box");
    if(popup.length == 0)
        return;

    popup.css("top", (ev.clientY + 5) + "px");
    popup.css("left", (ev.clientX) + "px");
});

$("#usercount").mouseleave(function () {
    $("#usercount").find(".profile-box").remove();
});

$("#messagebuffer").scroll(function (ev) {
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

$("#guestname").keydown(function (ev) {
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

$("#chatline").keydown(function(ev) {
    // Enter/return
    if(ev.keyCode == 13) {
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
$("#newpollbtn").click(showPollMenu);

/* search controls */
$("#library_search").click(function() {
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

$("#library_query").keydown(function(ev) {
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

$("#youtube_search").click(function () {
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

$("#userpl_save").click(function() {
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

$("#mediarefresh").click(function() {
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

$("#queue_next").click(queue.bind(this, "next", "url"));
$("#queue_end").click(queue.bind(this, "end", "url"));
$("#ce_queue_next").click(queue.bind(this, "next", "customembed"));
$("#ce_queue_end").click(queue.bind(this, "end", "customembed"));

$("#mediaurl").keyup(function(ev) {
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
                    .keydown(function (ev) {
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

$("#customembed-content").keydown(function(ev) {
    if (ev.keyCode === 13) {
        queue("end", "customembed");
    }
});

$("#qlockbtn").click(function() {
    socket.emit("togglePlaylistLock");
});

$("#voteskip").click(function() {
    socket.emit("voteskip");
    $("#voteskip").attr("disabled", true);
});

$("#getplaylist").click(function() {
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

$("#clearplaylist").click(function() {
    var clear = confirm("Are you sure you want to clear the playlist?");
    if(clear) {
        socket.emit("clearPlaylist");
    }
});

$("#shuffleplaylist").click(function() {
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
$("#cs-chanranks-mod").click(chanrankSubmit.bind(this, 2));
$("#cs-chanranks-adm").click(chanrankSubmit.bind(this, 3));
$("#cs-chanranks-owner").click(chanrankSubmit.bind(this, 4));

["#showmediaurl", "#showsearch", "#showcustomembed", "#showplaylistmanager"]
    .forEach(function (id) {
    $(id).click(function () {
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

$(".cs-checkbox").change(function () {
    var box = $(this);
    var key = box.attr("id").replace("cs-", "");
    var value = box.prop("checked");
    var data = {};
    data[key] = value;
    socket.emit("setOptions", data);
});

$(".cs-textbox").keyup(function () {
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

$(".cs-textbox-timeinput").keyup(function (event) {
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

$("#cs-chanlog-refresh").click(function () {
    socket.emit("readChanLog");
});

$("#cs-chanlog-filter").change(filterChannelLog);

$("#cs-motdsubmit").click(function () {
    socket.emit("setMotd", {
        motd: $("#cs-motdtext").val()
    });
});

$("#cs-csssubmit").click(function () {
    socket.emit("setChannelCSS", {
        css: $("#cs-csstext").val()
    });
});

$("#cs-jssubmit").click(function () {
    socket.emit("setChannelJS", {
        js: $("#cs-jstext").val()
    });
});

$("#cs-chatfilters-newsubmit").click(function () {
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

$("#cs-emotes-newsubmit").click(function () {
    var name = $("#cs-emotes-newname").val();
    var image = $("#cs-emotes-newimage").val();

    socket.emit("updateEmote", {
        name: name,
        image: image,
    });

    $("#cs-emotes-newname").val("");
    $("#cs-emotes-newimage").val("");
});

$("#cs-chatfilters-export").click(function () {
    var callback = function (data) {
        socket.listeners("chatFilters").splice(
            socket.listeners("chatFilters").indexOf(callback)
        );

        $("#cs-chatfilters-exporttext").val(JSON.stringify(data));
    };

    socket.on("chatFilters", callback);
    socket.emit("requestChatFilters");
});

$("#cs-chatfilters-import").click(function () {
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

$("#cs-emotes-export").click(function () {
    var em = CHANNEL.emotes.map(function (f) {
        return {
            name: f.name,
            image: f.image
        };
    });
    $("#cs-emotes-exporttext").val(JSON.stringify(em));
});

$("#cs-emotes-import").click(function () {
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

$("#usercount").click(toggleUserlist);
$("#userlisttoggle").click(toggleUserlist);

$(".add-temp").change(function () {
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
$("#emotelistbtn").click(function () {
    EMOTELISTMODAL.modal();
});

EMOTELISTMODAL.find(".emotelist-alphabetical").change(function () {
    USEROPTS.emotelist_sort = this.checked;
    setOpt("emotelist_sort", USEROPTS.emotelist_sort);
});
EMOTELISTMODAL.find(".emotelist-alphabetical").prop("checked", USEROPTS.emotelist_sort);

$("#fullscreenbtn").click(function () {
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
        var warning = $(selector);
        if (warning.length > 0) {
            return;
        }

        warning = makeAlert("Maximum Size Exceeded", "Inline CSS and JavaScript are " +
                "limited to 20,000 characters or less.  If you need more room, you " +
                "need to use the external CSS or JavaScript option.", "alert-danger")
                .attr("id", selector.replace(/#/, ""));
        warning.insertBefore(this);
    } else {
        $(selector).remove();
    }
}

$("#cs-csstext").bind("input", handleCSSJSTooLarge.bind($("#cs-csstext")[0],
        "#cs-csstext-too-big"));
$("#cs-jstext").bind("input", handleCSSJSTooLarge.bind($("#cs-jstext")[0],
        "#cs-jstext-too-big"));

$("#resize-video-larger").click(function () {
    try {
        CyTube.ui.changeVideoWidth(1);
    } catch (error) {
        console.error(error);
    }
});

$("#resize-video-smaller").click(function () {
    try {
        CyTube.ui.changeVideoWidth(-1);
    } catch (error) {
        console.error(error);
    }
});
