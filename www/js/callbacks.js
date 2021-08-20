Callbacks = {
    /* fired when socket connection completes */
    connect: function() {
        HAS_CONNECTED_BEFORE = true;
        SOCKETIO_CONNECT_ERROR_COUNT = 0;
        $("#socketio-connect-error").remove();
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
        stopQueueSpinner(null);
    },

    disconnect: function() {
        if(KICKED)
            return;
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text("Disconnected from server.")
            .appendTo($("#messagebuffer"));
        scrollChat();
    },

    reconnect: function () {
        socket.emit("reportReconnect");
    },

    // Socket.IO error callback
    error: function (msg) {
        window.SOCKET_ERROR_REASON = msg;
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text("Unable to connect: " + msg)
            .appendTo($("#messagebuffer"));
    },

    errorMsg: function(data) {
        if (data.alert) {
            alert(data.msg);
        } else {
            errDialog(data.msg);
        }
    },

    costanza: function (data) {
        $("#costanza-modal").modal("hide");
        var modal = makeModal();
        modal.attr("id", "costanza-modal")
            .appendTo($("body"));

        var body = $("<div/>").addClass("modal-body")
            .appendTo(modal.find(".modal-content"));
        $("<img/>").attr("src", "http://i0.kym-cdn.com/entries/icons/original/000/005/498/1300044776986.jpg")
            .appendTo(body);

        $("<strong/>").text(data.msg).appendTo(body);
        modal.modal();
    },

    announcement: function(data) {
        // Suppress this announcement for people who have already closed it
        if (data.id && CyTube.ui.suppressedAnnouncementId
                && data.id === CyTube.ui.suppressedAnnouncementId) {
            return;
        }
        $("#announcements").html("");
        var signature = "<br>\u2014" + data.from;
        var announcement = makeAlert(data.title, data.text + signature)
            .appendTo($("#announcements"));
        if (data.id) {
            announcement.find(".close").click(function suppressThisAnnouncement() {
                CyTube.ui.suppressedAnnouncementId = data.id;
                setOpt("suppressed_announcement_id", data.id);
            });
        }
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

    spamFiltered: function(data) {
        var message = "Spam Filtered.";
        switch (data.reason) {
            case "NEW_USER_CHAT":
                message = "Your account is too new to chat in this channel.  " +
                        "Please wait a while and try again.";
                break;
            case "NEW_USER_CHAT_LINK":
                message = "Your account is too new to post links in this channel.  " +
                        "Please wait a while and try again.";
                break;
        }

        errDialog(message);
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
        var parent = chatDialog(div, '9999');
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

    cooldown: function (time) {
        time = time + 200;
        $("#chatline").css("color", "#ff0000");
        $(".pm-input").css("color", "#ff0000");
        if (CHATTHROTTLE && $("#chatline").data("throttle_timer")) {
            clearTimeout($("#chatline").data("throttle_timer"));
        }
        CHATTHROTTLE = true;
        $("#chatline").data("throttle_timer", setTimeout(function () {
            CHATTHROTTLE = false;
            $("#chatline").css("color", "");
            $(".pm-input").css("color", "");
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

    setMotd: function(motd) {
        CHANNEL.motd = motd;
        $("#motd").html(motd);
        $("#cs-motdtext").val(motd);
        if (motd != "") {
            $("#motdwrap").show();
            $("#motd").show();
            $("#togglemotd").find(".glyphicon-plus")
                .removeClass("glyphicon-plus")
                .addClass("glyphicon-minus");
        } else {
            $("#motdwrap").hide();
        }
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

        if (!USEROPTS.ignore_channelcss &&
            opts.externalcss !== CHANNEL.opts.externalcss) {
            $("#chanexternalcss").remove();

            if (opts.externalcss.trim() !== "") {
                $("#chanexternalcss").remove();
                $("<link/>")
                    .attr("rel", "stylesheet")
                    .attr("href", opts.externalcss)
                    .attr("id", "chanexternalcss")
                    .on("load", function () {
                        handleVideoResize();
                    })
                    .appendTo($("head"));
            }
        }

        if(opts.externaljs.trim() != "" && !USEROPTS.ignore_channeljs &&
           opts.externaljs !== CHANNEL.opts.externaljs) {
            var viewSource = document.createElement("a");
            viewSource.className = "btn btn-danger";
            viewSource.setAttribute("role", "button");
            viewSource.setAttribute("target", "_blank");
            viewSource.setAttribute("rel", "noopener noreferer");
            viewSource.textContent = "View external script source";
            viewSource.href = opts.externaljs;
            checkScriptAccess(viewSource, "external", function (pref) {
                if (pref === "ALLOW") {
                    $.getScript(opts.externaljs);
                }
            });
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
        if (CyTube.channelCustomizations.cssHash !== data.cssHash) {
            $("#chancss").remove();
            CHANNEL.css = data.css;
            $("#cs-csstext").val(data.css);
            if(data.css && !USEROPTS.ignore_channelcss) {
                $("<style/>").attr("type", "text/css")
                    .attr("id", "chancss")
                    .text(data.css)
                    .on("load", function () {
                        handleVideoResize();
                    })
                    .appendTo($("head"));
            }

            if (data.cssHash) {
                CyTube.channelCustomizations.cssHash = data.cssHash;
            }
        }

        if (CyTube.channelCustomizations.jsHash !== data.jsHash) {
            $("#chanjs").remove();
            CHANNEL.js = data.js;
            $("#cs-jstext").val(data.js);

            if(data.js && !USEROPTS.ignore_channeljs) {
                var viewSource = document.createElement("button");
                viewSource.className = "btn btn-danger";
                viewSource.textContent = "View inline script source";
                viewSource.onclick = function () {
                    var content = document.createElement("pre");
                    content.textContent = data.js;
                    modalAlert({
                        title: "Inline JS",
                        htmlContent: content.outerHTML,
                        dismissText: "Close"
                    });
                };

                checkScriptAccess(viewSource, "embedded", function (pref) {
                    if (pref === "ALLOW") {
                        $("<script/>").attr("type", "text/javascript")
                            .attr("id", "chanjs")
                            .text(data.js)
                            .appendTo($("body"));
                    }
                });
            }

            if (data.jsHash) {
                CyTube.channelCustomizations.jsHash = data.jsHash;
            }
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

    channelRanks: function(entries) {
        var tbl = $("#cs-chanranks table");
        tbl.data("entries", entries);
        formatCSModList();
    },

    channelRankFail: function (data) {
        if ($("#cs-chanranks").is(":visible")) {
            makeAlert("Error", data.msg, "alert-danger")
                .removeClass().addClass("vertical-spacer")
                .insertAfter($("#cs-chanranks form"));
        } else {
            Callbacks.noflood({ action: "/rank", msg: data.msg });
        }
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
        if(r >= 255)
            SUPERADMIN = true;
        CLIENT.rank = r;
        handlePermissionChange();
        if(SUPERADMIN && $("#setrank").length == 0) {
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

    pm: function (data) {
        var name = data.username;
        if (IGNORED.indexOf(name) !== -1) {
            return;
        }

        var ping = false;

        if (data.username === CLIENT.name) {
            name = data.to;
        } else {
            ping = true;
        }
        var pm = initPm(name);
        var msg = formatChatMessage(data, pm.data("last"));
        var buffer = pm.find(".pm-buffer");
        msg.appendTo(buffer);
        buffer.scrollTop(buffer.prop("scrollHeight"));
        if (pm.find(".panel-body").is(":hidden")) {
            pm.removeClass("panel-default").addClass("panel-primary");
        }

        if (ping) {
            pingMessage(true, "PM: " + name, $(msg.children()[2]).text());
        }
    },

    clearchat: function() {
        $("#messagebuffer").html("");
        LASTCHAT.name = "";
    },

    userlist: function(data) {
        $(".userlist_item").remove();
        for(var i = 0; i < data.length; i++) {
            CyTube._internal_do_not_use_or_you_will_be_banned.addUserToList(data[i], false);
        }
        sortUserlist();
    },

    addUser: function(data) {
        CyTube._internal_do_not_use_or_you_will_be_banned.addUserToList(data, true);
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

        /*
         * 2017-06-15
         * TODO: Remove this and the empty function below
         *         after script authors have had ample time to update
         */
        socket.listeners('setAFK').forEach(function(listener){
            listener({ name: data.name, afk: data.meta.afk });
        });

        formatUserlistItem(user, data);
        addUserDropdown(user, data);
        sortUserlist();
    },

    setAFK: function() {
        return true;
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
        data.name = data.name.toLowerCase();
        var entries = $("#cs-chanranks table").data("entries") || [];
        var found = false;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].name.toLowerCase() === data.name) {
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
            stopQueueSpinner(data.item.media);
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
        if (data.id) {
            stopQueueSpinner(data);
        }
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
        if ($("body").hasClass("chatOnly") || $("#videowrap").length === 0) {
            return;
        }

        // Failsafe
        if (isNaN(VOLUME) || VOLUME > 1 || VOLUME < 0) {
            VOLUME = 1;
        }

        function loadNext() {
            if (!PLAYER || data.type !== PLAYER.mediaType) {
                loadMediaPlayer(data);
            } else {
                handleMediaUpdate(data);
            }
        }

        // Persist the user's volume preference from the the player, if possible
        if (PLAYER && typeof PLAYER.getVolume === "function") {
            PLAYER.getVolume(function (v) {
                if (typeof v === "number") {
                    if (v < 0 || v > 1) {
                        // Dailymotion's API was wrong once and caused a huge
                        // headache.  This alert is here to make debugging easier.
                        alert("Something went wrong with retrieving the volume.  " +
                            "Please tell calzoneman the following: " +
                            JSON.stringify({
                                v: v,
                                t: PLAYER.mediaType,
                                i: PLAYER.mediaId
                            }));
                    } else {
                        VOLUME = v;
                        setOpt("volume", VOLUME);
                    }
                }

                loadNext();
            });
        } else {
            loadNext();
        }

        // Reset voteskip since the video changed
        if (CHANNEL.opts.allow_voteskip) {
            $("#voteskip").attr("disabled", false);
        }

        $("#currenttitle").text("Currently Playing: " + data.title);
    },

    mediaUpdate: function(data) {
        if ($("body").hasClass("chatOnly") || $("#videowrap").length === 0) {
            return;
        }

        if (PLAYER) {
            handleMediaUpdate(data);
        }
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
                if(hasPermission("playlistadd") || hasPermission("deletefromchannellib")) {
                    addLibraryButtons(li, item, data.source);
                }
                $(li).appendTo($("#library"));
            },

            itemsPerPage: 100
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
                    $(this).removeClass("active");
                    $(this).parent().removeClass("option-selected");
                });
                $(this).addClass("active");
                $(this).parent().addClass("option-selected");
            }
            $("<button/>").addClass("btn btn-default btn-sm").text(data.counts[i])
                .prependTo($("<div/>").addClass("option").html(data.options[i])
                        .appendTo(poll))
                .click(callback);
            })(i);

        }
        $("<span/>").addClass("label label-default pull-right").data('timestamp',data.timestamp).appendTo(poll)
            .attr('title', 'Poll opened by ' + data.initiator).data('initiator',data.initiator)
            .text(new Date(data.timestamp).toTimeString().split(" ")[0]);

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
    },

    emoteList: function (data) {
        loadEmotes(data);
        EMOTELIST.handleChange();
        CSEMOTELIST.handleChange();
    },

    updateEmote: function (data) {
        data.regex = new RegExp(data.source, "gi");
        var found = false;
        for (var i = 0; i < CHANNEL.emotes.length; i++) {
            if (CHANNEL.emotes[i].name === data.name) {
                found = true;
                CHANNEL.emotes[i] = data;
                break;
            }
        }
        for (var i = 0; i < CHANNEL.badEmotes.length; i++) {
            if (CHANNEL.badEmotes[i].name === data.name) {
                CHANNEL.badEmotes[i] = data;
                break;
            }
        }

        if (!found) {
            CHANNEL.emotes.push(data);
            if (/\s/g.test(data.name)) {
                CHANNEL.badEmotes.push(data);
            } else {
                CHANNEL.emoteMap[data.name] = data;
            }
        } else {
            CHANNEL.emoteMap[data.name] = data;
        }

        EMOTELIST.handleChange();
        CSEMOTELIST.handleChange();
    },

    renameEmote: function (data) {
        var badBefore = /\s/g.test(data.old);
        var badAfter = /\s/g.test(data.name);
        var oldName = data.old;
        delete data.old;

        data.regex = new RegExp(data.source, "gi");

        for (var i = 0; i < CHANNEL.emotes.length; i++) {
            if (CHANNEL.emotes[i].name === oldName) {
                CHANNEL.emotes[i] = data;
                break;
            }
        }

        // Now bad
        if(badAfter){
            // But wasn't bad before: Add it to bad list
            if(!badBefore){
                CHANNEL.badEmotes.push(data);
                delete CHANNEL.emoteMap[oldName];
            }
            // Was bad before too: Update
            else {
                for (var i = 0; i < CHANNEL.badEmotes.length; i++) {
                    if (CHANNEL.badEmotes[i].name === oldName) {
                        CHANNEL.badEmotes[i] = data;
                        break;
                    }
                }
            }
        }
        // Not bad now
        else {
            // But was bad before: Drop from list
            if(badBefore){
                for (var i = 0; i < CHANNEL.badEmotes.length; i++) {
                    if (CHANNEL.badEmotes[i].name === oldName) {
                        CHANNEL.badEmotes.splice(i, 1);
                        break;
                    }
                }
            } else {
                delete CHANNEL.emoteMap[oldName];
            }
            CHANNEL.emoteMap[data.name] = data;
        }

        EMOTELIST.handleChange();
        CSEMOTELIST.handleChange();
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
            delete CHANNEL.emoteMap[data.name];
            for (var i = 0; i < CHANNEL.badEmotes.length; i++) {
                if (CHANNEL.badEmotes[i].name === data.name) {
                    CHANNEL.badEmotes.splice(i, 1);
                    break;
                }
            }
        }
    },

    warnLargeChandump: function (data) {
        function toHumanReadable(size) {
            if (size > 1048576) {
                return Math.floor((size / 1048576) * 100) / 100 + "MiB";
            } else if (size > 1024) {
                return Math.floor((size / 1024) * 100) / 100 + "KiB";
            } else {
                return size + "B";
            }
        }

        if ($("#chandumptoobig").length > 0) {
            $("#chandumptoobig").remove();
        }

        errDialog("This channel currently exceeds the maximum size of " +
            toHumanReadable(data.limit) + " (channel size is " +
            toHumanReadable(data.actual) + ").  Please reduce the size by removing " +
            "unneeded playlist items, filters, and/or emotes.  Changes to the channel " +
            "will not be saved until the size is reduced to under the limit.")
            .attr("id", "chandumptoobig");
    },

    partitionChange: function (socketConfig) {
        window.socket.disconnect();
        HAS_CONNECTED_BEFORE = false;
        ioServerConnect(socketConfig);
        setupCallbacks();
    },

    validationError: function (error) {
        var target = $(error.target);
        target.parent().find(".text-danger").remove();

        var formGroup = target.parent();
        while (!formGroup.hasClass("form-group") && formGroup.length > 0) {
            formGroup = formGroup.parent();
        }

        if (formGroup.length > 0) {
            formGroup.addClass("has-error");
        }

        $("<p/>").addClass("text-danger")
                .text(error.message)
                .insertAfter(target);
    },

    validationPassed: function (data) {
        var target = $(data.target);
        target.parent().find(".text-danger").remove();

        var formGroup = target.parent();
        while (!formGroup.hasClass("form-group") && formGroup.length > 0) {
            formGroup = formGroup.parent();
        }

        if (formGroup.length > 0) {
            formGroup.removeClass("has-error");
        }
    },

    clearVoteskipVote: function () {
        if (CHANNEL.opts.allow_voteskip && hasPermission("voteskip")) {
            $("#voteskip").attr("disabled", false);
        }
    }
}

var SOCKET_DEBUG = localStorage.getItem('cytube_socket_debug') === 'true';
setupCallbacks = function() {
    for(var key in Callbacks) {
        (function(key) {
            socket.on(key, function(data) {
                if (SOCKET_DEBUG) {
                    console.log(key, data);
                }
                try {
                    Callbacks[key](data);
                } catch (e) {
                    if (SOCKET_DEBUG) {
                        console.log("EXCEPTION: " + e + "\n" + e.stack);
                    }
                }
            });
        })(key);
    }

    socket.on("connect_error", function (error) {
        // If the socket has connected at least once during this
        // session and now gets a connect error, it is likely because
        // the server is down temporarily and not because of any configuration
        // issue.  Therefore, omit the warning message about refreshing.
        if (HAS_CONNECTED_BEFORE) {
            return;
        }

        SOCKETIO_CONNECT_ERROR_COUNT++;
        if (SOCKETIO_CONNECT_ERROR_COUNT >= 3 &&
                $("#socketio-connect-error").length === 0) {
            var message = "Failed to connect to the server.  Try clearing your " +
                          "cache and refreshing the page.";
            makeAlert("Error", message, "alert-danger")
                .attr("id", "socketio-connect-error")
                .appendTo($("#announcements"));
        }
    });
};

function ioServerConnect(socketConfig) {
    if (socketConfig.error) {
        makeAlert("Error", "Socket.io configuration returned error: " +
                socketConfig.error, "alert-danger")
            .appendTo($("#announcements"));
        return;
    }

    var servers;
    if (socketConfig.alt && socketConfig.alt.length > 0 &&
            localStorage.useAltServer === "true") {
        servers = socketConfig.alt;
        console.log("Using alt servers: " + JSON.stringify(servers));
    } else {
        servers = socketConfig.servers;
    }

    var chosenServer = null;
    servers.forEach(function (server) {
        if (chosenServer === null) {
            chosenServer = server;
        } else if (server.secure && !chosenServer.secure) {
            chosenServer = server;
        } else if (!server.ipv6Only && chosenServer.ipv6Only) {
            chosenServer = server;
        }
    });

    console.log("Connecting to " + JSON.stringify(chosenServer));

    if (chosenServer === null) {
        makeAlert("Error",
                "Socket.io configuration was unable to find a suitable server",
                "alert-danger")
            .appendTo($("#announcements"));
    }

    var opts = {
        secure: chosenServer.secure,
        withCredentials: true // enable cookies for auth
    };

    window.socket = io(chosenServer.url, opts);
}

var USING_LETS_ENCRYPT = false;

function initSocketIO(socketConfig) {
    function genericConnectionError() {
        var message = "The socket.io library could not be loaded from <code>" +
                      source + "</code>.  Ensure that it is not being blocked " +
                      "by a script blocking extension or firewall and try again.";
        makeAlert("Error", message, "alert-danger")
            .appendTo($("#announcements"));
        Callbacks.disconnect();
    }

    if (typeof io === "undefined") {
        var script = document.getElementById("socketio-js");
        var source = "unknown";
        if (script) {
            source = script.src;
        }

        if (/^https/.test(source) && location.protocol === "http:"
                && USING_LETS_ENCRYPT) {
            checkLetsEncrypt(socketConfig, genericConnectionError);
            return;
        }

        genericConnectionError();
        return;
    }

    ioServerConnect(socketConfig);
    setupCallbacks();
}

function checkLetsEncrypt(socketConfig, nonLetsEncryptError) {
    var servers = socketConfig.servers.filter(function (server) {
        return !server.secure && !server.ipv6Only
    });

    if (servers.length === 0) {
        nonLetsEncryptError();
        return;
    }

    $.ajax({
        url: servers[0].url + "/socket.io/socket.io.js",
        dataType: "script",
        timeout: 10000
    }).done(function () {
        var message = "Your browser cannot connect securely because it does " +
                      "not support the newer Let's Encrypt certificate " +
                      "authority.  Click below to acknowledge and continue " +
                      "connecting over an unencrypted connection.  See " +
                      "<a href=\"https://community.letsencrypt.org/t/which-browsers-and-operating-systems-support-lets-encrypt/4394\" target=\"_blank\">here</a> " +
                      "for more details.";
        var connectionAlert = makeAlert("Error", message, "alert-danger")
            .appendTo($("#announcements"));

        var button = document.createElement("button");
        button.className = "btn btn-default";
        button.textContent = "Connect Anyways";

        var alertBox = connectionAlert.find(".alert")[0];
        alertBox.appendChild(document.createElement("hr"));
        alertBox.appendChild(button);

        button.onclick = function connectAnyways() {
            ioServerConnect({
                servers: servers
            });
            setupCallbacks();
        };
    }).error(function () {
        nonLetsEncryptError();
    });
}

(function () {
    $.getJSON("/socketconfig/" + CHANNEL.name + ".json")
        .done(function (socketConfig) {
            initSocketIO(socketConfig);
        }).fail(function () {
            makeAlert("Error", "Failed to retrieve socket.io configuration.  " +
                               "Please try again in a few minutes.",
                    "alert-danger")
                .appendTo($("#announcements"));
            Callbacks.disconnect();
        });
})();
