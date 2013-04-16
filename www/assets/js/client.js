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
var VWIDTH = "670";
var VHEIGHT = "377";
var IGNORED = [];
var KICKED = false;
var uname = readCookie("sync_uname");
var pw = readCookie("sync_pw");

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
    var main = $($(".container")[1]);
    var container = $("<div/>").addClass("container").insertBefore(main);
    var row = $("<div/>").addClass("row").appendTo(container);
    var div = $("<div/>").addClass("span6").appendTo(row);
    main.css("display", "none");
    var label = $("<label/>").text("Enter Channel:").appendTo(div);
    var entry = $("<input/>").attr("type", "text").appendTo(div);
    entry.keydown(function(ev) {
        if(ev.keyCode == 13) {
            document.location = document.location + "?channel=" + entry.val();
            socket.emit("joinChannel", {
                name: entry.val()
            });
            container.remove();
            main.css("display", "");
        }
    });
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
    if(uname != null && pw != null && pw != "false") {
        socket.emit("login", {
            name: uname,
            pw: pw
        });
    }
    $("<div/>").addClass("server-msg-reconnect")
        .text("Connected")
        .appendTo($("#messagebuffer"));
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

function loginClick() {
    uname = $("#username").val();
    pw = $("#password").val();
    socket.emit("login", {
        name: uname,
        pw: pw
    });
};

$("#login").click(loginClick);
$("#username").keydown(function(ev) {
    if(ev.keyCode == 13)
        loginClick();
});
$("#password").keydown(function(ev) {
    if(ev.keyCode == 13)
        loginClick();
});

$("#logout").click(function() {
    eraseCookie("sync_uname");
    eraseCookie("sync_pw");
    document.location.reload(true);
});

$("#register").click(function() {
    uname = $("#username").val();
    pw = $("#password").val();
    socket.emit("register", {
        name: uname,
        pw: pw
    });
});

$("#chatline").keydown(function(ev) {
    if(ev.keyCode == 13 && $("#chatline").val() != "") {
        socket.emit("chatMsg", {
            msg: $("#chatline").val()
        });
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


$("#opt_submit").click(function() {
    var ptitle = $("#opt_pagetitle").val();
    if(ptitle == "")
        ptitle = $("#opt_pagetitle").attr("placeholder")
    var css = $("#opt_customcss").val();
    opts = {
        qopen_allow_qnext: $("#opt_qopen_allow_qnext").prop("checked"),
        qopen_allow_move: $("#opt_qopen_allow_move").prop("checked"),
        qopen_allow_delete: $("#opt_qopen_allow_delete").prop("checked"),
        qopen_allow_playnext: $("#opt_qopen_allow_playnext").prop("checked"),
        allow_voteskip: $("#opt_allow_voteskip").prop("checked"),
        pagetitle: ptitle,
        customcss: css,
        customjs: $("#opt_customjs").val()
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
    $("#show_banlist").parent().removeClass("active");
    $("#show_motdeditor").parent().removeClass("active");
    $("#show_filtereditor").parent().removeClass("active");
    $("#show_chancontrols").parent().addClass("active");
    $(".modonly").hide();
    $("#chancontrols").show();
});

$("#show_banlist").click(function() {
    $("#show_chancontrols").parent().removeClass("active");
    $("#show_motdeditor").parent().removeClass("active");
    $("#show_filtereditor").parent().removeClass("active");
    $("#show_banlist").parent().addClass("active");
    $(".modonly").hide();
    $("#banlist").show();
});

$("#show_motdeditor").click(function() {
    $("#show_chancontrols").parent().removeClass("active");
    $("#show_banlist").parent().removeClass("active");
    $("#show_filtereditor").parent().removeClass("active");
    $("#show_motdeditor").parent().addClass("active");
    $(".modonly").hide();
    $("#motdeditor").show();
});

$("#show_filtereditor").click(function() {
    $("#show_chancontrols").parent().removeClass("active");
    $("#show_banlist").parent().removeClass("active");
    $("#show_motdeditor").parent().removeClass("active");
    $("#show_filtereditor").parent().addClass("active");
    $(".modonly").hide();
    $("#filtereditor").show();
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
    VWIDTH = "770";
    VHEIGHT = "430";
    $("#ytapiplayer").attr("width", "770").attr("height", "430");
    var chat = $("#chatdiv").detach();
    $("#layoutrow").remove();
    var r = $("<div />").addClass("row").insertAfter($("#videodiv").parent());
    r.attr("id", "layoutrow");
    chat.removeClass().addClass("span8 offset2").appendTo(r);
    $("#chatline").removeClass().addClass("span8");
    $("#userlist").css("width", "200px");
}

function hugeLayout() {
    VWIDTH = "1170";
    VHEIGHT = "658";
    $("#videodiv").removeClass().addClass("span12");
    $("#ytapiplayer").attr("width", "1170").attr("height", "658");
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
    VWIDTH = "570";
    VHEIGHT = "321";
    $("#videodiv").removeClass().addClass("span6");
    $("#ytapiplayer").attr("width", "570").attr("height", "321");
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
