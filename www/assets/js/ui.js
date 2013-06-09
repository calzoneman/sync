/* Generalized show/hide function */
function generateToggle(chevron, div) {
    $(chevron).click(function() {
        if($(div).css("display") == "none") {
            $(chevron).html($(chevron).html().replace(/Show/, "Hide"));
            $(div).show();
            $(chevron+" i").removeClass("icon-chevron-down")
                .addClass("icon-chevron-up");
        }
        else {
            $(chevron).html($(chevron).html().replace(/Hide/, "Show"));
            $(div).hide();
            $(chevron+" i").removeClass("icon-chevron-up")
                .addClass("icon-chevron-down");
        }
    });
}

/* setup show/hide toggles */
generateToggle("#usercountwrap", "#userlist");
generateToggle("#librarytoggle", "#librarywrap");
generateToggle("#userpltoggle", "#userplaylistwrap");
generateToggle("#playlisttoggle", "#playlist_controls");

/* navbar stuff */
$("#optlink").click(showOptionsMenu);

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
$("#chatline").keydown(function(ev) {
    if(ev.keyCode == 13) {
        var msg = $("#chatline").val();
        if(msg.trim()) {
            if(USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {
                msg = "/m " + msg;
            }
            socket.emit("chatMsg", {
                msg: msg
            });
            CHATHIST.push($("#chatline").val());
            CHATLISTIDX = CHATHIST.length;
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

$("#youtube_search").click(function() {
    socket.emit("searchMedia", {
        source: "yt",
        query: $("#library_query").val().toLowerCase()
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

/* playlist controls */

$(function() {
    $("#queue").sortable();
    $("#queue").disableSelection();
});

function queue(pos) {
    var links = $("#mediaurl").val().split(",");
    if(pos == "next") {
        links = links.reverse();
    }
    links.forEach(function(link) {
        var data = parseMediaLink(link);
        socket.emit("queue", {
            id: data.id,
            type: data.type,
            pos: "end"
        });
    });
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

$("#getplaylist").click(function() {
    var callback = function(data) {
        socket.listeners("playlist").splice(
            socket.listeners("playlist").indexOf(callback)
        );
        var list = [];
        for(var i = 0; i < data.pl.length; i++) {
            var entry = formatURL(data.pl[i]);
            // TODO formatURL in util.js
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
    var clear = confirm("Are you sure you want to shuffle the playlist?");
    if(clear) {
        socket.emit("shufflePlaylist");
    }
});
