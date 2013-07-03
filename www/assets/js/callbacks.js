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
        // Guest auto-relogin
        else if(CLIENT.name) {
            socket.emit("login", {
                name: CLIENT.name
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
        CHANNEL.motd = data.html;
        $("#motd").html(data.html);
        $("#motdtext").val(CHANNEL.motd);
        if(data.motd != "")
            $("#motd").show();
        else
            $("#motd").hide();
    },

    chatFilters: function(entries) {
        var tbl = $("#filteredit table");
        if(!tbl.hasClass("table")) {
            setTimeout(function() {
                Callbacks.chatFilters(entries);
            }, 100);
            return;
        }
        tbl.find(".filter-row").remove();
        for(var i = 0; i < entries.length; i++) {
            var f = entries[i];
            var tr = $("<tr/>").appendTo(tbl).addClass("filter-row");
            var remove = $("<button/>").addClass("btn btn-mini btn-danger")
                .appendTo($("<td/>").appendTo(tr));
            $("<i/>").addClass("icon-trash").appendTo(remove);
            var name = $("<code/>").text(f.name)
                .appendTo($("<td/>").appendTo(tr));
            var regex = $("<code/>").text(f.source)
                .appendTo($("<td/>").appendTo(tr));
            var flags = $("<code/>").text(f.flags)
                .appendTo($("<td/>").appendTo(tr));
            var replace = $("<code/>").text(f.replace)
                .appendTo($("<td/>").appendTo(tr));
            var linktd = $("<td/>").appendTo(tr);
            var link = $("<input/>").attr("type", "checkbox")
                .prop("checked", f.filterlinks).appendTo(linktd);
            var activetd = $("<td/>").appendTo(tr);
            var active = $("<input/>").attr("type", "checkbox")
                .prop("checked", f.active).appendTo(activetd);
            (function(f) {
                regex.click(function() {
                    if(this.find(".filter-regex-edit").length > 0)
                        return;
                    var r = this.text();
                    this.text("");
                    var edit = $("<input/>").attr("type", "text")
                        .css("font-family", "Monospace")
                        .attr("placeholder", r)
                        .val(r)
                        .addClass("filter-regex-edit")
                        .appendTo(this)
                        .focus();

                    function save() {
                        var r = this.val();
                        var r2 = r;
                        if(r.trim() == "")
                            r = this.attr("placeholder");
                        this.parent().text(r);
                        f.source = r;
                        socket.emit("updateFilter", f);
                    }
                    edit.blur(save.bind(edit));
                    edit.keydown(function(ev) {
                        if(ev.keyCode == 13)
                            save.bind(edit)();
                    });
                }.bind(regex));
                flags.click(function() {
                    if(this.find(".filter-flags-edit").length > 0)
                        return;
                    var r = this.text();
                    this.text("");
                    var edit = $("<input/>").attr("type", "text")
                        .css("font-family", "Monospace")
                        .attr("placeholder", r)
                        .val(r)
                        .addClass("filter-flags-edit")
                        .appendTo(this)
                        .focus();

                    function save() {
                        var r = this.val();
                        var r2 = r;
                        if(r.trim() == "")
                            r = this.attr("placeholder");
                        this.parent().text(r);
                        f.flags = r;
                        socket.emit("updateFilter", f);
                    }
                    edit.blur(save.bind(edit));
                    edit.keydown(function(ev) {
                        if(ev.keyCode == 13)
                            save.bind(edit)();
                    });
                }.bind(flags));
                replace.click(function() {
                    if(this.find(".filter-replace-edit").length > 0)
                        return;
                    var r = this.text();
                    this.text("");
                    var edit = $("<input/>").attr("type", "text")
                        .css("font-family", "Monospace")
                        .attr("placeholder", r)
                        .val(r)
                        .addClass("filter-replace-edit")
                        .appendTo(this)
                        .focus();

                    function save() {
                        var r = this.val();
                        var r2 = r;
                        if(r.trim() == "")
                            r = this.attr("placeholder");
                        this.parent().text(r);
                        f.replace = r;
                        socket.emit("updateFilter", f);
                    }
                    edit.blur(save.bind(edit));
                    edit.keydown(function(ev) {
                        if(ev.keyCode == 13)
                            save.bind(edit)();
                    });
                }.bind(replace));

                remove.click(function() {
                    socket.emit("removeFilter", f);
                });

                active.click(function() {
                    // Apparently when you check a checkbox, its value is changed
                    // before this callback.  When you uncheck it, its value is not
                    // changed before this callback
                    // [](/amgic)
                    var enabled = active.prop("checked");
                    f.active = (f.active == enabled) ? !enabled : enabled;
                    socket.emit("updateFilter", f);
                });
                link.click(function() {
                    var enabled = link.prop("checked");
                    f.filterlinks = (f.filterlinks == enabled) ? !enabled : enabled;
                    socket.emit("updateFilter", f);
                });
            })(f);
        }

        $(tbl.children()[1]).sortable({
            start: function(ev, ui) {
                FILTER_FROM = ui.item.prevAll().length;
            },
            update: function(ev, ui) {
                FILTER_TO = ui.item.prevAll().length;
                if(FILTER_TO != FILTER_FROM) {
                    socket.emit("moveFilter", {
                        from: FILTER_FROM,
                        to: FILTER_TO
                    });
                }
            }
        });
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
        if(CLIENT.rank >= Rank.Admin)
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
        var tbl = $("#banlist table");
        // I originally added this check because of a race condition
        // Now it seems to work without but I don't trust it
        if(!tbl.hasClass("table")) {
            setTimeout(function() {
                Callbacks.banlist(entries);
            }, 100);
            return;
        }
        if(tbl.children().length > 1) {
            $(tbl.children()[1]).remove();
        }
        for(var i = 0; i < entries.length; i++) {
            var tr = document.createElement("tr");
            var remove = $("<button/>").addClass("btn btn-mini btn-danger")
                .appendTo($("<td/>").appendTo(tr));
            $("<i/>").addClass("icon-remove-circle").appendTo(remove);
            var ip = $("<td/>").text(entries[i].ip_displayed).appendTo(tr);
            var name = $("<td/>").text(entries[i].name).appendTo(tr);
            var aliases = $("<td/>").text(entries[i].aliases.join(", ")).appendTo(tr);
            var banner = $("<td/>").text(entries[i].banner).appendTo(tr);

            var callback = (function(ip_hidden, name) { return function() {
                socket.emit("unban", {
                    ip_hidden: ip_hidden,
                    name: name
                });
            } })(entries[i].ip_hidden, entries[i].name);
            remove.click(callback);

            $(tr).appendTo(tbl);
        }
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
        var tbl = $("#channelranks table");
        // I originally added this check because of a race condition
        // Now it seems to work without but I don't trust it
        if(!tbl.hasClass("table")) {
            setTimeout(function() {
                Callbacks.channelRanks(entries);
            }, 100);
            return;
        }
        entries.sort(function(a, b) {
            var x = a.name.toLowerCase();
            var y = b.name.toLowerCase();
            return y == x ? 0 : (x < y ? -1 : 1);
        });
        $("#channelranks").data("entries", entries);
        if(tbl.children().length > 1) {
            $(tbl.children()[1]).remove();
        }
        $("#channelranks_pagination").remove();
        if(entries.length > 20) {
            var pag = $("<div/>").addClass("pagination span12")
                .attr("id", "channelranks_pagination")
                .prependTo($("#channelranks"));
            var btns = $("<ul/>").appendTo(pag);
            for(var i = 0; i < entries.length / 20; i++) {
                var li = $("<li/>").appendTo(btns);
                (function(i) {
                $("<a/>").attr("href", "javascript:void(0)")
                    .text(i+1)
                    .click(function() {
                        loadChannelRanksPage(i);
                    })
                    .appendTo(li);
                })(i);
            }
        }
        loadChannelRanksPage(0);
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
        loadChannelRanksPage($("#channelranks").data("page"));
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
        if(r >= 255)
            SUPERADMIN = true;
        CLIENT.rank = r;
        handlePermissionChange();
        if(SUPERADMIN && $("#setrank").length == 0) {
            $("<a/>").attr("href", "/acp.html")
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

    joinMessage: function(data) {
        if(USEROPTS.joinmessage)
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
        queueAction({
            fn: function () {
                var li = makeQueueEntry(data.item, true);
                li.hide();
                var q = $("#queue");
                li.attr("title", data.item.queueby
                                    ? ("Added by: " + data.item.queueby)
                                    : "Added by: Unknown");
                if(data.after === "prepend") {
                    li.prependTo(q);
                    li.show("blind");
                    return true;
                }
                else if(data.after === "append") {
                    li.appendTo(q);
                    li.show("blind");
                    return true;
                }
                else {
                    var liafter = playlistFind(data.after);
                    if(!liafter) {
                        return false;
                    }
                    li.insertAfter(liafter);
                    li.show("blind");
                    return true;
                }
            }
        });
    },

    queueFail: function(data) {
        if(!data) {
            data = "Queue failed.  Check your link to make sure it is valid.";
        }
        makeAlert("Error", data, "alert-error")
            .addClass("span12")
            .insertAfter($("#mediaurl").parent());
    },

    setTemp: function(data) {
        var li = $(".pluid-" + data.uid);
        if(li.length == 0)
            return false;

        if(data.temp)
            li.addClass("queue_temp");
        else
            li.removeClass("queue_temp");

        var btn = li.find(".qbtn-tmp");
        if(btn.length > 0) {
            btn.data("temp", data.temp);
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
        queueAction({
            fn: function () {
                var li = $(".pluid-" + data.uid);
                li.hide("blind", function() {
                    li.remove();
                });
            }
        });
    },

    moveVideo: function(data) {
        if(data.moveby != CLIENT.name) {
            queueAction({
                fn: function () {
                    playlistMove(data.from, data.after);
                }
            });
        }
    },

    setCurrent: function(uid) {
        queueAction({
            fn: function () {
                PL_CURRENT = uid;
                var qli = $("#queue li");
                qli.removeClass("queue_active");
                var li = $(".pluid-" + uid);
                if(li.length == 0) {
                    return false;
                }

                li.addClass("queue_active");
                $("#queue").scrollTop(0);
                var scroll = li.position().top - $("#queue").position().top;
                $("#queue").scrollTop(scroll);
            }
        });
    },

    changeMedia: function(data) {
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
        $("#search_clear").remove();
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
        $("<button/>").addClass("btn btn-block")
            .addClass("span12")
            .css("margin-left", "0")
            .attr("id", "search_clear")
            .text("Clear Results")
            .click(function() {
                clearSearchResults();
            })
            .insertBefore($("#library"));
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
        var poll = $("#pollwrap .active");
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

var SOCKET_DEBUG = true;
setupCallbacks = function() {
    for(var key in Callbacks) {
        (function(key) {
        socket.on(key, function(data) {
            if(SOCKET_DEBUG)
                console.log(key, data);
            Callbacks[key](data);
        });
        })(key);
    }
}

if(USEROPTS.altsocket) {
    socket = new NotWebsocket();
    setupCallbacks();
}
else {
    $.getScript(IO_URL+"/socket.io/socket.io.js", function() {
        try {
            if(NO_WEBSOCKETS) {
                var i = io.transports.indexOf("websocket");
                if(i >= 0)
                    io.transports.splice(i, 1);
            }
            socket = io.connect(IO_URL);
            setupCallbacks();
        }
        catch(e) {
            Callbacks.disconnect();
        }
    });
}
