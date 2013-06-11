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

$("#queue").sortable({
    start: function(ev, ui) {
        PL_FROM = ui.item.prevAll().length;
    },
    update: function(ev, ui) {
        PL_TO = ui.item.prevAll().length;
        if(PL_TO != PL_FROM) {
            socket.emit("moveMedia", {
                from: PL_FROM,
                to: PL_TO
            });
        }
    }
});
$("#queue").disableSelection();

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
        PLAYER.hide();
        socket.listeners("playlist").splice(
            socket.listeners("playlist").indexOf(callback)
        );
        var list = [];
        for(var i = 0; i < data.length; i++) {
            var entry = formatURL(data[i]);
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
            PLAYER.unhide();
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
    VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");
    var VHEIGHT = ""+parseInt(parseInt(VWIDTH) * 9 / 16);
    $("#messagebuffer").css("height", (VHEIGHT - 31) + "px");
    $("#userlist").css("height", (VHEIGHT - 31) + "px");
    $("#ytapiplayer").attr("width", VWIDTH);
    $("#ytapiplayer").attr("height", VHEIGHT);
});

/* initial YouTube api */

if(!USEROPTS.hidevid) {
    var tag = document.createElement("script");
    tag.src = "http://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName("script")[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function onYouTubeIframeAPIReady() {
    if(!PLAYER)
        PLAYER = new Player({id:"", type: "yt"});
    if(FLUIDLAYOUT)
        fluid();
}

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
        var host = ""+document.location;
        host = host.replace("http://", "");
        host = host.substring(0, host.indexOf("/"));
        if(ev.keyCode == 13) {
            document.location = "http://" + host + "/r/" + entry.val();
            socket.emit("joinChannel", {
                name: entry.val()
            });
            container.remove();
            main.css("display", "");
        }
    });
}
