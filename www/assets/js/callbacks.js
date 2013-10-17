/*
return null;
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

Callbacks = {

    error: function (reason) {
        // Don't show the error for when the server goes down
        if(reason && reason.returnValue === true)
            return;

        var d = $("<div/>").addClass("alert alert-error span12")
            .appendTo($("#announcements"));
        $("<h3/>").text("Uh-oh!").appendTo(d);
        $("<p/>").html("The socket.io connection failed."+
                       "Try going to the "+
                       "'Options' menu and enabling 'Alternate socket "+
                       " connection'.  If that doesn't help, talk to "+
                       "someone on <a href='http://webchat.6irc.net/?"+
                       "channels=synchtube'>IRC</a>").appendTo(d);
        var data = {
            iourl: IO_URL,
            weburl: WEB_URL,
            transports: io.transports,
            fallback: USEROPTS.altsocket,
            reason: reason
        };

        var r = JSON.stringify(data);
        $("<em/>").text("When asking for help, give the following "+
                        "information to an administrator:").appendTo(d);
        $("<code/>").text(r).appendTo(d)
            .css("white-space", "pre-wrap");
    },

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
        errDialog(data.msg);
    },

    costanza: function (data) {
        hidePlayer();
        $("#costanza-modal").modal("hide");
        var modal = $("<div/>").addClass("modal hide fade")
            .attr("id", "costanza-modal")
            .appendTo($("body"));


        var body = $("<div/>").addClass("modal-body").appendTo(modal);
        $("<button/>").addClass("close")
            .attr("data-dismiss", "modal")
            .attr("data-hidden", "true")
            .html("&times;")
            .appendTo(body);
        $("<img/>").attr("src", "http://i0.kym-cdn.com/entries/icons/original/000/005/498/1300044776986.jpg")
            .appendTo(body);

        $("<strong/>").text(data.msg).appendTo(body);

        modal.on("hidden", function () {
            modal.remove();
            unhidePlayer();
        });

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

    channelNotRegistered: function() {
        var div = $("<div/>").addClass("alert alert-info")
            .attr("id", "chregnotice")
            .insertBefore($("#main"));
        $("<button/>").addClass("close pull-right").html("&times;")
            .appendTo(div)
            .click(function() { div.remove(); });
        $("<h3/>").text("This channel isn't registered").appendTo(div);
        $("<button/>").addClass("btn btn-primary").text("Register it")
            .attr("id", "chanregisterbtn")
            .appendTo(div)
            .click(function() {
                $(this).attr("disabled", true)
                    .text("Registering...");
                socket.emit("registerChannel");
            });
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
        CHANNEL.motd_text = data.motd;
        $("#motd").html(data.html);
        $("#motdtext").val(CHANNEL.motd_text);
        if(data.motd != "") {
            $("#motdwrap").show();
            $("#motd").show();
            $("#togglemotd").find(".icon-plus")
                .removeClass("icon-plus")
                .addClass("icon-minus");
        }
        else
            $("#motdwrap").hide();
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
        var p = tbl.data("paginator");
        if(p) {
            p.items = entries;
            p.loadPage(0);
        }
        else {
            var opts = {
                preLoadPage: function (p) {
                    tbl.find("tbody").remove();
                    tbl.data("page", p);
                },
                generator: function (item, page, index) {
                    var tr = $("<tr/>").appendTo(tbl);
                    var name = $("<td/>").text(item.name).appendTo(tr);
                    name.addClass(getNameColor(item.rank));
                    var rank = $("<td/>").text(item.rank)
                        .css("min-width", "220px")
                        .appendTo(tr);
                    rank.click(function() {
                        if(this.find(".rank-edit").length > 0)
                            return;
                        var r = this.text();
                        this.text("");
                        var edit = $("<input/>").attr("type", "text")
                            .attr("placeholder", r)
                            .addClass("rank-edit")
                            .appendTo(this)
                            .focus();
                        if(parseInt(r) >= CLIENT.rank) {
                            edit.attr("disabled", true);
                        }
                        function save() {
                            var r = this.val();
                            var r2 = r;
                            if(r.trim() == "" || parseInt(r) >= CLIENT.rank || parseInt(r) < 1)
                                r = this.attr("placeholder");
                            r = parseInt(r) + "";
                            this.parent().text(r);
                            socket.emit("setChannelRank", {
                                user: item.name,
                                rank: parseInt(r)
                            });
                        }
                        edit.blur(save.bind(edit));
                        edit.keydown(function(ev) {
                            if(ev.keyCode == 13)
                                save.bind(edit)();
                        });
                    }.bind(rank));
                }
            };
            var p = Paginate(entries, opts);
            p.paginator.insertBefore($("#channelranks table"));
            tbl.data("paginator", p);
        }
    },

    setChannelRank: function(data) {
        var ents = $("#channelranks").data("entries");
        if(typeof ents === "undefined")
            return;
        for(var i = 0; i < ents.length; i++) {
            if(ents[i].name == data.user) {
                ents[i].rank = data.rank;
                break;
            }
        }
        $("#channelranks").data("entries", ents);
        $("#channelranks table").data("paginator").loadPage(
            $("#channelranks table").data("page")
        );
    },

    readChanLog: function (data) {
        var log = $("#chanlog_contents");
        if(log.length == 0)
            return;

        if(data.success) {
            log.text(data.data);
        } else {
            log.text("Error reading channel log");
        }
        log.scrollTop(log.prop("scrollHeight"));
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
            if(data.error != "Session expired") {
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
        $(".userlist_item").each(function() { $(this).remove(); });
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
        var flair = $("<span/>").appendTo(div);
        var nametag = $("<span/>").text(data.name).appendTo(div);
        formatUserlistItem(div, data);
        addUserDropdown(div, data);
        div.appendTo($("#userlist"));
        sortUserlist();
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
                LEADTMR = setInterval(sendVideoUpdate, 5000);
            }
            // I'm not a leader.  Don't send syncs to the server
            else {
                if(LEADTMR)
                    clearInterval(LEADTMR);
                LEADTMR = false;
            }

        }
        var user = findUserlistItem(data.name);
        if(user !== null) {
            formatUserlistItem(user, data);
            addUserDropdown(user, data);
            if(USEROPTS.sort_rank)
                sortUserlist();
        }
    },

    setAFK: function (data) {
        var user = findUserlistItem(data.name);
        if(user === null)
            return;
        user.find(".icon-time").remove();
        $(user[0].children[1]).css("font-style", "");
        if(data.afk) {
            $("<i/>").addClass("icon-time")
                .appendTo(user[0].children[0]);
            $(user[0].children[1]).css("font-style", "italic");
        }
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
                li.show("blind", function () {
                    plq.release();
                });
            } else if (data.after === "append") {
                li.appendTo(q);
                li.show("blind", function () {
                    plq.release();
                });
            } else {
                var liafter = playlistFind(data.after);
                if (!liafter) {
                    plq.release();
                    return;
                }
                li.insertAfter(liafter);
                li.show("blind", function () {
                    plq.release();
                });
            }
        });
    },

    queueFail: function (data) {
        if (!data)
            data = { link: null };
        if (!data.msg || data.msg === true) {
            data.msg = "Queue failed.  Check your link to make sure it is valid.";
        }
        var alerts = $(".qfalert");
        for (var i = 0; i < alerts.length; i++) {
            var al = $(alerts[i]);
            var cl = al.clone();
            cl.children().remove();
            if (cl.text() === data.msg) {
                var tag = al.find(".label-important");
                if (tag.length > 0) {
                    var morelinks = al.find(".qflinks");
                    $("<a/>").attr("href", data.link)
                        .attr("target", "_blank")
                        .text(data.link)
                        .appendTo(morelinks);
                    $("<br/>").appendTo(morelinks);
                    var count = parseInt(tag.text().match(/\d+/)[0]) + 1;
                    tag.text(tag.text().replace(/\d+/, ""+count));
                } else {
                    var tag = $("<span/>")
                        .addClass("label label-important pull-right pointer")
                        .text("+ 1 more")
                        .appendTo(al);
                    var morelinks = $("<div/>")
                        .addClass("qflinks")
                        .appendTo(al)
                        .hide();
                    $("<a/>").attr("href", data.link)
                        .attr("target", "_blank")
                        .text(data.link)
                        .appendTo(morelinks);
                    $("<br/>").appendTo(morelinks);
                    tag.click(function () {
                        morelinks.toggle();
                    });
                }
                return;
            }
        }
        var text = data.msg;
        if (typeof data.link === "string") {
            text += "<br><a href='" + data.link + "' target='_blank'>" +
                    data.link + "</a>";
        }
        makeAlert("Error", text, "alert-error")
            .addClass("span12 qfalert")
            .appendTo($("#queuefail"));
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
            li.hide("blind", function() {
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
            loadMediaPlayer(data);
        }

        handleMediaUpdate(data);
    },

    mediaUpdate: function(data) {
        handleMediaUpdate(data);
    },

    setPlaylistLocked: function(data) {
        CHANNEL.openqueue = !data.locked;
        handlePermissionChange();
        if(CHANNEL.openqueue) {
            $("#qlockbtn").removeClass("btn-danger")
                .addClass("btn-success")
                .attr("title", "Playlist Unlocked");
            $("#qlockbtn").find("i")
                .removeClass("icon-lock")
                .addClass("icon-ok");
        }
        else {
            $("#qlockbtn").removeClass("btn-success")
                .addClass("btn-danger")
                .attr("title", "Playlist Locked");
            $("#qlockbtn").find("i")
                .removeClass("icon-ok")
                .addClass("icon-lock");
        }
    },

    searchResults: function(data) {
        $("#search_clear").remove();
        clearSearchResults();
        $("#library").data("entries", data.results);
        $("<button/>").addClass("btn btn-block")
            .addClass("span12")
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

            itemsPerPage: 100
        };

        var p = Paginate(data.results, opts);
        p.paginator.insertBefore($("#library"))
            .attr("id", "search_pagination");
        $("#library").data("paginator", p);
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
            var callback = function () {
                socket.emit("vote", {
                    option: i
                });
                poll.find(".option button").each(function() {
                    $(this).attr("disabled", "disabled");
                });
                $(this).parent().addClass("option-selected");
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

var SOCKET_DEBUG = false;
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

$.getScript(IO_URL+"/socket.io/socket.io.js", function() {
    try {
        if(NO_WEBSOCKETS || USEROPTS.altsocket) {
            var i = io.transports.indexOf("websocket");
            if(i >= 0)
                io.transports.splice(i, 1);
        }
        var opts = {};
        if (location.protocol === "https:")
            opts.secure = true;
        socket = io.connect(IO_URL);
        setupCallbacks();
    }
    catch(e) {
        Callbacks.disconnect();
    }
});
