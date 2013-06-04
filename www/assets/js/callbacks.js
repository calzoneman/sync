Callbacks = {

    connect: function() {
        socket.emit("joinChannel", {
            name: CHANNEL
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
    },

    disconnect: function() {
        if(KICKED)
            return;
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text("Disconnected from server.  Attempting reconnection...")
            .appendTo($("#messagebuffer"));
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
    },

    errorMsg: function(data) {
        alert(data.msg);
    },

    announcement: function(data) {
        $("#announcerow").html("");
        $("#announcerow").css("display", "");
        var div = $("<div/>").addClass("alert")
            .appendTo($("#announcerow"));
        $("<button/>").addClass("close pull-right").text("×")
            .appendTo(div)
            .click(function() { div.remove(); });
        $("<h3/>").text(data.title).appendTo(div);
        $("<p/>").html(data.text).appendTo(div);
    },

    kick: function(data) {
        KICKED = true;
        $("<div/>").addClass("server-msg-disconnect")
            .text("Kicked: " + data.reason)
            .appendTo($("#messagebuffer"));
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollheight"));
    },

    noflood: function(data) {
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text(data.action + ": " + data.msg)
            .appendTo($("#messagebuffer"));
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
    },

    channelNotRegistered: function() {
        var div = $("<div/>").addClass("alert alert-info").attr("id", "chregnotice")
            .insertBefore($("#main"));
        $("<button/>").addClass("close pull-right").text("×")
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
            alert(data.error);
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

    updateMotd: function(data) {
        $("#motdtext").val(data.motd);
        if(data.motd != "")
            $("#motd").parent().css("display", "");
        else
            $("#motd").parent().css("display", "none");
        $("#motd")[0].innerHTML = data.html;
    },

    chatFilters: function(data) {
        var entries = data.filters;
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
    },

    channelOpts: function(opts) {
        $("#opt_pagetitle").attr("placeholder", opts.pagetitle);
        document.title = opts.pagetitle;
        PAGETITLE = opts.pagetitle;
        $("#opt_customcss").val(opts.customcss);
        $("#opt_customjs").val(opts.customjs);
        $("#opt_chat_antiflood").prop("checked", opts.chat_antiflood);
        $("#opt_show_public").prop("checked", opts.show_public);
        $("#customCss").remove();
        if(opts.customcss.trim() != "") {
            $("#usertheme").remove();
            $("<link/>")
                .attr("rel", "stylesheet")
                .attr("href", opts.customcss)
                .attr("id", "customCss")
                .appendTo($("head"));
        }
        $("#opt_allow_voteskip").prop("checked", opts.allow_voteskip);
        $("#opt_voteskip_ratio").val(opts.voteskip_ratio);
        if(opts.customjs.trim() != "") {
            if(opts.customjs != CUSTOMJS) {
                $.getScript(opts.customjs);
                CUSTOMJS = opts.customjs;
            }
        }

        CHANNELOPTS = opts;
        if(opts.qopen_allow_qnext)
            $("#queue_next").attr("disabled", false);
        else if(RANK < Rank.Moderator && !LEADER)
            $("#queue_next").attr("disabled", true);
        if(opts.qopen_allow_playnext)
            $("#play_next").attr("disabled", false);
        else if(RANK < Rank.Moderator && !LEADER)
            $("#play_next").attr("disabled", true);

        if(opts.allow_voteskip)
            $("#voteskip").attr("disabled", false);
        else
            $("#voteskip").attr("disabled", true);
        handlePermissionChange();
    },

    setPermissions: function(perms) {
        CHANPERMS = perms;
        genPermissionsEditor();
        handlePermissionChange();
    },

    channelCSSJS: function(data) {
        $("#chancss").remove();
        $("#chanjs").remove();

        $("#csstext").val(data.css);
        $("#jstext").val(data.js);

        if(data.css) {
            $("#usertheme").remove();
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

    banlist: function(data) {
        var entries = data.entries;
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

            var callback = (function(id, name) { return function() {
                socket.emit("unban", {
                    id: id,
                    name: name
                });
            } })(entries[i].id, entries[i].name);
            remove.click(callback);
        }
    },

    seenlogins: function(data) {
        var entries = data.entries;
        var tbl = $("#loginlog table");
        if(tbl.children().length > 1) {
            $(tbl.children()[1]).remove();
        }
        $("#loginlog_pagination").remove();
        entries.sort(function(a, b) {
            var x = a.names.join(",").toLowerCase();
            var y = b.names.join(",").toLowerCase();
            // Force blanknames to the bottom
            if(x == "") {
                return 1;
            }
            if(y == "") {
                return -1;
            }
            return x == y ? 0 : (x < y ? -1 : 1);
        });
        $("#loginlog").data("entries", entries);
        if(entries.length > 20) {
            var pag = $("<div/>").addClass("pagination span12")
                .attr("id", "loginlog_pagination")
                .prependTo($("#loginlog"));
            var btns = $("<ul/>").appendTo(pag);
            for(var i = 0; i < entries.length / 20; i++) {
                var li = $("<li/>").appendTo(btns);
                (function(i) {
                $("<a/>").attr("href", "javascript:void(0)")
                    .text(i+1)
                    .click(function() {
                        loadLoginlogPage(i);
                    })
                    .appendTo(li);
                })(i);
            }
        }
        loadLoginlogPage(0);
    },

    acl: function(entries) {
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
        return;
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

    rank: function(data) {
        RANK = data.rank;
        handlePermissionChange();
    },

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
            $("#welcome").text("Logged in as " + uname);
            $("#loginform").css("display", "none");
            $("#logoutform").css("display", "");
            $("#loggedin").css("display", "");
            session = data.session || "";
            createCookie("sync_uname", uname, 7);
            createCookie("sync_session", session, 7);
        }
    },

    /* REGION Chat */
    usercount: function(data) {
        var text = data.count + " connected user";
        if(data.count != 1) {
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
        formatUserlistItem(div[0], data);
        addUserDropdown(div, data.name);
        if(data.name == uname) {
            PROFILE.image = data.profile.image;
            PROFILE.text = data.profile.text;
        }
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
        if(data.name == uname) {
            PROFILE.text = data.profile.text;
            PROFILE.image = data.profile.image;
            LEADER = data.leader;
            RANK = data.rank;
            handlePermissionChange();
            if(LEADER) {
                // I'm a leader!  Set up sync function
                sendVideoUpdate = function() {
                    PLAYER.getTime(function(seconds) {
                        socket.emit("mediaUpdate", {
                            id: PLAYER.id,
                            currentTime: seconds,
                            paused: PLAYER.paused,
                            type: PLAYER.type
                        });
                    });
                };
            }
            // I'm not a leader.  Don't send syncs to the server
            else {
                sendVideoUpdate = function() { }
            }

        }
        var users = $("#userlist").children();
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerHTML;
            // Reformat user
            if(name == data.name) {
                formatUserlistItem(users[i], data);
            }
        }
    },

    userLeave: function(data) {
        var users = $("#userlist").children();
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerHTML;
            if(name == data.name) {
                $("#userlist")[0].removeChild(users[i]);
            }
        }
    },

    drinkCount: function(data) {
        if(data.count != 0) {
            var text = data.count + " drink";
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
        var ul = $("#queue")[0];
        var n = ul.children.length;
        for(var i = 0; i < n; i++) {
            ul.removeChild(ul.children[0]);
        }
        for(var i = 0; i < data.pl.length; i++) {
            var li = makeQueueEntry(data.pl[i]);
            if(RANK >= Rank.Moderator || OPENQUEUE || LEADER)
                addQueueButtons(li);
            $(li).attr("title", data.pl[i].queueby
                                ? ("Added by: " + data.pl[i].queueby)
                                : "Added by: Unknown");
            $(li).appendTo(ul);
        }
    },

    updatePlaylistMeta: function(data) {
        $("#plcount").text(data.count + " items");
        $("#pllength").text(data.time);
    },

    queue: function(data) {
        var li = makeQueueEntry(data.media);
        if(RANK >= Rank.Moderator || OPENQUEUE || LEADER)
            addQueueButtons(li);
        $(li).css("display", "none");
        var idx = data.pos;
        var ul = $("#queue")[0];
        $(li).attr("title", data.media.queueby
                            ? ("Added by: " + data.media.queueby)
                            : "Added by: Unknown");
        $(li).appendTo(ul);
        if(idx < ul.children.length - 1)
            moveVideo(ul.children.length - 1, idx);
        $(li).show("blind");
    },

    queueFail: function() {
        makeAlert("Error", "Queue failed.  Check your link to make sure it is valid.", "alert-error")
            .insertAfter($("#playlist_controls"));
    },

    setTemp: function(data) {
        var li = $("#queue").children()[data.idx];
        var buttons = $(li).find(".qe_btn");
        if(buttons.length == 5) {
            $(buttons[4]).removeClass("btn-danger btn-success");
            $(buttons[4]).addClass(data.temp ? "btn-success" : "btn-danger");
        }
        if(data.temp) {
            $(li).addClass("alert alert-error");
        }
        else {
            $(li).removeClass("alert alert-error");
        }
    },

    unqueue: function(data) {
        var li = $("#queue").children()[data.pos];
        $(li).remove();
    },

    moveVideo: function(data) {
        // Not recursive
        moveVideo(data.src, data.dest);
    },

    updatePlaylistIdx: function(data) {
        if(data.old != undefined) {
            var liold = $("#queue").children()[data.old];
            $(liold).removeClass("alert alert-info");
        }
        var linew = $("#queue").children()[data.idx];
        $(linew).addClass("alert alert-info");
        $("#queue").scrollTop(0);
        var scroll = $(linew).position().top - $("#queue").position().top;
        $("#queue").scrollTop(scroll);
        POSITION = data.idx;
        if(CHANNELOPTS.allow_voteskip)
            $("#voteskip").attr("disabled", false);
    },

    changeMedia: function(data) {
        $("#currenttitle").text("Currently Playing: " + data.title);
        if(data.type != "sc" && PLAYER.type == "sc")
            // [](/goddamnitmango)
            fixSoundcloudShit();
        if(data.type != "jw" && PLAYER.type == "jw") {
            // Is it so hard to not mess up my DOM?
            var wtf = $("<div/>").attr("id", "ytapiplayer")
                .insertBefore($("#ytapiplayer_wrapper"));
            $("#ytapiplayer_wrapper").remove();
        }
        if(data.type != PLAYER.type) {
            PLAYER = new Media(data);
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

    queueLock: function(data) {
        OPENQUEUE = !data.locked;
        if(OPENQUEUE) {
            $("#playlist_controls").css("display", "");
            if(RANK < Rank.Moderator) {
                $("#qlockbtn").css("display", "none");
                rebuildPlaylist();
                if(!CHANNELOPTS.qopen_allow_qnext)
                    $("#queue_next").attr("disabled", true);
                if(!CHANNELOPTS.qopen_allow_playnext)
                    $("#play_next").attr("disabled", true);
            }
        }
        else if(RANK < Rank.Moderator && !LEADER) {
            $("#playlist_controls").css("display", "none");
            rebuildPlaylist();
        }
        if(OPENQUEUE) {
            $("#qlockbtn").removeClass("btn-danger")
                .addClass("btn-success")
                .text("Lock Queue");
        }
        else {
            $("#qlockbtn").removeClass("btn-success")
                .addClass("btn-danger")
                .text("Unlock Queue");
        }
    },

    librarySearchResults: function(data) {
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
        closePoll();
        var pollMsg = $("<div/>").addClass("poll-notify")
            .text(data.initiator + " opened a poll: \"" + data.title + "\"")
            .appendTo($("#messagebuffer"));
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
        var poll = $("<div/>").addClass("well active").prependTo($("#pollcontainer"));
        $("<button/>").addClass("close pull-right").text("×")
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
        // Not recursive
        closePoll();
    },

    savePlaylist: function(data) {
        if(data.success) {
            makeAlert("Success", "Playlist saved.", "alert-success");
        }
        else {
            alert("DBG error " + data.error);
            makeAlert("Error", data.error, "alert-error");
        }
    },

    listPlaylists: function(data) {
        if(data.error) {
            makeAlert("Error", data.error, "alert-error")
                .addClass("span12")
                .css("margin-left", "0")
                .insertBefore($("#userpl_name").parent());
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
$.getScript(IO_URL+"/socket.io/socket.io.js", function() {
    try {
        socket = io.connect(IO_URL);
        for(var key in Callbacks) {
            socket.on(key, Callbacks[key]);
        }
    }
    catch(e) {
        Callbacks.disconnect();
    }
});
*/

socket = new NotWebsocket();
for(var key in Callbacks) {
    socket.on(key, Callbacks[key]);
}
