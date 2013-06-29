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
generateToggle("#usercountwrap", "#userlist");
$("#usercountwrap").click(scrollChat);
generateToggle("#librarytoggle", "#librarywrap");
generateToggle("#userpltoggle", "#userplaylistwrap");
generateToggle("#playlisttoggle", "#playlist_controls");

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
$("#messagebuffer").mouseenter(function() { SCROLLCHAT = false; });
$("#messagebuffer").mouseleave(function() { SCROLLCHAT = true; });

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

/* video controls */
(function() {
    function qualHandler(select, preset) {
        $(select).click(function() {
            VIDEOQUALITY = preset;
            var btn = $("#qualitywrap .btn.dropdown-toggle");
            var caret = btn.find(".caret").detach();
            btn.text($(select).text());
            caret.appendTo(btn);
        });
    }
    qualHandler("#quality_240p", "small");
    qualHandler("#quality_360p", "medium");
    qualHandler("#quality_480p", "large");
    qualHandler("#quality_720p", "hd720");
    qualHandler("#quality_1080p", "hd1080");
})();

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
    }
});
$("#queue").disableSelection();

function queue(pos) {
    var links = $("#mediaurl").val().split(",");
    if(pos == "next") {
        links = links.reverse();
    }
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

/* oh internet explorer, how I hate thee */
$(":input:not(textarea)").keypress(function(ev) {
    return ev.keyCode != 13;
});
