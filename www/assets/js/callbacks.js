/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

Callbacks = {

    /* fired when socket connection completes */
    connect: function() {
        socket.emit("joinChannel", {
            name: CHANNEL.name
        });
        if(NAME && SESSION) {
            socket.emit("login", {
                name: NAME,
                session: SESSION
            });
        }
        $("<div/>").addClass("server-msg-reconnect")
            .text("Connected")
            .appendTo($("#messagebuffer"));
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
    },

    disconnect: function() {
        if(KICKED)
            return;
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text("Disconnected from server.  Attempting reconnection...")
            .appendTo($("#messagebuffer"));
        scrollChat();
    },

    errorMsg: function(data) {
        alert(data.msg);
    },

    announcement: function(data) {
        $("#announcements").html("");
        makeAlert(data.title, data.text)
            .appendTo($("#announcements"));
    },

    kick: function(data) {
        KICKED = true;
        $("<div/>").addClass("server-msg-disconnect")
            .text("Kicked: " + data.reason)
            .appendTo($("#messagebuffer"));
        scrollChat();
    },

    noflood: function(data) {
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text(data.action + ": " + data.msg)
            .appendTo($("#messagebuffer"));
        scrollChat();
    },

    channelNotRegistered: function() {
        var div = $("<div/>").addClass("alert alert-info")
            .attr("id", "chregnotice")
            .insertBefore($("#main"));
        $("<button/>").addClass("close pull-right").html("&times;")
            .appendTo(div)
            .click(function() { div.remove(); });
        $("<h3/>").text("This channel isn't registered").appendTo(div);
        $("<button/>").addClass("btn btn-primary").text("Register it")
            .appendTo(div)
            .click(function() {
                socket.emit("registerChannel");
            });
    },

    registerChannel: function(data) {
        if(data.success) {
            $("#chregnotice").remove();
        }
        else {
            makeAlert("Error", data.error, "alert-error")
                .insertAfter($("#chregnotice"));
        }
    },

    unregisterChannel: function(data) {
        if(data.success) {
            alert("Channel unregistered");
        }
        else {
            alert(data.error);
        }
    },

    setMotd: function(data) {
        $("#motd").html(data.html);
        if(data.motd != "")
            $("#motd").show();
        else
            $("#motd").hide();
    },

    chatFilters: function(entries) {
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
                    makeAlert("Invalid regex", e+"", "alert-error")
                        .insertAfter($("#filtereditor table"));
                    return;
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
    },

    channelOpts: function(opts) {
        // TODO update if necessary when HTML admin stuff added
        $("#opt_pagetitle").attr("placeholder", opts.pagetitle);
        document.title = opts.pagetitle;
        PAGETITLE = opts.pagetitle;
        $("#opt_customcss").val(opts.customcss);
        $("#opt_customjs").val(opts.customjs);
        $("#opt_chat_antiflood").prop("checked", opts.chat_antiflood);
        $("#opt_show_public").prop("checked", opts.show_public);
        $("#opt_enable_link_regex").prop("checked", opts.enable_link_regex);
        $("#customCss").remove();
        if(opts.customcss.trim() != "") {
            $("<link/>")
                .attr("rel", "stylesheet")
                .attr("href", opts.customcss)
                .attr("id", "customCss")
                .appendTo($("head"));
        }
        $("#opt_allow_voteskip").prop("checked", opts.allow_voteskip);
        $("#opt_voteskip_ratio").val(opts.voteskip_ratio);
        if(opts.customjs.trim() != "") {
            if(opts.customjs != CHANNEL.opts.customjs) {
                $.getScript(opts.customjs);
            }
        }

        CHANNEL.opts = opts;

        if(opts.allow_voteskip)
            $("#voteskip").attr("disabled", false);
        else
            $("#voteskip").attr("disabled", true);
        handlePermissionChange();
    },

    setPermissions: function(perms) {
        CHANNEL.perms = perms;
        if(CLIENT.rank >= Rank.Admin)
            1;
            //genPermissionsEditor();
        handlePermissionChange();
    },

    channelCSSJS: function(data) {
        $("#chancss").remove();
        $("#chanjs").remove();

        $("#csstext").val(data.css);
        $("#jstext").val(data.js);

        if(data.css) {
            $("<style/>").attr("type", "text/css")
                .attr("id", "chancss")
                .text(data.css)
                .appendTo($("head"));
        }

        if(data.js) {
            $("<script/>").attr("type", "text/javascript")
                .attr("id", "chanjs")
                .text(data.js)
                .appendTo($("body"));
        }
    },

    banlist: function(entries) {
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
            var aliases = $("<td/>").text(entries[i].aliases).appendTo(tr);
            var banner = $("<td/>").text(entries[i].banner).appendTo(tr);

            var callback = (function(id, name) { return function() {
                socket.emit("unban", {
                    id: id,
                    name: name
                });
            } })(entries[i].id, entries[i].name);
            remove.click(callback);
        }
    },

    channelRanks: function(entries) {
        // TODO Edit if necessary
        entries.sort(function(a, b) {
            var x = a.name.toLowerCase();
            var y = b.name.toLowerCase();
            return y == x ? 0 : (x < y ? -1 : 1);
        });
        $("#channelranks").data("entries", entries);
        var tbl = $("#channelranks table");
        if(tbl.children().length > 1) {
            $(tbl.children()[1]).remove();
        }
        $("#acl_pagination").remove();
        if(entries.length > 20) {
            var pag = $("<div/>").addClass("pagination span12")
                .attr("id", "acl_pagination")
                .prependTo($("#channelranks"));
            var btns = $("<ul/>").appendTo(pag);
            for(var i = 0; i < entries.length / 20; i++) {
                var li = $("<li/>").appendTo(btns);
                (function(i) {
                $("<a/>").attr("href", "javascript:void(0)")
                    .text(i+1)
                    .click(function() {
                        loadACLPage(i);
                    })
                    .appendTo(li);
                })(i);
            }
        }
        loadACLPage(0);
    },

    setChannelRank: function(data) {
        var ents = $("#channelranks").data("entries");
        for(var i = 0; i < ents.length; i++) {
            if(ents[i].name == data.user) {
                ents[i].rank = data.rank;
                break;
            }
        }
        $("#channelranks").data("entries", ents);
        loadACLPage($("#channelranks").data("page"));
    },

    voteskip: function(data) {
        if(data.count > 0) {
            $("#voteskip").text("Voteskip ("+data.count+"/"+data.need+")");
        }
        else {
            $("#voteskip").text("Voteskip");
        }
    },

    /* REGION Rank Stuff */

    rank: function(r) {
        CLIENT.rank = r;
        handlePermissionChange();
    },

    /* should not be relevant since registration is on account.html */
    register: function(data) {
        if(data.error) {
            alert(data.error);
        }
    },

    login: function(data) {
        if(!data.success) {
            if(data.error != "Invalid session") {
                alert(data.error);
            }
        }
        else {
            $("#welcome").text("Logged in as " + data.name);
            $("#loginform").css("display", "none");
            $("#logoutform").css("display", "");
            $("#loggedin").css("display", "");
            SESSION = data.session || "";
            CLIENT.name = data.name;
            CLIENT.logged_in = true;
            if(SESSION) {
                createCookie("cytube_uname", CLIENT.name, 7);
                createCookie("cytube_session", SESSION, 7);
            }
        }
    },

    /* REGION Chat */
    usercount: function(count) {
        var text = count + " connected user";
        if(count != 1) {
            text += "s";
        }
        $("#usercount").text(text);
    },

    chatMsg: function(data) {
        addChatMessage(data);
    },

    clearchat: function() {
        $("#messagebuffer").html("");
    },

    userlist: function(data) {
        $(".userlist_item").each(function() { $(this).remove(); });
        for(var i = 0; i < data.length; i++) {
            Callbacks.addUser(data[i]);
        }
    },

    addUser: function(data) {
        var div = $("<div/>").attr("class", "userlist_item");
        var flair = $("<span/>").appendTo(div);
        var nametag = $("<span/>").text(data.name).appendTo(div);
        formatUserlistItem(div, data);
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
    },

    updateUser: function(data) {
        if(data.name == CLIENT.name) {
            CLIENT.leader = data.leader;
            CLIENT.rank = data.rank;
            handlePermissionChange();
            if(CLIENT.leader) {
                // I'm a leader!  Set up sync function
                if(LEADTMR)
                    clearInterval(LEADTMR);
                LEADTMR = setInterval(function() {
                    PLAYER.getTime(function(seconds) {
                        socket.emit("mediaUpdate", {
                            id: PLAYER.id,
                            currentTime: seconds,
                            paused: PLAYER.paused,
                            type: PLAYER.type
                        });
                    });
                }, 5000);
            }
            // I'm not a leader.  Don't send syncs to the server
            else {
                if(LEADTMR)
                    clearInterval(LEADTMR);
                LEADTMR = false;
            }

        }
        var users = $("#userlist").children();
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerHTML;
            // Reformat user
            if(name == data.name) {
                formatUserlistItem($(users[i]), data);
            }
        }

    },

    userLeave: function(data) {
        var users = $("#userlist").children();
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerHTML;
            if(name == data.name) {
                $(users[i]).remove();
                // Note: no break statement here because allowing
                // the loop to continue means a free cleanup if something
                // goes wrong and there's a duplicate name
            }
        }
    },

    drinkCount: function(count) {
        if(count != 0) {
            var text = count + " drink";
            if(data.count != 1) {
                text += "s";
            }
            $("#drinkcount").text(text);
            $("#drinkbar").show();
        }
        else {
            $("#drinkbar").hide();
        }
    },

    /* REGION Playlist Stuff */
    playlist: function(data) {
        // Clear the playlist first
        var q = $("#queue");
        q.html("");

        for(var i = 0; i < data.length; i++) {
            Callbacks.queue({
                media: data[i],
                pos: q.children().length
            });
        }
    },

    setPlaylistMeta: function(data) {
        var c = data.count + " item";
        if(data.count != 1)
            c += "s";
        $("#plcount").text(c);
        $("#pllength").text(data.time);
    },

    queue: function(data) {
        var li = makeQueueEntry(data.media, true);
        li.hide();
        addQueueButtons(li);
        var idx = data.pos;
        var q = $("#queue");
        li.attr("title", data.media.queueby
                            ? ("Added by: " + data.media.queueby)
                            : "Added by: Unknown");
        if(idx < q.children().length - 1)
            li.insertBefore(q.children()[idx])
        else
            li.appendTo(q);
        li.show("blind");
    },

    queueFail: function(data) {
        if(!data) {
            data = "Queue failed.  Check your link to make sure it is valid.";
        }
        makeAlert("Error", data, "alert-error")
            .insertAfter($("#mediaurl").parent());
    },

    setTemp: function(data) {
        var li = $("#queue").children()[data.position];
        li = $(li);
        if(data.temp)
            li.addClass("queue_temp");
        else
            li.removeClass("queue_temp");
        var btn = li.find(".qbtn-tmp");
        btn.data("temp", data.temp);
        if(data.temp) {
            btn.html(btn.html().replace("Make Temporary",
                                        "Make Permanent"));
        }
        else {
            btn.html(btn.html().replace("Make Permanent",
                                        "Make Temporary"));
        }
    },

    "delete": function(data) {
        var li = $("#queue").children()[data.position];
        $(li).remove();
    },

    moveVideo: function(data) {
        if(data.moveby != CLIENT.name)
            playlistMove(data.from, data.to);
    },

    setPosition: function(position) {
        $("#queue li").each(function() {
            $(this).removeClass("queue_active");
        });
        if(position < 0)
            return;
        POSITION = position;
        var linew = $("#queue").children()[POSITION];
        // jQuery UI's sortable thingy kinda fucks this up initially
        // Wait until it's done
        if(!$(linew).hasClass("queue_entry")) {
            setTimeout(function() {
                Callbacks.setPosition(position);
            }, 100);
            return;
        }
        $(linew).addClass("queue_active");

        $("#queue").scrollTop(0);
        var scroll = $(linew).position().top - $("#queue").position().top;
        $("#queue").scrollTop(scroll);

        if(CHANNEL.opts.allow_voteskip)
            $("#voteskip").attr("disabled", false);
    },

    changeMedia: function(data) {
        $("#currenttitle").text("Currently Playing: " + data.title);
        if(data.type != "sc" && PLAYER.type == "sc")
            // [](/goddamnitmango)
            fixSoundcloudShit();
        if(data.type != "jw" && PLAYER.type == "jw") {
            // Is it so hard to not mess up my DOM?
            $("<div/>").attr("id", "ytapiplayer")
                .insertBefore($("#ytapiplayer_wrapper"));
            $("#ytapiplayer_wrapper").remove();
        }
        if(data.type != PLAYER.type) {
            PLAYER = new Player(data);
        }
        if(PLAYER.update) {
            PLAYER.update(data);
        }
    },

    mediaUpdate: function(data) {
        if(PLAYER.update) {
            PLAYER.update(data);
        }
    },

    setPlaylistLocked: function(data) {
        CHANNEL.openqueue = !data.locked;
        handlePermissionChange();
        if(CHANNEL.openqueue) {
            $("#qlockbtn").removeClass("btn-danger")
                .addClass("btn-success")
                .text("Lock Playlist");
        }
        else {
            $("#qlockbtn").removeClass("btn-success")
                .addClass("btn-danger")
                .text("Unlock Playlist");
        }
    },

    searchResults: function(data) {
        clearSearchResults();
        $("#library").data("entries", data.results);
        if(data.results.length > 100) {
            var pag = $("<div/>").addClass("pagination")
                .attr("id", "search_pagination")
                .insertAfter($("#library"));
            var btns = $("<ul/>").appendTo(pag);
            for(var i = 0; i < data.results.length / 100; i++) {
                var li = $("<li/>").appendTo(btns);
                (function(i) {
                $("<a/>").attr("href", "javascript:void(0)")
                    .text(i+1)
                    .click(function() {
                        loadSearchPage(i);
                    })
                    .appendTo(li);
                })(i);
            }
        }
        loadSearchPage(0);
    },

    /* REGION Polls */
    newPoll: function(data) {
        Callbacks.closePoll();
        var pollMsg = $("<div/>").addClass("poll-notify")
            .text(data.initiator + " opened a poll: \"" + data.title + "\"")
            .appendTo($("#messagebuffer"));
        scrollChat();

        var poll = $("<div/>").addClass("well active").prependTo($("#pollwrap"));
        $("<button/>").addClass("close pull-right").html("&times;")
            .appendTo(poll)
            .click(function() { poll.remove(); });
        if(hasPermission("pollctl")) {
            $("<button/>").addClass("btn btn-danger pull-right").text("End Poll")
                .appendTo(poll)
                .click(function() {
                    socket.emit("closePoll")
                });
        }

        $("<h3/>").text(data.title).appendTo(poll);
        for(var i = 0; i < data.options.length; i++) {
            (function(i) {
            var callback = function() {
                    socket.emit("vote", {
                        option: i
                    });
                    poll.find(".option button").each(function() {
                        $(this).attr("disabled", "disabled");
                    });
            }
            $("<button/>").addClass("btn").text(data.counts[i])
                .prependTo($("<div/>").addClass("option").text(data.options[i])
                        .appendTo(poll))
                .click(callback);
            })(i);

        }

        poll.find(".btn").attr("disabled", !hasPermission("pollvote"));
    },

    updatePoll: function(data) {
        var poll = $("#pollcontainer .active");
        var i = 0;
        poll.find(".option button").each(function() {
            $(this).text(data.counts[i]);
            i++;
        });
    },

    closePoll: function() {
        if($("#pollwrap .active").length != 0) {
            var poll = $("#pollwrap .active");
            poll.removeClass("active").addClass("muted");
            poll.find(".option button").each(function() {
                $(this).attr("disabled", true);
            });
            poll.find(".btn-danger").each(function() {
                $(this).remove()
            });
        }
    },

    savePlaylist: function(data) {
        if(data.success) {
            makeAlert("Success", "Playlist saved.", "alert-success");
        }
        else {
            makeAlert("Error", data.error, "alert-error")
                .addClass("span12")
                .insertBefore($("#userpl_list"));
        }
    },

    listPlaylists: function(data) {
        if(data.error) {
            makeAlert("Error", data.error, "alert-error")
                .addClass("span12")
                .insertBefore($("#userpl_list"));
        }
        else {
            var pls = data.pllist;
            pls.sort(function(a, b) {
                var x = a.name.toLowerCase();
                var y = b.name.toLowerCase();
                if(x < y) return -1;
                if(x > y) return 1;
                return 0;
            });
            $("#userpl_list").html("");
            for(var i = 0; i < pls.length; i++) {
                var li = $("<li/>").appendTo($("#userpl_list"))
                    .addClass("well");
                li.data("pl-name", pls[i].name);
                $("<div/>").text(pls[i].name).appendTo(li)
                    .css("float", "left")
                    .css("margin-left", "1em");
                var metastr = pls[i].count + " item";
                if(pls[i].count != 1) {
                    metastr += "s";
                }
                metastr +=", playtime " + pls[i].time;
                $("<div/>").text(metastr)
                    .css("float", "right")
                    .appendTo(li);
                var bg = $("<div/>").addClass("btn-group")
                    .css("float", "left")
                    .prependTo(li);
                var del = $("<button/>")
                    .addClass("btn btn-mini btn-danger")
                    .prependTo(bg);
                $("<i/>").addClass("icon-trash").appendTo(del);
                (function(li) {
                del.click(function() {
                    socket.emit("deletePlaylist", {
                        name: li.data("pl-name")
                    });
                });
                })(li);
                if(hasPermission("playlistaddlist")) {
                    (function(li) {
                    $("<button/>").addClass("btn btn-mini")
                        .text("End")
                        .prependTo(bg)
                        .click(function() {
                            socket.emit("queuePlaylist", {
                                name: li.data("pl-name"),
                                pos: "end"
                            });
                        });
                    })(li);

                    if(hasPermission("playlistnext")) {
                        (function(li) {
                        $("<button/>").addClass("btn btn-mini")
                            .text("Next")
                            .prependTo(bg)
                            .click(function() {
                                socket.emit("queuePlaylist", {
                                    name: li.data("pl-name"),
                                    pos: "next"
                                });
                            });
                        })(li);
                    }
                }
            }
        }
    }
}

/*
pl = [];
for(var i = 0; i < 10; i++) {
    var m = {
        title: "Test " + i,
        type: "yt",
        id: "test" + i,
        seconds: 0,
        duration: "00:00"
    };
    pl.push(m);
}
setTimeout(function() {
    Callbacks.playlist(pl);
}, 1000);
*/

$.getScript(IO_URL+"/socket.io/socket.io.js", function() {
    try {
        socket = io.connect(IO_URL);
        setupCallbacks();
    }
    catch(e) {
        Callbacks.disconnect();
    }
});

setupCallbacks = function() {
    for(var key in Callbacks) {
        (function(key) {
        socket.on(key, function(data) {
            Callbacks[key](data);
        });
        })(key);
    }
}

