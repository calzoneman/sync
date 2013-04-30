/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

function handleDisconnect() {
    if(KICKED)
        return;
    $("<div/>")
        .addClass("server-msg-disconnect")
        .text("Disconnected from server.  Attempting reconnection...")
        .appendTo($("#messagebuffer"));
    $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
}

// Adds a user to the chatbox userlist
function addUser(data) {
    var div = $("<div/>").attr("class", "userlist_item");
    var flair = $("<span/>").appendTo(div);
    var nametag = $("<span/>").text(data.name).appendTo(div);
    formatUserlistItem(div[0], data);
    addUserDropdown(div, data.name);
    var users = $("#userlist").children();
    for(var i = 0; i < users.length; i++) {
        var othername = users[i].children[1].innerHTML;
        if(othername.toLowerCase() > data.name.toLowerCase()) {
            div.insertBefore(users[i]);
            return;
        }
    }
    div.appendTo($("#userlist"));
}

// Format a userlist entry based on a person's rank
function formatUserlistItem(div, data) {
    var name = div.children[1];
    $(name).removeClass();
    $(name).css("font-style", "");
    $(name).addClass(getNameColor(data.rank));

    var flair = div.children[0];
    flair.innerHTML = "";
    // denote current leader with a star
    if(data.leader) {
        $("<i/>").addClass("icon-star-empty").appendTo(flair);
    }
    if(data.meta && data.meta.afk) {
        $(name).css("font-style", "italic");
        $("<i/>").addClass("icon-time").appendTo(flair);
    }
}

function getNameColor(rank) {
    if(rank >= Rank.Siteadmin)
        return "userlist_siteadmin";
    else if(rank >= Rank.Owner)
        return "userlist_owner";
    else if(rank >= Rank.Moderator)
        return "userlist_op";
    else if(rank == Rank.Guest)
        return "userlist_guest";
    else
        return "";
}

// Adds a dropdown with user actions (promote/demote/leader)
function addUserDropdown(entry, name) {
    $(entry).find(".dropdown").remove();
    $(entry).unbind();
    var div = $("<div />").addClass("dropdown").appendTo(entry);
    var ul = $("<ul />").addClass("dropdown-menu").appendTo(div);
    ul.attr("role", "menu");
    ul.attr("aria-labelledby", "dropdownMenu");

    var ignore = $("<li />").appendTo(ul);
    var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(ignore);
    if(IGNORED.indexOf(name) != -1) {
        a.text("Unignore User");
    }
    else {
        a.text("Ignore User");
    }
    a.click(function() {
        if(IGNORED.indexOf(name) != -1) {
            IGNORED.splice(IGNORED.indexOf(name), 1);
            this.text("Ignore User");
        }
        else {
            IGNORED.push(name);
            this.text("Unignore User");
        }
    }.bind(a));

    if(RANK >= Rank.Moderator) {
        $("<li />").addClass("divider").appendTo(ul);

        var makeLeader = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(makeLeader);
        a.text("Make Leader");
        a.click(function() {
            socket.emit("assignLeader", {
                name: name
            });
        });

        var takeLeader = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(takeLeader);
        a.text("Take Leader");
        a.click(function() {
            socket.emit("assignLeader", {
                name: ""
            });
        });

        var kick = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(kick);
        a.text("Kick");
        a.click(function() {
            socket.emit("chatMsg", {
                msg: "/kick " + name
            });
        });

        var ban = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(ban);
        a.text("IP Ban");
        a.click(function() {
            socket.emit("chatMsg", {
                msg: "/ban " + name
            });
        });

        $("<li />").addClass("divider").appendTo(ul);

        var promote = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(promote);
        a.text("Promote");
        a.click(function() {
            socket.emit("promote", {
                name: name
            });
        });

        var demote = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(demote);
        a.text("Demote");
        a.click(function() {
            socket.emit("demote", {
                name: name
            });
        });
    }

    $(entry).click(function() {
        if(ul.css("display") == "none") {
            // Hide others
            $("#userlist ul.dropdown-menu").each(function() {
                if(this != ul) {
                    $(this).css("display", "none");
                }
            });
            ul.css("display", "block");
        }
        else {
            ul.css("display", "none");
        }
    });
    return ul;
}

function addChatMessage(data) {
    if(IGNORED.indexOf(data.username) != -1) {
        return;
    }
    var div = formatChatMessage(data);
    div.appendTo($("#messagebuffer"));
    // Cap chatbox at most recent 100 messages
    if($("#messagebuffer").children().length > 100) {
        $($("#messagebuffer").children()[0]).remove();
    }
    if(SCROLLCHAT)
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
}

function formatChatMessage(data) {
    var div = $("<div/>");
    if(uname) {
        if(data.msg.toUpperCase().indexOf(uname.toUpperCase()) != -1) {
            div.addClass("nick-highlight");
            if(!FOCUSED) {
                TITLE_BLINK = setInterval(function() {
                    if(document.title == "*Chat*")
                        document.title = PAGETITLE;
                    else
                        document.title = "*Chat*";
                }, 1000);
            }
        }
    }
    var name = $("<span/>").appendTo(div);
    $("<strong/>").text("<" + data.username + "> ").appendTo(name);
    var message = $("<span/>").appendTo(div);
    message[0].innerHTML = data.msg;
    if(data.modflair) {
        name.addClass(getNameColor(data.modflair));
    }
    if(data.msgclass == "action") {
        name.remove();
        message.addClass("action");
        message[0].innerHTML = data.username + " " + data.msg;
    }
    else if(data.msgclass == "drink") {
        div.addClass("drink");
    }
    else if(data.msgclass == "shout") {
        message.addClass("shout");
        name.addClass("shout");
    }
    else  {
        message.addClass(data.msgclass);
    }
    return div;
}

// Creates and formats a queue entry
function makeQueueEntry(video) {
    var li = $("<li />");
    li.attr("class", "well");
    if(video.thumb) {
        $("<img/>").attr("src", video.thumb.url)
            .css("float", "left")
            .css("clear", "both")
            .appendTo(li);
    }
    var title = $("<span />").addClass("qe_title").appendTo(li);
    title.text(video.title);
    var time = $("<span />").addClass("qe_time").appendTo(li);
    time.text(video.duration);
    var clear = $("<div />").addClass("qe_clear").appendTo(li);
    return li;
}

// Add buttons to a queue list entry
function addQueueButtons(li) {
    if(RANK < Rank.Moderator && !LEADER) {
        if(!CHANNELOPTS.qopen_allow_delete
                && !CHANNELOPTS.qopen_allow_move
                && !CHANNELOPTS.qopen_allow_qnext) {

            return;
        }
    }
    var fullperms = LEADER || RANK >= Rank.Moderator;

    var btnstrip = $("<div />").attr("class", "btn-group qe_buttons").prependTo(li);

    if(CHANNELOPTS.qopen_allow_move || fullperms) {
        var btnMove = $("<button />").addClass("btn qe_btn").appendTo(btnstrip);
        $("<i />").addClass("icon-resize-vertical").appendTo(btnMove);
        // Callback time
        btnMove.mousedown(function() {
            GRABBEDLI = li;
            OLDINDEX = $("#queue").children().index(li);
        });

        btnMove.mousemove(function() {
            if(GRABBEDLI != null) {
                var idx = $("#queue").children().index(li);
                var lidx = $("#queue").children().index(GRABBEDLI);
                if(idx != lidx)
                    moveVideo(lidx, idx, true);
            }
        });
    }

    if(CHANNELOPTS.qopen_allow_delete || fullperms) {
        var btnRemove =  $("<button />").attr("class", "btn btn-danger qe_btn").appendTo(btnstrip);
        $("<i />").attr("class", "icon-remove").appendTo(btnRemove);
        $(btnRemove).click(function() {
            btnstrip.remove();
            var idx = $("#queue").children().index(li);
            socket.emit("unqueue", { pos: idx });
        });
    }

    if(CHANNELOPTS.qopen_allow_playnext || fullperms) {
        var btnPlay =  $("<button />").attr("class", "btn btn-success qe_btn").appendTo(btnstrip);
        $("<i />").attr("class", "icon-play").appendTo(btnPlay);
        $(btnPlay).click(function() {
            var idx = $("#queue").children().index(li);
            socket.emit("jumpTo", {
                pos: idx
            });
        });
    }

    if(CHANNELOPTS.qopen_allow_qnext || fullperms) {
        var btnNext =  $("<button />").attr("class", "btn qe_btn").appendTo(btnstrip);
        btnNext.text("Next");
        $(btnNext).click(function() {
            var idx = $("#queue").children().index(li);
            var dest = idx < POSITION ? POSITION : POSITION + 1;
            socket.emit("moveMedia", {
                src: idx,
                dest: dest
            });
        });
    }

    $(document).mouseup(function() {
        if(GRABBEDLI != null) {
            var idx = $("#queue").children().index(GRABBEDLI);
            GRABBEDLI = null;
            moveVideo(idx, OLDINDEX, true);
            socket.emit("moveMedia", {
                src: OLDINDEX,
                dest: idx
            });
        }
    });
}

function rebuildPlaylist() {
    $("#queue li").each(function() {
        $(this).find(".btn-group").remove();
        if(RANK >= Rank.Moderator || LEADER || OPENQUEUE)
            addQueueButtons(this);
    });
}

// Add buttons to a list entry for the library search results
function addLibraryButtons(li, id, yt) {
    var btnstrip = $("<div />").attr("class", "btn-group qe_buttons").prependTo(li);

    if(RANK >= Rank.Moderator || LEADER || (OPENQUEUE && CHANNELOPTS.qopen_allow_qnext)) {
        var btnNext =  $("<button />").addClass("btn qe_btn")
            .text("Next")
            .appendTo(btnstrip);
        btnNext.click(function() {
            if(yt) {
                socket.emit("queue", {
                    id: id,
                    pos: "next",
                    type: "yt"
                });
            }
            else {
                socket.emit("queue", {
                    id: id,
                    pos: "next"
                });
            }
        });
    }

    var btnEnd =  $("<button />").addClass("btn qe_btn").text("End").appendTo(btnstrip);

    if(RANK >= Rank.Moderator) {
        var btnDelete = $("<button/>").addClass("btn qe_btn btn-danger").appendTo(btnstrip);
        $("<i/>").addClass("icon-remove").appendTo(btnDelete);
        btnDelete.click(function() {
            socket.emit("uncache", {
                id: id
            });
            $(li).hide("blind", function() {
                $(li).remove();
            });
        });
    }

    btnEnd.click(function() {
        if(yt) {
            socket.emit("queue", {
                id: id,
                pos: "end",
                type: "yt"
            });
        }
        else {
            socket.emit("queue", {
                id: id,
                pos: "end"
            });
        }
    });

}

// Rearranges the queue
function moveVideo(src, dest, noanim) {
    var li = $($("#queue").children()[src]);
    var ul = $("#queue")[0];
    if(noanim) {
        li.detach();
        if(dest == ul.children.length) {
            li.appendTo(ul);
        }
        else {
            li.insertBefore(ul.getElementsByTagName("li")[dest]);
        }
    }
    else {
        li.hide("blind", function() {
            li.detach();
            if(dest == ul.children.length) {
                li.appendTo(ul);
            }
            else {
                li.insertBefore(ul.getElementsByTagName("li")[dest]);
            }
            $(li).show("blind");
        });
    }
    if(src < POSITION && dest >= POSITION)
        POSITION--;
    if(src > POSITION && dest < POSITION)
        POSITION++;
}

function parseVideoURL(url){
    url = url.trim()
    if(typeof(url) != "string")
        return null;
    if(url.indexOf("jw:") == 0) {
        url = url.substring(3);
        return [url, "jw"];
    }
    if(url.indexOf("rtmp://") == 0) {
        return [url, "rt"];
    }
    else if(url.indexOf("youtu.be") != -1 || url.indexOf("youtube.com") != -1) {
        if(url.indexOf("playlist") != -1) {
            return [parseYTPlaylist(url), "yp"];
        }
        return [parseYTURL(url), "yt"];
    }
    else if(url.indexOf("twitch.tv") != -1)
        return [parseTwitch(url), "tw"];
    else if(url.indexOf("livestream.com") != -1)
        return [parseLivestream(url), "li"];
    else if(url.indexOf("soundcloud.com") != -1)
        return [url, "sc"];
    else if(url.indexOf("vimeo.com") != -1)
        return [parseVimeo(url), "vi"];
    else if(url.indexOf("dailymotion.com") != -1)
        return [parseDailymotion(url), "dm"];
}

function parseYTURL(url) {
    var m = url.match(/v=([^&#]+)/);
    if(m) {
        return m[1];
    }
    var m = url.match(/youtu\.be\/([^&#]+)/);
    if(m) {
        return m[1];
    }
    var m = url.match(/([^&#]*)/);
    if(m) {
        return m[1];
    }
    return null;
}

function parseYTPlaylist(url) {
    var m = url.match(/youtube\.com\/playlist\?list=([^&]+)/);
    if(m) {
        return m[1];
    }
    return null;
}

function parseTwitch(url) {
    var m = url.match(/twitch\.tv\/([a-zA-Z0-9]+)/);
    if(m) {
        return m[1];
    }
    return null;
}

function parseLivestream(url) {
    var m = url.match(/livestream\.com\/([a-zA-Z0-9]+)/);
    if(m) {
        return m[1];
    }
    return null;
}

function parseVimeo(url) {
    var m = url.match(/vimeo\.com\/([0-9]+)/);
    if(m) {
        return m[1];
    }
    return null;
}

function parseDailymotion(url) {
    var m = url.match(/dailymotion\.com\/video\/([a-zA-Z0-9_-]+)/);
    if(m) {
        return m[1];
    }
    return null;
}

function closePoll() {
    if($("#pollcontainer .active").length != 0) {
        var poll = $("#pollcontainer .active");
        poll.removeClass("active").addClass("muted");
        poll.find(".option button").each(function() {
            $(this).attr("disabled", "disabled");
        });
        poll.find(".btn-danger").each(function() {
            $(this).remove()
        });
    }
}

function addPoll(data) {
    closePoll();
    var pollMsg = $("<div/>").addClass("poll-notify")
        .text(data.initiator + " opened a poll: \"" + data.title + "\"")
        .appendTo($("#messagebuffer"));
    var poll = $("<div/>").addClass("well active").prependTo($("#pollcontainer"));
    $("<button/>").addClass("close pull-right").text("×")
        .appendTo(poll)
        .click(function() { poll.remove(); });
    if(RANK >= Rank.Moderator || LEADER) {
        $("<button/>").addClass("btn btn-danger pull-right").text("End Poll")
            .appendTo(poll)
            .click(function() {
                socket.emit("closePoll")
            });
    }

    $("<h3/>").text(data.title).appendTo(poll);
    for(var i = 0; i < data.options.length; i++) {
        var callback = (function(i) { return function() {
                socket.emit("vote", {
                    option: i
                });
                poll.find(".option button").each(function() {
                    $(this).attr("disabled", "disabled");
                });
        } })(i);
        $("<button/>").addClass("btn").text(data.counts[i])
            .prependTo($("<div/>").addClass("option").text(data.options[i])
                    .appendTo(poll))
            .click(callback);

    }
}

function updatePoll(data) {
    var poll = $("#pollcontainer .active");
    var i = 0;
    poll.find(".option button").each(function() {
        $(this).text(data.counts[i]);
        i++;
    });
}

function showChannelRegistration() {
    var div = $("<div/>").addClass("alert alert-info").attr("id", "chregnotice")
        .insertAfter($(".row")[0]);
    $("<button/>").addClass("close pull-right").text("×")
        .appendTo(div)
        .click(function() { div.remove(); });
    $("<h3/>").text("This channel isn't registered").appendTo(div);
    $("<button/>").addClass("btn btn-primary").text("Register it")
        .appendTo(div)
        .click(function() {
            socket.emit("registerChannel");
        });
}

function showAnnouncement(title, text) {
    var div = $("<div/>").addClass("alert")
        .insertAfter($(".row")[0]);
    $("<button/>").addClass("close pull-right").text("×")
        .appendTo(div)
        .click(function() { div.remove(); });
    $("<h3/>").text(title).appendTo(div);
    $("<p/>").html(text).appendTo(div);
}

function updateBanlist(entries) {
    var tbl = $("#banlist table");
    if(tbl.children().length > 1) {
        $(tbl.children()[1]).remove();
    }
    for(var i = 0; i < entries.length; i++) {
        var tr = $("<tr/>").appendTo(tbl);
        var remove = $("<button/>").addClass("btn btn-mini btn-danger")
            .appendTo($("<td/>").appendTo(tr));
        $("<i/>").addClass("icon-remove-circle").appendTo(remove);
        var ip = $("<td/>").text(entries[i].ip).appendTo(tr);
        var name = $("<td/>").text(entries[i].name).appendTo(tr);
        var banner = $("<td/>").text(entries[i].banner).appendTo(tr);

        var callback = (function(ip) { return function() {
            socket.emit("chatMsg", {
                msg: "/unban " + ip
            });
        } })(entries[i].ip);
        remove.click(callback);
    }
}

function updateSeenLogins(entries) {
    var tbl = $("#loginlog table");
    if(tbl.children().length > 1) {
        $(tbl.children()[1]).remove();
    }
    for(var i = 0; i < entries.length; i++) {
        var tr = $("<tr/>").appendTo(tbl);
        var bantd = $("<td/>").appendTo(tr);
        var ban = $("<button/>").addClass("btn btn-mini btn-danger")
            .text("Ban")
            .appendTo(bantd);
        var banrange = $("<button/>").addClass("btn btn-mini btn-danger")
            .text("Ban Range")
            .appendTo(bantd);
        var ip = $("<td/>").text(entries[i].ip).appendTo(tr);
        var name = $("<td/>").text(entries[i].name).appendTo(tr);

        var callback = (function(name) { return function() {
            socket.emit("chatMsg", {
                msg: "/ban " + name
            });
        } })(entries[i].name.split(",")[0]);
        ban.click(callback);
        var callback2 = (function(name) { return function() {
            socket.emit("chatMsg", {
                msg: "/ban " + name + " range"
            });
        } })(entries[i].name.split(",")[0]);
        banrange.click(callback2);
    }
}

function updateChatFilters(entries) {
    var tbl = $("#filtereditor table");
    if(tbl.children().length > 1) {
        $(tbl.children()[1]).remove();
    }
    for(var i = 0; i < entries.length; i++) {
        var f = entries[i];
        var tr = $("<tr/>").appendTo(tbl);
        var remove = $("<button/>").addClass("btn btn-mini btn-danger")
            .appendTo($("<td/>").appendTo(tr));
        $("<i/>").addClass("icon-remove-circle").appendTo(remove);
        var name = $("<code/>").text(f.name)
            .appendTo($("<td/>").appendTo(tr));
        var regex = $("<code/>").text(f.source)
            .appendTo($("<td/>").appendTo(tr));
        var flags = $("<code/>").text(f.flags)
            .appendTo($("<td/>").appendTo(tr));
        var replace = $("<code/>").text(f.replace)
            .appendTo($("<td/>").appendTo(tr));
        var activetd = $("<td/>").appendTo(tr);
        var active = $("<input/>").attr("type", "checkbox")
            .prop("checked", f.active).appendTo(activetd);

        var remcallback = (function(filter) { return function() {
            socket.emit("chatFilter", {
                cmd: "remove",
                filter: filter
            });
        } })(f);
        remove.click(remcallback);

        var actcallback = (function(filter) { return function() {
            // Apparently when you check a checkbox, its value is changed
            // before this callback.  When you uncheck it, its value is not
            // changed before this callback
            // [](/amgic)
            var enabled = active.prop("checked");
            filter.active = (filter.active == enabled) ? !enabled : enabled;
            socket.emit("chatFilter", {
                cmd: "update",
                filter: filter
            });
        } })(f);
        active.click(actcallback);
    }

    var newfilt = $("<tr/>").appendTo(tbl);
    $("<td/>").appendTo(newfilt);
    var name = $("<input/>").attr("type", "text")
        .appendTo($("<td/>").appendTo(newfilt));
    var regex = $("<input/>").attr("type", "text")
        .appendTo($("<td/>").appendTo(newfilt));
    var flags = $("<input/>").attr("type", "text")
        .val("g")
        .appendTo($("<td/>").appendTo(newfilt));
    var replace = $("<input/>").attr("type", "text")
        .appendTo($("<td/>").appendTo(newfilt));
    var add = $("<button/>").addClass("btn btn-primary")
        .text("Add Filter")
        .appendTo($("<td/>").appendTo(newfilt));
    var cback = (function(name, regex, fg, replace) { return function() {
        if(regex.val() && replace.val()) {
            var re = regex.val();
            var flags = fg.val();
            try {
                var dummy = new RegExp(re, flags);
            }
            catch(e) {
                alert("Invalid regex: " + e);
            }
            socket.emit("chatFilter", {
                cmd: "update",
                filter: {
                    name: name.val(),
                    source: re,
                    flags: flags,
                    replace: replace.val(),
                    active: true
                }
            });
        }
    } })(name, regex, flags, replace);
    add.click(cback);
}

function updateACL(entries) {
    entries.sort(function(a, b) {
        var x = a.name.toLowerCase();
        var y = b.name.toLowerCase();
        return y == x ? 0 : (x < y ? -1 : 1);
    });
    var tbl = $("#channelranks table");
    if(tbl.children().length > 1) {
        $(tbl.children()[1]).remove();
    }
    for(var i = 0; i < entries.length; i++) {
        var tr = $("<tr/>").appendTo(tbl);
        var name = $("<td/>").text(entries[i].name).appendTo(tr);
        name.addClass(getNameColor(entries[i].rank));
        var rank = $("<td/>").text(entries[i].rank).appendTo(tr);
        var control = $("<td/>").appendTo(tr);
        var up = $("<button/>").addClass("btn btn-mini btn-success")
            .appendTo(control);
        $("<i/>").addClass("icon-plus").appendTo(up);
        var down = $("<button/>").addClass("btn btn-mini btn-danger")
            .appendTo(control);
        $("<i/>").addClass("icon-minus").appendTo(down);
        if(entries[i].rank + 1 >= RANK) {
            up.attr("disabled", true);
        }
        else {
            up.click(function(name) { return function() {
                socket.emit("promote", {
                    name: name
                });
            }}(entries[i].name));
        }
        if(entries[i].rank >= RANK) {
            down.attr("disabled", true);
        }
        else {
            down.click(function(name) { return function() {
                socket.emit("demote", {
                    name: name
                });
            }}(entries[i].name));
        }
    }
}
function handleRankChange() {
    rebuildPlaylist();
    if(RANK >= Rank.Moderator || LEADER) {
        $("#playlist_controls").css("display", "block");
        $("#playlist_controls button").each(function() {
            $(this).attr("disabled", false);
        });
        $("#pollcontainer .active").each(function() {
            var btns = $(this).find(".btn-danger");
            if(btns.length == 0) {
                $("<button/>").addClass("btn btn-danger pull-right")
                    .text("End Poll")
                    .insertAfter($(this).find(".close"))
                    .click(function() {
                        socket.emit("closePoll")
                    });
            }
        });
    }
    if(RANK >= Rank.Moderator) {
        $("#qlockbtn").css("display", "block");
        var users = $("#userlist").children();
        for(var i = 0; i < users.length; i++) {
            addUserDropdown(users[i], users[i].children[1].innerHTML);
        }
        $("#getplaylist").css("width", "34%");
        $("#clearplaylist").css("display", "");
        $("#shuffleplaylist").css("display", "");
        $("#modnav").show();
        $("#chancontrols").show();
        var val =  false;
        if(RANK < Rank.Owner) {
            val = "disabled";
        }
        $("#opt_pagetitle").attr("disabled", val);
        $("#opt_customcss").attr("disabled", val);
        $("#opt_customjs").attr("disabled", val);
        $("#show_filtereditor").attr("disabled", val);
        $("#show_acl").attr("disabled", val);
    }
    else if(!LEADER) {
        if(OPENQUEUE) {
            if(CHANNELOPTS.qopen_allow_qnext)
                $("#queue_next").attr("disabled", false);
            else
                $("#queue_next").attr("disabled", true);
            if(CHANNELOPTS.qopen_allow_playnext)
                $("#play_next").attr("disabled", false);
            else
                $("#play_next").attr("disabled", true);
        }
        else {
            $("#playlist_controls").css("display", "none");
        }

        $("#pollcontainer .active").each(function() {
            $(this).find(".btn-danger").remove();
        });
    }
    if(RANK < Rank.Moderator) {
        $("#getplaylist").css("width", "100%");
        $("#clearplaylist").css("display", "none");
        $("#shuffleplaylist").css("display", "none");
    }
}

function onWindowFocus() {
    clearInterval(TITLE_BLINK);
    document.title = PAGETITLE;
}

function enableBerrymotes() {
    $.getScript("./assets/js/berrymotes.js", function() {
        berryEmoteDataRefresh();
        monkeyPatchChat();
    });
}

function newPollMenu() {
    var modal = $("<div/>").addClass("modal hide fade")
        .appendTo($("body"));
    var head = $("<div/>").addClass("modal-header")
        .appendTo(modal);
    $("<button/>").addClass("close")
        .attr("data-dismiss", "modal")
        .attr("aria-hidden", "true")
        .appendTo(head)[0].innerHTML = "&times;";
    $("<h3/>").text("New Poll").appendTo(head);
    var body = $("<div/>").addClass("modal-body").appendTo(modal);

    var form = $("<form/>").addClass("form-horizontal")
        .appendTo(body);

    var tgroup = $("<div/>").addClass("control-group").appendTo(form);
    $("<label/>").text("Title")
        .addClass("control-label")
        .attr("for", "polltitle")
        .appendTo(tgroup);
    $("<input/>").attr("type", "text")
        .attr("id", "polltitle")
        .appendTo($("<div/>").addClass("controls").appendTo(tgroup))

    function addPollOption() {
        var g = $("<div/>").addClass("control-group").appendTo(form);
        var c = $("<div/>").addClass("controls").appendTo(g);
        $("<input/>").attr("type", "text")
            .appendTo(c);
    }
    addPollOption();

    var footer = $("<div/>").addClass("modal-footer").appendTo(modal);
    $("<button/>").addClass("btn pull-left")
        .text("Add Poll Option")
        .appendTo(footer)
        .click(addPollOption);

    var submit = function() {
        var all = form.find("input[type=\"text\"]");
        var title = $(all[0]).val();
        var opts = new Array(all.length - 1);
        for(var i = 1; i < all.length; i++) {
            opts[i - 1] = $(all[i]).val();
        }

        socket.emit("newPoll", {
            title: title,
            opts: opts
        });
    }

    $("<button/>").addClass("btn btn-primary")
        .attr("data-dismiss", "modal")
        .attr("aria-hidden", "true")
        .text("Open Poll")
        .appendTo(footer)
        .click(submit);
    modal.on("hidden", function() {
        modal.remove();
    });
    modal.modal();
}

function showLoginFrame() {
    $("#ytapiplayer").hide();
    var modal = $("<div/>").addClass("modal hide fade")
        .appendTo($("body"));
    var head = $("<div/>").addClass("modal-header")
        .appendTo(modal);
    $("<button/>").addClass("close")
        .attr("data-dismiss", "modal")
        .attr("aria-hidden", "true")
        .appendTo(head)[0].innerHTML = "&times;";
    $("<h3/>").text("Login").appendTo(head);
    var body = $("<div/>").addClass("modal-body").appendTo(modal);
    var frame = $("<iframe/>")
        .attr("id", "loginframe")
        .attr("src", "login.html")
        .css("border", "none")
        .css("width", "100%")
        .css("height", "300px")
        .css("margin", "0")
        .appendTo(body);
    var timer = setInterval(function() {
        frame[0].contentWindow.postMessage("cytube-syn", document.location);
    }, 1000);
    var respond = function(e) {
        if(e.data == "cytube-ack") {
            clearInterval(timer);
        }
        if(e.data.indexOf(":") == -1) {
            return;
        }
        if(e.data.substring(0, e.data.indexOf(":")) == "cytube-login") {
            var data = e.data.substring(e.data.indexOf(":")+1);
            data = JSON.parse(data);
            if(data.error) {
                alert(data.error);
            }
            else if(data.success) {
                session = data.session || "";
                uname = data.uname || "";
                socket.emit("login", {
                    name: uname,
                    session: session
                });
                if(window.removeEventListener) {
                    window.removeEventListener("message", respond, false);
                }
                else if(window.detachEvent) {
                    // If an IE dev ever reads this, please tell your company 
                    // to get their shit together
                    window.detachEvent("onmessage", respond);
                }
                modal.modal("hide");
            }
        }
    }
    if(window.addEventListener) {
        window.addEventListener("message", respond, false);
    }
    else if(window.attachEvent) {
        // If an IE dev ever reads this, please tell your company to get
        // their shit together
        window.attachEvent("onmessage", respond);
    }
    var footer = $("<div/>").addClass("modal-footer").appendTo(modal);
    modal.on("hidden", function() {
        $("#ytapiplayer").show();
        modal.remove();
    });
    modal.modal();
}

function showUserOpts() {
    $("#ytapiplayer").hide();
    var modal = $("<div/>").addClass("modal hide fade")
        .appendTo($("body"));
    var head = $("<div/>").addClass("modal-header")
        .appendTo(modal);
    $("<button/>").addClass("close")
        .attr("data-dismiss", "modal")
        .attr("aria-hidden", "true")
        .appendTo(head)[0].innerHTML = "&times;";
    $("<h3/>").text("User Options").appendTo(head);
    var body = $("<div/>").addClass("modal-body").appendTo(modal);
    var form = $("<form/>").addClass("form-horizontal")
        .appendTo(body);

    function addOption(lbl, thing) {
        var g = $("<div/>").addClass("control-group").appendTo(form);
        $("<label/>").addClass("control-label").text(lbl).appendTo(g);
        var c = $("<div/>").addClass("controls").appendTo(g);
        thing.appendTo(c);
    }

    var themeselect = $("<select/>");
    $("<option/>").attr("value", "default").text("Default").appendTo(themeselect);
    $("<option/>").attr("value", "assets/css/darkstrap.css").text("Dark").appendTo(themeselect);
    themeselect.val(USEROPTS.theme);
    addOption("Theme", themeselect);

    var usercss = $("<input/>").attr("type", "text")
        .attr("placeholder", "Stylesheet URL");
    usercss.val(USEROPTS.css);
    addOption("User CSS", usercss);

    var layoutselect = $("<select/>");
    $("<option/>").attr("value", "default").text("Default")
        .appendTo(layoutselect);
    $("<option/>").attr("value", "large").text("Large")
        .appendTo(layoutselect);
    $("<option/>").attr("value", "huge").text("Huge")
        .appendTo(layoutselect);
    $("<option/>").attr("value", "single").text("Single Column")
        .appendTo(layoutselect);
    $("<option/>").attr("value", "synchtube").text("Synchtube")
        .appendTo(layoutselect);
    layoutselect.val(USEROPTS.layout);
    addOption("Layout", layoutselect);
    var warn = $("<p/>").addClass("text-error")
        .text("Changing layouts may require a refresh")
    addOption("", warn);

    var synchcontainer = $("<label/>").addClass("checkbox")
        .text("Synchronize Media");
    var synch = $("<input/>").attr("type", "checkbox").appendTo(synchcontainer);
    synch.prop("checked", USEROPTS.synch);
    addOption("Synch", synchcontainer);

    if(RANK >= Rank.Moderator) {
        $("<hr>").appendTo(form);
        var modhatcontainer = $("<label/>").addClass("checkbox")
            .text("Show name color");
        var modhat = $("<input/>").attr("type", "checkbox").appendTo(modhatcontainer);
        modhat.prop("checked", USEROPTS.modhat);
        addOption("Modflair", modhatcontainer);
    }

    var footer = $("<div/>").addClass("modal-footer").appendTo(modal);
    var submit = $("<button/>").addClass("btn btn-primary pull-right")
        .text("Save")
        .appendTo(footer);

    submit.click(function() {
        USEROPTS.theme  = themeselect.val();
        USEROPTS.css    = usercss.val();
        USEROPTS.layout = layoutselect.val();
        USEROPTS.synch  = synch.prop("checked");
        if(RANK >= Rank.Moderator) {
            USEROPTS.modhat = modhat.prop("checked");
        }
        saveOpts();
        applyOpts();
        modal.modal("hide");
    });

    modal.on("hidden", function() {
        $("#ytapiplayer").show();
        modal.remove();
    });
    modal.modal();
}

function saveOpts() {
    for(var key in USEROPTS) {
        createCookie("cytube_"+key, USEROPTS[key], 100);
    }
}

function applyOpts() {
    $("#usertheme").remove();
    if(USEROPTS.theme != "default") {
        $("<link/>").attr("rel", "stylesheet")
            .attr("type", "text/css")
            .attr("id", "usertheme")
            .attr("href", USEROPTS.theme)
            .appendTo($("head"));
    }

    $("#usercss").remove();
    if(USEROPTS.css) {
        $("<link/>").attr("rel", "stylesheet")
            .attr("type", "text/css")
            .attr("id", "usertheme")
            .attr("href", USEROPTS.css)
            .appendTo($("head"));
    }

    switch(USEROPTS.layout) {
        case "large":
            largeLayout();
            break;
        case "huge":
            hugeLayout();
            break;
        case "single":
            singleColumnLayout();
            break;
        case "synchtube":
            synchtubeLayout();
            break;
        default:
            break;
    }
}
