/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

const SYNC_THRESHOLD = 2;
var LEADER = false;
var PLAYER = false;
var MEDIATYPE = "yt";
var POSITION = -1;
var RANK = 0;
var OPENQUEUE = false;
var CHANNELOPTS = {};
var GRABBEDLI = null;
var OLDINDEX = -1;
var CHATHIST = [];
var CHATHISTIDX = 0;
var FOCUSED = true;
var SCROLLCHAT = true;
var PAGETITLE = "Sync";
var TITLE_BLINK;
var VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");//670
var VHEIGHT = "377";
var IGNORED = [];
var KICKED = false;
var uname = readCookie("sync_uname");
var session = readCookie("sync_session");

var Rank = {
    Guest: 0,
    Member: 1,
    Moderator: 2,
    Owner: 3,
    Siteadmin: 255
};

try {
    var socket = io.connect(IO_URL);
    initCallbacks();
}
catch(e) {
    handleDisconnect();
}

$(window).focus(function() {
    FOCUSED = true;
    onWindowFocus();
})
.blur(function() {
    FOCUSED = false;
});

$(window).resize(function() {
    VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");
    $("#ytapiplayer").attr("width", VWIDTH);
});

var params = {};
if(window.location.search) {
    var parameters = window.location.search.substring(1).split("&");
    for(var i = 0; i < parameters.length; i++) {
        var s = parameters[i].split("=");
        if(s.length != 2)
            continue;
        params[s[0]] = s[1];
    }
}

if(params["novideo"] != undefined) {
    $("#videodiv").remove();
}

if(params["channel"] == undefined) {
    // Match URLs of the form http://site.tld/r/channel
    var loc = document.location+"";
    var m = loc.match(/\/r\/([a-zA-Z0-9]+)$/);
    if(m) {
        socket.emit("joinChannel", {
            name: m[1]
        });
    }
    else {

        var main = $($(".container")[1]);
        var container = $("<div/>").addClass("container").insertBefore(main);
        var row = $("<div/>").addClass("row").appendTo(container);
        var div = $("<div/>").addClass("span6").appendTo(row);
        main.css("display", "none");
        var label = $("<label/>").text("Enter Channel:").appendTo(div);
        var entry = $("<input/>").attr("type", "text").appendTo(div);
        entry.keydown(function(ev) {
            if(ev.keyCode == 13) { document.location = document.location + "?channel=" + entry.val();
                socket.emit("joinChannel", {
                    name: entry.val()
                });
                container.remove();
                main.css("display", "");
            }
        });
    }
}
else if(!params["channel"].match(/^[a-zA-Z0-9]+$/)) {
    $("<div/>").addClass("alert alert-error")
        .insertAfter($(".row")[0])[0]
        .innerHTML = "<h3>Invalid Channel Name</h3><p>Channel names must conain only numbers and letters</p>";

}

socket.on("connect", function() {
    socket.emit("joinChannel", {
        name: params["channel"]
    });
    if(uname && session) {
        socket.emit("login", {
            name: uname,
            session: session
        });
    }
    $("<div/>").addClass("server-msg-reconnect")
        .text("Connected")
        .appendTo($("#messagebuffer"));
    $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
    setTimeout(function() { $("#reconnect_box").remove(); }, 3000);
});


// Load the youtube iframe API
var tag = document.createElement("script");
tag.src = "http://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName("script")[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var sendVideoUpdate = function() { }
setInterval(function() {
    sendVideoUpdate();
}, 5000);

$("#queue_end").click(function() {
    var urls = $("#mediaurl").val().split(",");
    for(var i = 0; i < urls.length; i++) {
        if(!urls[i].trim())
            continue;
        var parsed = parseVideoURL(urls[i].trim());
        var id = parsed[0];
        var type = parsed[1];
        if(id) {
            $("#mediaurl").val("");
        }
        socket.emit("queue", {
            id: id,
            pos: "end",
            type: type
        });
    }
});

$("#queue_next").click(function() {
    var urls = $("#mediaurl").val().split(",");
    for(var i = 0; i < urls.length; i++) {
        if(!urls[i].trim())
            continue;
        var parsed = parseVideoURL(urls[i].trim());
        var id = parsed[0];
        var type = parsed[1];
        if(id) {
            $("#mediaurl").val("");
        }
        socket.emit("queue", {
            id: id,
            pos: "next",
            type: type
        });
    }
});

$("#play_next").click(function() {
    socket.emit("playNext");
});

$("#voteskip").click(function() {
    socket.emit("voteskip");
    $("#voteskip").attr("disabled", true);
});

$("#qlockbtn").click(function() {
    socket.emit("queueLock", {
        locked: OPENQUEUE
    });
});

$("#login").click(showLoginFrame);

function guestLogin() {
    uname = $("#guestname").val();
    socket.emit("login", {
        name: $("#guestname").val()
    });
}
$("#guestlogin").click(guestLogin);
$("#guestname").keydown(function(ev) {
    if(ev.keyCode == 13) {
        guestLogin();
    }
});

$("#logout").click(function() {
    eraseCookie("sync_uname");
    eraseCookie("sync_session");
    document.location.reload(true);
});

$("#chatline").keydown(function(ev) {
    if(ev.keyCode == 13 && $("#chatline").val() != "") {
        if($("#chatline").val().trim() == "/poll") {
            newPollMenu();
            $("#chatline").val("");
        }
        else {
            socket.emit("chatMsg", {
                msg: $("#chatline").val()
            });
        }
        CHATHIST.push($("#chatline").val());
        if(CHATHIST.length > 10)
            CHATHIST.shift();
        CHATHISTIDX = CHATHIST.length;
        $("#chatline").val("");
    }
    else if(ev.keyCode == 9) { // Tab completion
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
$("#messagebuffer").mouseenter(function() { SCROLLCHAT = false; });
$("#messagebuffer").mouseleave(function() { SCROLLCHAT = true; });

$("#clearplaylist").click(function() {
    socket.emit("clearqueue");
});

$("#shuffleplaylist").click(function() {
    socket.emit("shufflequeue");
});

$("#getplaylist").click(function() {
    var callback = function(data) {
        socket.listeners("playlist").splice(
            socket.listeners("playlist").indexOf(callback));
        var list = [];
        for(var i = 0; i < data.pl.length; i++) {
            var entry;
            switch(data.pl[i].type) {
                case "yt":
                    entry = "http://youtube.com/watch?v="+data.pl[i].id;
                    break;
                case "vi":
                    entry = "http://vimeo.com/"+data.pl[i].id;
                    break;
                case "dm":
                    entry = "http://dailymotion.com/video/"+data.pl[i].id;
                    break;
                case "sc":
                    entry = data.pl[i].id;
                    break;
                case "li":
                    entry = "http://livestream.com/"+data.pl[i].id;
                    break;
                case "tw":
                    entry = "http://twitch.tv/"+data.pl[i].id;
                    break;
                case "rt":
                    entry = data.pl[i].id;
                    break;
                default:
                    break;
            }
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
            .appendTo(head)[0].innerHTML = "&times;";
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

$("#opt_submit").click(function() {
    var ptitle = $("#opt_pagetitle").val();
    if(ptitle == "")
        ptitle = $("#opt_pagetitle").attr("placeholder")
    var css = $("#opt_customcss").val();
    var ratio = +$("#opt_voteskip_ratio").val() || 0.5;
    opts = {
        qopen_allow_qnext: $("#opt_qopen_allow_qnext").prop("checked"),
        qopen_allow_move: $("#opt_qopen_allow_move").prop("checked"),
        qopen_allow_delete: $("#opt_qopen_allow_delete").prop("checked"),
        qopen_allow_playnext: $("#opt_qopen_allow_playnext").prop("checked"),
        allow_voteskip: $("#opt_allow_voteskip").prop("checked"),
        voteskip_ratio: ratio,
        pagetitle: ptitle,
        customcss: css,
        customjs: $("#opt_customjs").val(),
        chat_antiflood: $("#opt_chat_antiflood").prop("checked")
    };
    socket.emit("channelOpts", opts);
});

$("#updatemotd").click(function() {
    var motd = $("#motdtext").val();
    socket.emit("updateMotd", {
        motd: motd
    });
});

$("#show_chancontrols").click(function() {
    $("#modnav li").each(function() {
        $(this).removeClass("active");
    });
    $(".modonly").hide();
    $("#show_chancontrols").parent().addClass("active");
    $("#chancontrols").show();
});

$("#show_banlist").click(function() {
    $("#modnav li").each(function() {
        $(this).removeClass("active");
    });
    $(".modonly").hide();
    $("#show_banlist").parent().addClass("active");
    $("#banlist").show();
});

$("#show_motdeditor").click(function() {
    $("#modnav li").each(function() {
        $(this).removeClass("active");
    });
    $(".modonly").hide();
    $("#show_motdeditor").parent().addClass("active");
    $("#motdeditor").show();
});

$("#show_filtereditor").click(function() {
    $("#modnav li").each(function() {
        $(this).removeClass("active");
    });
    $(".modonly").hide();
    $("#show_filtereditor").parent().addClass("active");
    $("#filtereditor").show();
});

$("#show_acl").click(function() {
    $("#modnav li").each(function() {
        $(this).removeClass("active");
    });
    $(".modonly").hide();
    $("#show_acl").parent().addClass("active");
    $("#channelranks").show();
    socket.emit("requestAcl");
});

function searchLibrary() {
    socket.emit("searchLibrary", {
        query: $("#library_query").val()
    });
}
$("#library_search").click(searchLibrary);
$("#library_query").keydown(function(ev) {
    if(ev.keyCode == 13)
        searchLibrary();
});

$("#youtube_search").click(function() {
    socket.emit("searchLibrary", {
        query: $("#library_query").val(),
        yt: true
    });
});

$("#largelayout").click(largeLayout);
$("#hugelayout").click(hugeLayout);
$("#narrowlayout").click(narrowLayout);
$("#stlayout").click(synchtubeLayout);

function largeLayout() {
    $("#videodiv").removeClass().addClass("span8 offset2");
    VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");//770
    VHEIGHT = "430";
    $("#ytapiplayer").attr("width", VWIDTH).attr("height", "430");
    var chat = $("#chatdiv").detach();
    $("#layoutrow").remove();
    var r = $("<div />").addClass("row").insertAfter($("#videodiv").parent());
    r.attr("id", "layoutrow");
    chat.removeClass().addClass("span8 offset2").appendTo(r);
    $("#chatline").removeClass().addClass("span8");
    $("#userlist").css("width", "200px");
}

function singleColumnLayout() {
    $("#videodiv").removeClass().addClass("span12");
    VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");
    VHEIGHT = parseInt(VWIDTH) * 9 / 16;
    $("#ytapiplayer").attr("width", VWIDTH).attr("height", VHEIGHT);
    var chat = $("#chatdiv").detach();
    $("#layoutrow").remove();
    var r = $("<div />").addClass("row").insertAfter($("#videodiv").parent());
    r.attr("id", "layoutrow");
    chat.removeClass().addClass("span12").appendTo(r);
    chat.css("height", "200px");
    $("#messagebuffer").css("height", "100%");
    $("#userlist").css("height", "100%");
    $("#chatline").removeClass().addClass("span12");
    $("#userlist").css("width", "200px");

    var r2d2 = $("<div/>").addClass("row").insertBefore($("#queuerow"));
    r2d2.css("margin-top", "60px");
    var librow = $("#queuerow").attr("id", "");
    librow.css("margin-top", "5px");
    r2d2.attr("id", "queuerow");
    $("#pollcontainer").detach().appendTo(r2d2).removeClass().addClass("span12");
    $("#queuediv").detach().appendTo(r2d2).removeClass().addClass("span12");
    $(librow.find(".span5")[0]).removeClass().addClass("span12");

}

function hugeLayout() {
    $("#videodiv").removeClass().addClass("span12");
    VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");//1170
    VHEIGHT = "658";
    $("#ytapiplayer").attr("width", VWIDTH).attr("height", "658");
    var chat = $("#chatdiv").detach();
    $("#layoutrow").remove();
    var r = $("<div />").addClass("row").insertAfter($("#videodiv").parent());
    r.attr("id", "layoutrow");
    chat.removeClass().addClass("span12").appendTo(r);
    $("#chatline").removeClass().addClass("span12");
    $("#userlist").css("width", "200px").css("height", "200px");
    $("#messagebuffer").css("height", "200px");
}

function narrowLayout() {
    VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");//570
    VHEIGHT = "321";
    $("#videodiv").removeClass().addClass("span6");
    $("#ytapiplayer").attr("width", VWIDTH).attr("height", "321");
    var chat = $("#chatdiv").detach();
    $("#layoutrow").remove();
    var r = $("<div />").addClass("row").insertAfter($("#videodiv").parent());
    r.attr("id", "layoutrow");
    chat.removeClass().addClass("span6").appendTo(r);
    $("#chatline").removeClass().addClass("span6");
    $("#userlist").css("width", "150px");
}

function synchtubeLayout() {
    $("#videodiv").detach().insertBefore($("#chatdiv"));
}

function onYouTubeIframeAPIReady() {
    if(!PLAYER)
        PLAYER = new Media({id: "", type: "yt"});
}

function createCookie(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(";");
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==" ") c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name,"",-1);
}
