/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/* window focus/blur */
$(window).focus(function() {
    FOCUSED = true;
    clearInterval(TITLE_BLINK);
    TITLE_BLINK = false;
    document.title = PAGETITLE;
}).blur(function() {
    FOCUSED = false;
});

/* Generalized show/hide function */
function generateToggle(chevron, div) {
    $(chevron).click(function() {
        if($(div).css("display") == "none") {
            $(chevron).html($(chevron).html().replace(/Show/, "Hide"));
            $(div).show();
            $(chevron+" i").removeClass("icon-plus")
                .addClass("icon-minus");
        }
        else {
            $(chevron).html($(chevron).html().replace(/Hide/, "Show"));
            $(div).hide();
            $(chevron+" i").removeClass("icon-minus")
                .addClass("icon-plus");
        }
    });
}

/* setup show/hide toggles */
generateToggle("#usercount", "#userlist");
generateToggle("#userlisttoggle", "#userlist");
$("#usercountwrap").click(scrollChat);
generateToggle("#librarytoggle", "#librarywrap");
generateToggle("#userpltoggle", "#userplaylistwrap");
generateToggle("#playlisttoggle", "#playlist_controls");

$("#togglemotd").click(function () {
    var hidden = $("#motd").css("display") === "none";
    $("#motd").toggle();
    if (hidden) {
        $("#togglemotd").find(".icon-plus")
            .removeClass("icon-plus")
            .addClass("icon-minus");
    } else {
        $("#togglemotd").find(".icon-minus")
            .removeClass("icon-minus")
            .addClass("icon-plus");
    }
});

/* navbar stuff */
$("#optlink").click(showOptionsMenu);
$("#chatonly").click(chatOnly);

function guestLogin() {
    socket.emit("login", {
        name: $("#guestname").val(),
    });
}
$("#guestlogin").click(guestLogin);
$("#guestname").keydown(function(ev) {
    if(ev.keyCode == 13) {
        guestLogin();
    }
});

$("#login").click(showLoginMenu);
$("#logout").click(function() {
    eraseCookie("cytube_name");
    eraseCookie("cytube_session");
    document.location.reload(true);
});

/* chatbox */

$("#modflair").click(function () {
    var m = $("#modflair");
    if (m.hasClass("label-success")) {
        USEROPTS.modhat = false;
        m.removeClass("label-success")
         .addClass("label-default");
    } else {
        USEROPTS.modhat = true;
        m.removeClass("label-default")
         .addClass("label-success");
    }
});

$("#adminflair").click(function () {
    var m = $("#adminflair");
    if (m.hasClass("label-important")) {
        USEROPTS.adminhat = false;
        m.removeClass("label-important")
         .addClass("label-default");
    } else {
        USEROPTS.adminhat = true;
        m.removeClass("label-default")
         .addClass("label-important");
    }
});

$("#usercount").mouseenter(function (ev) {
    var breakdown = calcUserBreakdown();
    // re-using profile-box class for convenience
    var popup = $("<div/>")
        .addClass("profile-box")
        .css("top", (ev.pageY + 5) + "px")
        .css("left", (ev.pageX) + "px")
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

    popup.css("top", (ev.pageY + 5) + "px");
    popup.css("left", (ev.pageX) + "px");
});

$("#usercount").mouseleave(function () {
    $("#usercount").find(".profile-box").remove();
});

$("#messagebuffer").mouseenter(function() { SCROLLCHAT = false; });
$("#messagebuffer").mouseleave(function() { SCROLLCHAT = true; });

$("#chatline").keydown(function(ev) {
    if(ev.keyCode == 13) {
        var msg = $("#chatline").val();
        if(msg.trim()) {
            if (USEROPTS.adminhat && CLIENT.rank >= 255) {
                msg = "/a " + msg;
            } else if(USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {
                msg = "/m " + msg;
            }
            socket.emit("chatMsg", {
                msg: msg
            });
            CHATHIST.push($("#chatline").val());
            CHATHISTIDX = CHATHIST.length;
            $("#chatline").val("");
        }
        return;
    }
    else if(ev.keyCode == 9) {
        var words = $("#chatline").val().split(" ");
        var current = words[words.length - 1].toLowerCase();
        var users = $("#userlist").children();
        var match = null;
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerHTML.toLowerCase();
            if(name.indexOf(current) == 0 && match == null) {
                match = users[i].children[1].innerHTML;
            }
            else if(name.indexOf(current) == 0) {
                match = null;
                break;
            }
        }
        if(match != null) {
            words[words.length - 1] = match;
            if(words.length == 1)
                words[0] += ": ";
            else
                words[words.length - 1] += " ";
            $("#chatline").val(words.join(" "));
        }
        ev.preventDefault();
        return false;
    }
    else if(ev.keyCode == 38) {
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
    else if(ev.keyCode == 40) {
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
    socket.emit("searchMedia", {
        source: "library",
        query: $("#library_query").val().toLowerCase()
    });
});

$("#library_query").keydown(function(ev) {
    if(ev.keyCode == 13) {
        socket.emit("searchMedia", {
            source: "library",
            query: $("#library_query").val().toLowerCase()
        });
    }
});

$("#youtube_search").click(function () {
    var query = $("#library_query").val().toLowerCase();
    if(parseMediaLink(query).type !== null) {
        makeAlert("Media Link", "If you already have the link, paste it " +
                  "in the 'Media URL' box under Playlist Controls.  This "+
                  "searchbar works like YouTube's search function.",
                  "alert-error")
            .addClass("span12")
            .insertBefore($("#library"));
    }

    socket.emit("searchMedia", {
        source: "yt",
        query: query
    });
});

/* user playlists */

$("#userpltoggle").click(function() {
    socket.emit("listPlaylists");
});

$("#userpl_save").click(function() {
    if($("#userpl_name").val().trim() == "") {
        makeAlert("Invalid Name", "Playlist name cannot be empty", "alert-error")
            .addClass("span12")
            .insertAfter($("#userpl_save").parent());
        return;
    }
    socket.emit("savePlaylist", {
        name: $("#userpl_name").val()
    });
});

/* video controls */
function selectQuality(select, preset) {

}
(function() {
    function qualHandler(select, preset) {
        $(select).click(function() {
            VIDEOQUALITY = preset;
            USEROPTS.default_quality = select;
            saveOpts();
            var btn = $("#qualitywrap .btn.dropdown-toggle");
            var caret = btn.find(".caret").detach();
            btn.text($(select).text());
            caret.appendTo(btn);
            if(PLAYER.type == "yt" && PLAYER.player.setPlaybackQuality)
                PLAYER.player.setPlaybackQuality(VIDEOQUALITY);
        });
    }
    qualHandler("#quality_auto", "");
    qualHandler("#quality_240p", "small");
    qualHandler("#quality_360p", "medium");
    qualHandler("#quality_480p", "large");
    qualHandler("#quality_720p", "hd720");
    qualHandler("#quality_1080p", "hd1080");
    if($(USEROPTS.default_quality).length > 0)
        $(USEROPTS.default_quality).click();
})();

$("#mediarefresh").click(function() {
    PLAYER.type = "";
    PLAYER.id = "";
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

function queue(pos) {
    if($("#customembed_code").val()) {
        var title = false;
        if($("#customembed_title").val()) {
            title = $("#customembed_title").val();
        }
        socket.emit("queue", {
            id: $("#customembed_code").val(),
            title: title,
            type: "cu",
            pos: pos
        });
        $("#customembed_code").val("");
        $("#customembed_title").val("");
        return;
    }
    var links = $("#mediaurl").val().split(",");
    var parsed = [];
    links.forEach(function(link) {
        var data = parseMediaLink(link);
        if(data.id === null || data.type === null) {
            makeAlert("Error", "Invalid link.  Please double check it and remove extraneous information", "alert-error")
                .addClass("span12")
                .insertBefore($("#extended_controls"));
        }
        else {
            $("#mediaurl").val("");
        }
        parsed.push({
            id: data.id,
            type: data.type
        });
    });

    if(parsed.length > 1) {
        socket.emit("queue", {
            id: false,
            list: parsed,
            type: "list",
            pos: pos
        });
    }
    else {
        parsed[0].pos = pos;
        socket.emit("queue", parsed[0]);
    }
}

$("#queue_next").click(function() {
    queue("next");
});

$("#queue_end").click(function() {
    queue("end");
});

$("#mediaurl").keydown(function(ev) {
    if(ev.keyCode == 13) {
        queue("end");
    }
});

$("#qlockbtn").click(function() {
    socket.emit("togglePlaylistLock");
});

$("#voteskip").click(function() {
    socket.emit("voteskip");
    $("#voteskip").attr("disabled", true);
});

$("#customembed_btn").click(function () {
    if($("#customembed_entry").css("display") == "none")
        $("#customembed_entry").show("blind");
    else
        $("#customembed_entry").hide("blind");
});

$("#getplaylist").click(function() {
    var callback = function(data) {
        hidePlayer();
        socket.listeners("playlist").splice(
            socket.listeners("playlist").indexOf(callback)
        );
        var list = [];
        for(var i = 0; i < data.length; i++) {
            var entry = formatURL(data[i].media);
            list.push(entry);
        }
        var urls = list.join(",");

        var modal = $("<div/>").addClass("modal hide fade")
            .appendTo($("body"));
        var head = $("<div/>").addClass("modal-header")
            .appendTo(modal);
        $("<button/>").addClass("close")
            .attr("data-dismiss", "modal")
            .attr("aria-hidden", "true")
            .html("&times;")
            .appendTo(head);
        $("<h3/>").text("Playlist URLs").appendTo(head);
        var body = $("<div/>").addClass("modal-body").appendTo(modal);
        $("<input/>").attr("type", "text")
            .val(urls)
            .appendTo(body);
        $("<div/>").addClass("modal-footer").appendTo(modal);
        modal.on("hidden", function() {
            modal.remove();
            unhidePlayer();
        });
        modal.modal();
    }
    socket.on("playlist", callback);
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

/* layout stuff */
$(window).resize(function() {
    VWIDTH = $("#videowidth").css("width").replace("px", "");
    VHEIGHT = ""+parseInt(parseInt(VWIDTH) * 9 / 16);
    $("#messagebuffer").css("height", (VHEIGHT - 31) + "px");
    $("#userlist").css("height", (VHEIGHT - 31) + "px");
    if($("#ytapiplayer").length > 0) {
        $("#ytapiplayer").attr("width", VWIDTH);
        $("#ytapiplayer").attr("height", VHEIGHT);
    }
});

/* load channel */

var loc = document.location+"";
var m = loc.match(/\/r\/([a-zA-Z0-9-_]+)$/);
if(m) {
    CHANNEL.name = m[1];
}
else {
    var main = $("#main");
    var container = $("<div/>").addClass("container").insertBefore(main);
    var row = $("<div/>").addClass("row").appendTo(container);
    var div = $("<div/>").addClass("span6").appendTo(row);
    main.css("display", "none");
    var label = $("<label/>").text("Enter Channel:").appendTo(div);
    var entry = $("<input/>").attr("type", "text").appendTo(div);
    entry.keydown(function(ev) {
        var host = document.protocol + "//" + document.host + "/";
        if(ev.keyCode == 13) {
            document.location = host + "r/" + entry.val();
            container.remove();
            main.css("display", "");
        }
    });
}

/* custom footer */
$("#sitefooter").load("footer.html");

/* oh internet explorer, how I hate thee */
$(":input:not(textarea)").keypress(function(ev) {
    return ev.keyCode != 13;
});

if (location.protocol === "https:") {
    var title = "Warning";
    var text = "You connected to this page via HTTPS.  Due to browser "+
               "security policy, certain media players may throw warnings,"+
               " while others may not work at all due to only being "+
               "available over plain HTTP.<br>To encrypt your websocket "+
               "traffic and API calls (logins, account management, etc) "+
               "while loading this page over plain HTTP, enable the SSL "+
               "option from the Options menu.";
    makeAlert(title, text, "alert-warning")
        .appendTo($("#announcements"));
}
