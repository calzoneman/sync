/* Generalized show/hide function */
function generateToggle(chevron, div) {
    $(chevron).click(function() {
        if($(div).css("display") == "none") {
            $(div).show();
            $(chevron+" i").removeClass("icon-chevron-down")
                .addClass("icon-chevron-up");
        }
        else {
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
$("#guestlogin").click(function() {
    socket && socket.emit("login", {
        name: $("#guestname").val(),
    });
});
$("#login").click(showLoginMenu);
$("#logout").click(function() {
    eraseCookie("cytube_name");
    eraseCookie("cytube_session");
    document.ocation.reload(true);
});

/* chatbox */
$("#chatline").keyDown(function(ev) {
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
