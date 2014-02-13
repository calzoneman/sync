/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

Callbacks = {

    error: function (reason) {
        window.SOCKET_ERROR_REASON = reason;
    },

    /* fired when socket connection completes */
    connect: function() {
        socket.emit("initChannelCallbacks");
        socket.emit("joinChannel", {
            name: CHANNEL.name
        });

        if (CHANNEL.opts.password) {
            socket.emit("channelPassword", CHANNEL.opts.password);
        }

        if (CLIENT.name && CLIENT.guest) {
            socket.emit("login", {
                name: CLIENT.name
            });
        }

        $("<div/>").addClass("server-msg-reconnect")
            .text("Connected")
            .appendTo($("#messagebuffer"));
        scrollChat();
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
        if (data.alert) {
            alert(data.msg);
        } else {
            errDialog(data.msg);
        }
    },

    costanza: function (data) {
        hidePlayer();
        $("#costanza-modal").modal("hide");
        var modal = makeModal();
        modal.attr("id", "costanza-modal")
            .appendTo($("body"));

        var body = $("<div/>").addClass("modal-body")
            .appendTo(modal.find(".modal-content"));
        $("<img/>").attr("src", "http://i0.kym-cdn.com/entries/icons/original/000/005/498/1300044776986.jpg")
            .appendTo(body);

        $("<strong/>").text(data.msg).appendTo(body);
        hidePlayer();
        modal.modal();
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

    needPassword: function (wrongpw) {
        var div = $("<div/>");
        $("<strong/>").text("Channel Password")
            .appendTo(div);
        if (wrongpw) {
            $("<br/>").appendTo(div);
            $("<span/>").addClass("text-error")
                .text("Wrong Password")
                .appendTo(div);
        }

        var pwbox = $("<input/>").addClass("form-control")
            .attr("type", "password")
            .appendTo(div);
        var submit = $("<button/>").addClass("btn btn-xs btn-default btn-block")
            .css("margin-top", "5px")
            .text("Submit")
            .appendTo(div);
        var parent = chatDialog(div);
        parent.attr("id", "needpw");
        var sendpw = function () {
            socket.emit("channelPassword", pwbox.val());
            parent.remove();
        };
        submit.click(sendpw);
        pwbox.keydown(function (ev) {
            if (ev.keyCode == 13) {
                sendpw();
            }
        });
        pwbox.focus();
    },

    cancelNeedPassword: function () {
        $("#needpw").remove();
    },

    chatCooldown: function (time) {
        time = time + 200;
        $("#chatline").css("color", "#ff0000");
        if (CHATTHROTTLE && $("#chatline").data("throttle_timer")) {
            clearTimeout($("#chatline").data("throttle_timer"));
        }
        CHATTHROTTLE = true;
        $("#chatline").data("throttle_timer", setTimeout(function () {
            CHATTHROTTLE = false;
            $("#chatline").css("color", "");
        }, time));
    },

    channelNotRegistered: function() {
        var div = $("<div/>").addClass("alert alert-info")
            .appendTo($("<div/>").addClass("col-md-12").appendTo($("#announcements")));

        $("<button/>").addClass("close pull-right")
            .appendTo(div)
            .click(function () {
                div.parent().remove();
            })
            .html("&times;");
        $("<h4/>").appendTo(div).text("Unregistered channel");
        $("<p/>").appendTo(div)
            .html("This channel is not registered to a CyTube account.  You can still " +
                  "use it, but some features will not be available.  To register a " +
                  "channel to your account, visit your <a href='/account/channels'>" +
                  "channels</a> page.");
    },

    registerChannel: function(data) {
        if ($("#chanregisterbtn").length > 0) {
            $("#chanregisterbtn").text("Register it")
                .attr("disabled", false);
        }
        if(data.success) {
            $("#chregnotice").remove();
        }
        else {
            makeAlert("Error", data.error, "alert-danger")
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
        CHANNEL.motd = data.html;
        CHANNEL.motd_text = data.motd;
        if ($("#motdwrap").find(".motdeditor").length > 0) {
            $("#motdwrap .motdeditor").val(CHANNEL.motd_text);
        } else {
            $("#motd").html(CHANNEL.motd);
        }
        $("#motdtext").val(CHANNEL.motd_text);
        if(data.motd != "") {
            $("#motdwrap").show();
            $("#motd").show();
            $("#togglemotd").find(".glyphicon-plus")
                .removeClass("glyphicon-plus")
                .addClass("glyphicon-minus");
        }
        else
            $("#motdwrap").hide();
    },

    chatFilters: function(entries) {
        var tbl = $("#cs-chatfilters table");
        tbl.data("entries", entries);
        formatCSChatFilterList();
    },

    updateChatFilter: function (f) {
        var entries = $("#cs-chatfilters table").data("entries") || [];
        var found = false;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].name === f.name) {
                entries[i] = f;
                found = true;
                break;
            }
        }

        if (!found) {
            entries.push(f);
        }

        $("#cs-chatfilters table").data("entries", entries);
        formatCSChatFilterList();
    },

    deleteChatFilter: function (f) {
        var entries = $("#cs-chatfilters table").data("entries") || [];
        var found = false;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].name === f.name) {
                entries[i] = f;
                found = i;
                break;
            }
        }

        if (found !== false) {
            entries.splice(found, 1);
        }

        $("#cs-chatfilters table").data("entries", entries);
        formatCSChatFilterList();
    },

    channelOpts: function(opts) {
        document.title = opts.pagetitle;
        PAGETITLE = opts.pagetitle;
        $("#chanexternalcss").remove();
        if(opts.externalcss.trim() != "" && !USEROPTS.ignore_channelcss) {
            $("<link/>")
                .attr("rel", "stylesheet")
                .attr("href", opts.externalcss)
                .attr("id", "chanexternalcss")
                .appendTo($("head"));
        }
        if(opts.externaljs.trim() != "" && !USEROPTS.ignore_channeljs) {
            if(opts.externaljs != CHANNEL.opts.externaljs) {
                $.getScript(opts.externaljs);
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
        genPermissionsEditor();
        handlePermissionChange();
    },

    channelCSSJS: function(data) {
        $("#chancss").remove();
        CHANNEL.css = data.css;
        $("#csstext").val(data.css);
        if(data.css && !USEROPTS.ignore_channelcss) {
            $("<style/>").attr("type", "text/css")
                .attr("id", "chancss")
                .text(data.css)
                .appendTo($("head"));
        }

        $("#chanjs").remove();
        CHANNEL.js = data.js;
        $("#jstext").val(data.js);

        if(data.js && !USEROPTS.ignore_channeljs) {
            $("<script/>").attr("type", "text/javascript")
                .attr("id", "chanjs")
                .text(data.js)
                .appendTo($("body"));
        }
    },

    banlist: function(entries) {
        var tbl = $("#cs-banlist table");
        tbl.data("entries", entries);
        formatCSBanlist();
    },

    banlistRemove: function (data) {
        var entries = $("#cs-banlist table").data("entries") || [];
        var found = false;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].id === data.id) {
                found = i;
                break;
            }
        }

        if (found !== false) {
            entries.splice(i, 1);
            $("#cs-banlist table").data("entries", entries);
        }

        formatCSBanlist();
    },

    recentLogins: function(entries) {
        var tbl = $("#loginhistory table");
        // I originally added this check because of a race condition
        // Now it seems to work without but I don't trust it
        if(!tbl.hasClass("table")) {
            setTimeout(function() {
                Callbacks.recentLogins(entries);
            }, 100);
            return;
        }
        if(tbl.children().length > 1) {
            $(tbl.children()[1]).remove();
        }
        for(var i = 0; i < entries.length; i++) {
            var tr = document.createElement("tr");
            var name = $("<td/>").text(entries[i].name).appendTo(tr);
            var aliases = $("<td/>").text(entries[i].aliases.join(", ")).appendTo(tr);
            var time = new Date(entries[i].time).toTimeString();
            $("<td/>").text(time).appendTo(tr);

            $(tr).appendTo(tbl);
        }
    },

    channelRanks: function(entries) {
        var tbl = $("#cs-chanranks table");
        tbl.data("entries", entries);
        formatCSModList();
    },

    channelRankFail: function (data) {
        makeAlert("Error", data.msg, "alert-danger").insertAfter($("#cs-chanranks h4"));
    },

    readChanLog: function (data) {
        var log = $("#cs-chanlog-text");
        if (log.length == 0)
            return;

        if (data.success) {
            setupChanlogFilter(data.data);
            filterChannelLog();
        } else {
            $("#cs-chanlog-text").text("Error reading channel log");
        }
    },

    voteskip: function(data) {
        var icon = $("#voteskip").find(".glyphicon").remove();
        if(data.count > 0) {
            $("#voteskip").text(" ("+data.count+"/"+data.need+")");
        } else {
            $("#voteskip").text("");
        }

        icon.prependTo($("#voteskip"));
    },

    /* REGION Rank Stuff */

    rank: function(r) {
        if (r >= 1) {
            socket.emit("listPlaylists");
        }
        if(r >= 255)
            SUPERADMIN = true;
        CLIENT.rank = r;
        handlePermissionChange();
        if(SUPERADMIN && $("#setrank").length == 0) {
            $("<a/>").attr("href", "/acp")
                .attr("target", "_blank")
                .text("ACP")
                .appendTo($("<li/>").appendTo($(".nav")[0]));
            var li = $("<li/>").addClass("dropdown")
                .attr("id", "setrank")
                .appendTo($(".nav")[0]);
            $("<a/>").addClass("dropdown-toggle")
                .attr("data-toggle", "dropdown")
                .attr("href", "javascript:void(0)")
                .html("Set Rank <b class='caret'></b>")
                .appendTo(li);
            var menu = $("<ul/>").addClass("dropdown-menu")
                .appendTo(li);

            function addRank(r, disp) {
                var li = $("<li/>").appendTo(menu);
                $("<a/>").attr("href", "javascript:void(0)")
                    .html(disp)
                    .click(function() {
                        socket.emit("borrow-rank", r);
                    })
                    .appendTo(li);
            }

            addRank(0, "<span class='userlist_guest'>Guest</span>");
            addRank(1, "<span>Registered</span>");
            addRank(2, "<span class='userlist_op'>Moderator</span>");
            addRank(3, "<span class='userlist_owner'>Admin</span>");
            addRank(255, "<span class='userlist_siteadmin'>Superadmin</span>");
        }
    },

    login: function(data) {
        if (!data.success) {
            if (data.error != "Session expired") {
                errDialog(data.error);
            }
        } else {
            CLIENT.name = data.name;
            CLIENT.guest = data.guest;
            CLIENT.logged_in = true;

            if (!CLIENT.guest) {
                socket.emit("initUserPLCallbacks");
            }
        }
    },

    /* REGION Chat */
    usercount: function(count) {
        CHANNEL.usercount = count;
        var text = count + " connected user";
        if(count != 1) {
            text += "s";
        }
        $("#usercount").text(text);
    },

    chatMsg: function(data) {
        addChatMessage(data);
    },

    joinMessage: function(data) {
        if(USEROPTS.joinmessage)
            addChatMessage(data);
    },

    clearchat: function() {
        $("#messagebuffer").html("");
    },

    userlist: function(data) {
        $(".userlist_item").remove();
        for(var i = 0; i < data.length; i++) {
            Callbacks.addUser(data[i]);
        }
    },

    addUser: function(data) {
        var user = findUserlistItem(data.name);
        // Remove previous instance of user, if there was one
        if(user !== null)
            user.remove();
        var div = $("<div/>")
            .addClass("userlist_item");
        var icon = $("<span/>").appendTo(div);
        var nametag = $("<span/>").text(data.name).appendTo(div);
        div.data("name", data.name);
        div.data("rank", data.rank);
        div.data("leader", Boolean(data.leader));
        div.data("profile", data.profile);
        div.data("meta", data.meta);
        div.data("afk", data.meta.afk);
        if (data.meta.muted || data.meta.smuted) {
            div.data("icon", "glyphicon-volume-off");
        } else {
            div.data("icon", false);
        }
        formatUserlistItem(div, data);
        addUserDropdown(div, data);
        div.appendTo($("#userlist"));
        sortUserlist();
    },

    setUserMeta: function (data) {
        var user = findUserlistItem(data.name);
        if (user == null) {
            return;
        }

        user.data("meta", data.meta);
        if (data.meta.muted || data.meta.smuted) {
            user.data("icon", "glyphicon-volume-off");
        } else {
            user.data("icon", false);
        }

        formatUserlistItem(user, data);
        addUserDropdown(user, data);
        sortUserlist();
    },

    setUserProfile: function (data) {
        var user = findUserlistItem(data.name);
        if (user === null)
            return;
        user.data("profile", data.profile);
        formatUserlistItem(user);
    },

    setLeader: function (name) {
        $(".userlist_item").each(function () {
            $(this).find(".glyphicon-star-empty").remove();
            if ($(this).data("leader")) {
                $(this).data("leader", false);
                addUserDropdown($(this));
            }
        });
        if (name === "") {
            CLIENT.leader = false;
            if(LEADTMR)
                clearInterval(LEADTMR);
            LEADTMR = false;
            return;
        }
        var user = findUserlistItem(name);
        if (user) {
            user.data("leader", true);
            formatUserlistItem(user);
            addUserDropdown(user);
        }
        if (name === CLIENT.name) {
            CLIENT.leader = true;
            // I'm a leader!  Set up sync function
            if(LEADTMR)
                clearInterval(LEADTMR);
            LEADTMR = setInterval(sendVideoUpdate, 5000);
            handlePermissionChange();
        } else if (CLIENT.leader) {
            CLIENT.leader = false;
            handlePermissionChange();
            if(LEADTMR)
                clearInterval(LEADTMR);
            LEADTMR = false;
        }
    },

    setUserRank: function (data) {
        var entries = $("#cs-chanranks table").data("entries") || [];
        var found = false;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].name === data.name) {
                entries[i].rank = data.rank;
                found = i;
                break;
            }
        }
        if (found === false) {
            entries.push(data);
        } else if (entries[found].rank < 2) {
            entries.splice(found, 1);
        }
        formatCSModList();

        var user = findUserlistItem(data.name);
        if (user === null) {
            return;
        }

        user.data("rank", data.rank);
        if (data.name === CLIENT.name) {
            CLIENT.rank = data.rank;
            handlePermissionChange();
        }
        formatUserlistItem(user);
        addUserDropdown(user);
        if (USEROPTS.sort_rank) {
            sortUserlist();
        }
    },

    setUserIcon: function (data) {
        var user = findUserlistItem(data.name);
        if (user === null) {
            return;
        }

        user.data("icon", data.icon);
        formatUserlistItem(user);
    },

    setAFK: function (data) {
        var user = findUserlistItem(data.name);
        if(user === null)
            return;
        user.data("afk", data.afk);
        formatUserlistItem(user);
        if(USEROPTS.sort_afk)
            sortUserlist();
    },

    userLeave: function(data) {
        var user = findUserlistItem(data.name);
        if(user !== null)
            user.remove();
    },

    drinkCount: function(count) {
        if(count != 0) {
            var text = count + " drink";
            if(count != 1) {
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
        PL_QUEUED_ACTIONS = [];
        // Clear the playlist first
        var q = $("#queue");
        q.html("");

        for(var i = 0; i < data.length; i++) {
            var li = makeQueueEntry(data[i], false);
            li.attr("title", data[i].queueby
                                ? ("Added by: " + data[i].queueby)
                                : "Added by: Unknown");
            li.appendTo(q);
        }

        rebuildPlaylist();
    },

    setPlaylistMeta: function(data) {
        var c = data.count + " item";
        if(data.count != 1)
            c += "s";
        $("#plcount").text(c);
        $("#pllength").text(data.time);
    },

    queue: function(data) {
        PL_ACTION_QUEUE.queue(function (plq) {
            var li = makeQueueEntry(data.item, true);
            if (data.item.uid === PL_CURRENT)
                li.addClass("queue_active");
            li.hide();
            var q = $("#queue");
            li.attr("title", data.item.queueby
                                ? ("Added by: " + data.item.queueby)
                                : "Added by: Unknown");
            if (data.after === "prepend") {
                li.prependTo(q);
                li.show("fade", function () {
                    plq.release();
                });
            } else if (data.after === "append") {
                li.appendTo(q);
                li.show("fade", function () {
                    plq.release();
                });
            } else {
                var liafter = playlistFind(data.after);
                if (!liafter) {
                    plq.release();
                    return;
                }
                li.insertAfter(liafter);
                li.show("fade", function () {
                    plq.release();
                });
            }
        });
    },

    queueWarn: function (data) {
        queueMessage(data, "alert-warning");
    },

    queueFail: function (data) {
        queueMessage(data, "alert-danger");
    },

    setTemp: function(data) {
        var li = $(".pluid-" + data.uid);
        if(li.length == 0)
            return false;

        if(data.temp)
            li.addClass("queue_temp");
        else
            li.removeClass("queue_temp");

        li.data("temp", data.temp);
        var btn = li.find(".qbtn-tmp");
        if(btn.length > 0) {
            if(data.temp) {
                btn.html(btn.html().replace("Make Temporary",
                                            "Make Permanent"));
            }
            else {
                btn.html(btn.html().replace("Make Permanent",
                                            "Make Temporary"));
            }
        }
    },

    "delete": function(data) {
        PL_ACTION_QUEUE.queue(function (plq) {
            PL_WAIT_SCROLL = true;
            var li = $(".pluid-" + data.uid);
            li.hide("fade", function() {
                li.remove();
                plq.release();
                PL_WAIT_SCROLL = false;
            });
        });
    },

    moveVideo: function(data) {
        PL_ACTION_QUEUE.queue(function (plq) {
            playlistMove(data.from, data.after, function () {
                plq.release();
            });
        });
    },

    setCurrent: function(uid) {
        PL_CURRENT = uid;
        $("#queue li").removeClass("queue_active");
        var li = $(".pluid-" + uid);
        if (li.length !== 0) {
            li.addClass("queue_active");
            var tmr = setInterval(function () {
                if (!PL_WAIT_SCROLL) {
                    scrollQueue();
                    clearInterval(tmr);
                }
            }, 100);
        }
    },

    changeMedia: function(data) {
        if (PLAYER && typeof PLAYER.getVolume === "function") {
            PLAYER.getVolume(function (v) {
                if (typeof v === "number") {
                    VOLUME = v;
                    setOpt("volume", VOLUME);
                }
            });
        }

        if(CHANNEL.opts.allow_voteskip)
            $("#voteskip").attr("disabled", false);

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

        /*
            VIMEO SIMULATOR 2014

            Vimeo decided to block my domain.  After repeated emails, they refused to
            unblock it.  Rather than give in to their demands, there is a serverside
            option which extracts direct links to the h264 encoded MP4 video files.
            These files can be loaded in a custom player to allow Vimeo playback without
            triggering their dumb API domain block.

            It's a little bit hacky, but my only other option is to keep buying new
            domains every time one gets blocked.  No thanks to Vimeo, who were of no help
            and unwilling to compromise on the issue.
        */
        if (NO_VIMEO && data.type === "vi" && data.direct && data.direct.sd) {
            // For browsers that don't support native h264 playback
            if (USEROPTS.no_h264) {
                data.type = "jw";
            } else {
                data.type = "rv";
            }
            // Right now only plays standard definition.
            // In the future, I may add a quality selector for mobile/standard/HD
            data.url = data.direct.sd.url;
        }

        if(data.type != PLAYER.type) {
            loadMediaPlayer(data);
        }

        handleMediaUpdate(data);
    },

    mediaUpdate: function(data) {
        handleMediaUpdate(data);
    },

    setPlaylistLocked: function (locked) {
        CHANNEL.openqueue = !locked;
        handlePermissionChange();
        if(CHANNEL.openqueue) {
            $("#qlockbtn").removeClass("btn-danger")
                .addClass("btn-success")
                .attr("title", "Playlist Unlocked");
            $("#qlockbtn").find("span")
                .removeClass("glyphicon-lock")
                .addClass("glyphicon-ok");
        }
        else {
            $("#qlockbtn").removeClass("btn-success")
                .addClass("btn-danger")
                .attr("title", "Playlist Locked");
            $("#qlockbtn").find("span")
                .removeClass("glyphicon-ok")
                .addClass("glyphicon-lock");
        }
    },

    searchResults: function(data) {
        $("#search_clear").remove();
        clearSearchResults();
        $("#library").data("entries", data.results);
        $("<button/>").addClass("btn btn-default btn-sm btn-block")
            .css("margin-left", "0")
            .attr("id", "search_clear")
            .text("Clear Results")
            .click(function() {
                clearSearchResults();
            })
            .insertBefore($("#library"));


        $("#search_pagination").remove();
        var opts = {
            preLoadPage: function () {
                $("#library").html("");
            },

            generator: function (item, page, index) {
                var li = makeSearchEntry(item, false);
                if(hasPermission("playlistadd")) {
                    addLibraryButtons(li, item.id, data.source);
                }
                $(li).appendTo($("#library"));
            },

            itemsPerPage: 10
        };

        var p = Paginate(data.results, opts);
        p.paginator.insertAfter($("#library"))
            .addClass("pull-right")
            .attr("id", "search_pagination");
        $("#library").data("paginator", p);
    },

    /* REGION Polls */
    newPoll: function(data) {
        Callbacks.closePoll();
        var pollMsg = $("<div/>").addClass("poll-notify")
            .html(data.initiator + " opened a poll: \"" + data.title + "\"")
            .appendTo($("#messagebuffer"));
        scrollChat();

        var poll = $("<div/>").addClass("well active").prependTo($("#pollwrap"));
        $("<button/>").addClass("close pull-right").html("&times;")
            .appendTo(poll)
            .click(function() { poll.remove(); });
        if(hasPermission("pollctl")) {
            $("<button/>").addClass("btn btn-danger btn-sm pull-right").text("End Poll")
                .appendTo(poll)
                .click(function() {
                    socket.emit("closePoll")
                });
        }

        $("<h3/>").html(data.title).appendTo(poll);
        for(var i = 0; i < data.options.length; i++) {
            (function(i) {
            var callback = function () {
                socket.emit("vote", {
                    option: i
                });
                poll.find(".option button").each(function() {
                    $(this).attr("disabled", "disabled");
                });
                $(this).parent().addClass("option-selected");
            }
            $("<button/>").addClass("btn btn-default btn-sm").text(data.counts[i])
                .prependTo($("<div/>").addClass("option").html(data.options[i])
                        .appendTo(poll))
                .click(callback);
            })(i);

        }

        poll.find(".btn").attr("disabled", !hasPermission("pollvote"));
    },

    updatePoll: function(data) {
        var poll = $("#pollwrap .active");
        var i = 0;
        poll.find(".option button").each(function() {
            $(this).html(data.counts[i]);
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

    listPlaylists: function(data) {
        $("#userpl_list").data("entries", data);
        formatUserPlaylistList();
        return;
        if(data.error) {
            makeAlert("Error", data.error, "alert-danger")
                .insertBefore($("#userpl_list"));
        }
        else {
            var pls = data;
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
                metastr +=", playtime " + pls[i].duration;
                $("<div/>").text(metastr)
                    .css("float", "right")
                    .appendTo(li);
                var bg = $("<div/>").addClass("btn-group")
                    .css("float", "left")
                    .prependTo(li);
                var del = $("<button/>")
                    .addClass("btn btn-xs btn-danger")
                    .prependTo(bg);
                $("<span/>").addClass("glyphicon glyphicon-trash").appendTo(del);
                (function(li) {
                del.click(function() {
                    var go = confirm("Are you sure you want to delete playlist '" + li.data("pl-name") + "'?");
                    if(go) {
                        socket.emit("deletePlaylist", {
                            name: li.data("pl-name")
                        });
                    }
                });
                })(li);
                if(hasPermission("playlistaddlist")) {
                    (function(li) {
                    $("<button/>").addClass("btn btn-xs btn-default")
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
                        $("<button/>").addClass("btn btn-xs btn-default")
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
    },

    emoteList: function (data) {
        loadEmotes(data);
        var tbl = $("#cs-emotes table");
        tbl.data("entries", data);
        formatCSEmoteList();
    },

    updateEmote: function (data) {
        data.regex = new RegExp(data.source, "gi");
        var found = false;
        for (var i = 0; i < CHANNEL.emotes.length; i++) {
            if (CHANNEL.emotes[i].name === data.name) {
                found = true;
                CHANNEL.emotes[i] = data;
                formatCSEmoteList();
                break;
            }
        }

        if (!found) {
            CHANNEL.emotes.push(data);
            formatCSEmoteList();
        }
    },

    removeEmote: function (data) {
        var found = -1;
        for (var i = 0; i < CHANNEL.emotes.length; i++) {
            if (CHANNEL.emotes[i].name === data.name) {
                found = i;
                break;
            }
        }

        if (found !== -1) {
            var row = $("code:contains('" + data.name + "')").parent().parent();
            row.hide("fade", row.remove.bind(row));
            CHANNEL.emotes.splice(i, 1);
        }
    }
}

var SOCKET_DEBUG = true;
setupCallbacks = function() {
    for(var key in Callbacks) {
        (function(key) {
        socket.on(key, function(data) {
            if (SOCKET_DEBUG)
                console.log(key, data);
            Callbacks[key](data);
        });
        })(key);
    }
}

try {
    if (typeof io === "undefined") {
        makeAlert("Uh oh!", "It appears the connection to <code>" + IO_URL + "</code> " +
                            "has failed.  If this error persists, a firewall or " +
                            "antivirus is likely blocking the connection, or the " +
                            "server is down.", "alert-danger")
            .appendTo($("#announcements"));
        throw false;
    }

    if (NO_WEBSOCKETS || USEROPTS.altsocket) {
        var i = io.transports.indexOf("websocket");
        if (i >= 0) {
            io.transports.splice(i, 1);
        }
    }
    var opts = {};
    if (location.protocol === "https:" || USEROPTS.secure_connection) {
        opts.secure = true;
    }
    socket = io.connect(IO_URL, opts);
    setupCallbacks();
} catch (e) {
    if (e) {
        Callbacks.disconnect();
    }
}
