function makeAlert(title, text, klass, textOnly) {
    if(!klass) {
        klass = "alert-info";
    }

    var wrap = $("<div/>").addClass("col-md-12");

    var al = $("<div/>").addClass("alert")
        .addClass(klass)
        .appendTo(wrap);
    textOnly ? al.text(text) : al.html(text) ;

    $("<br/>").prependTo(al);
    $("<strong/>").text(title).prependTo(al);
    $("<button/>").addClass("close pull-right").html("&times;")
        .click(function() {
            al.hide("fade", function() {
                wrap.remove();
            });
        })
        .prependTo(al);
    return wrap;
}

function formatURL(data) {
    switch(data.type) {
        case "yt":
            return "https://youtube.com/watch?v=" + data.id;
        case "vi":
            return "https://vimeo.com/" + data.id;
        case "dm":
            return "https://dailymotion.com/video/" + data.id;
        case "sc":
            return data.id;
        case "li":
            return "https://livestream.com/" + data.id;
        case "tw":
            return "https://twitch.tv/" + data.id;
        case "rt":
            return data.id;
        case "us":
            return "https://ustream.tv/channel/" + data.id;
        case "gd":
            return "https://docs.google.com/file/d/" + data.id;
        case "fi":
            return data.id;
        case "hb":
            return "https://www.smashcast.tv/" + data.id;
        case "hl":
            return data.id;
        case "sb":
            return "https://streamable.com/" + data.id;
        case "tc":
            return "https://clips.twitch.tv/" + data.id;
        case "cm":
            return data.id;
        case "cu":
            return data.meta.embed.src;
        default:
            return "#";
    }
}

function findUserlistItem(name) {
    var children = $("#userlist .userlist_item");
    if(children.length == 0)
        return null;
    name = name.toLowerCase();
    // WARNING: Incoming hax because of jQuery and bootstrap bullshit
    var keys = Object.keys(children);
    for(var k in keys) {
        var i = keys[k];
        if(isNaN(parseInt(i))) {
            continue;
        }
        var child = children[i];
        if($(child.children[1]).text().toLowerCase() == name)
            return $(child);
    }
    return null;
}

function formatUserlistItem(div) {
    var data = {
        name: div.data("name") || "",
        rank: div.data("rank"),
        profile: div.data("profile") || { image: "", text: ""},
        leader: div.data("leader") || false,
        icon: div.data("icon") || false,
    };
    var name = $(div.children()[1]);
    name.removeClass();
    name.css("font-style", "");
    name.addClass(getNameColor(data.rank));
    div.find(".profile-box").remove();

    var meta = div.data().meta || {}; // Not sure how this could happen.
    if (meta.afk) {
        div.addClass("userlist_afk");
    } else {
        div.removeClass("userlist_afk");
    }

    if (meta.muted) {
        div.addClass("userlist_muted");
    } else {
        div.removeClass("userlist_muted");
    }

    if (meta.smuted) {
        div.addClass("userlist_smuted");
    } else {
        div.removeClass("userlist_smuted");
    }

    var profile = null;
    /*
     * 2015-10-19
     * Prevent rendering unnecessary duplicates of the profile box when
     * a user's status changes.
     */
    name.unbind("mouseenter");
    name.unbind("mousemove");
    name.unbind("mouseleave");

    name.mouseenter(function(ev) {
        if (profile)
            profile.remove();

        var top = ev.clientY + 5;
        var horiz = ev.clientX;
        profile = $("<div/>")
            .addClass("profile-box linewrap")
            .css("top", top + "px")
            .appendTo(div);

        if(data.profile.image) {
            $("<img/>").addClass("profile-image")
                .attr("src", data.profile.image)
                .appendTo(profile);
        }
        $("<strong/>").text(data.name).appendTo(profile);

        var meta = div.data("meta") || {};
        if (meta.ip && USEROPTS.show_ip_in_tooltip) {
            $("<br/>").appendTo(profile);
            $("<em/>").text(meta.ip).appendTo(profile);
        }
        if (meta.aliases) {
            $("<br/>").appendTo(profile);
            $("<em/>").text("aliases: " + meta.aliases.join(", ")).appendTo(profile);
        }
        $("<hr/>").css("margin-top", "5px").css("margin-bottom", "5px").appendTo(profile);
        $("<p/>").text(data.profile.text).appendTo(profile);

        if ($("body").hasClass("synchtube")) horiz -= profile.outerWidth();
        profile.css("left", horiz + "px")
    });
    name.mousemove(function(ev) {
        var top = ev.clientY + 5;
        var horiz = ev.clientX;

        if ($("body").hasClass("synchtube")) horiz -= profile.outerWidth();
        profile.css("left", horiz + "px")
            .css("top", top + "px");
    });
    name.mouseleave(function() {
        profile.remove();
    });
    var icon = div.children()[0];
    icon.innerHTML = "";
    // denote current leader with a star
    if(data.leader) {
        $("<span/>").addClass("glyphicon glyphicon-star-empty").appendTo(icon);
    }
    if(div.data().meta.afk) {
        name.css("font-style", "italic");
        $("<span/>").addClass("glyphicon glyphicon-time").appendTo(icon);
    }
    if (data.icon) {
        $("<span/>").addClass("glyphicon " + data.icon).prependTo(icon);
    }
}

function getNameColor(rank) {
    if(rank >= Rank.Siteadmin)
        return "userlist_siteadmin";
    else if(rank >= Rank.Admin)
        return "userlist_owner";
    else if(rank >= Rank.Moderator)
        return "userlist_op";
    else if(rank == Rank.Guest)
        return "userlist_guest";
    else
        return "";
}

function addUserDropdown(entry) {
    var name = entry.data("name"),
        rank = entry.data("rank"),
        leader = entry.data("leader"),
        meta = entry.data("meta") || {};
    entry.find(".user-dropdown").remove();
    var menu = $("<div/>")
        .addClass("user-dropdown")
        .appendTo(entry)
        .hide();

    $("<strong/>").text(name).appendTo(menu);
    $("<br/>").appendTo(menu);

    var btngroup = $("<div/>").addClass("btn-group-vertical").appendTo(menu);

    /* ignore button */
    if (name !== CLIENT.name) {
        var ignore = $("<button/>").addClass("btn btn-xs btn-default")
            .appendTo(btngroup)
            .click(function () {
                if(IGNORED.indexOf(name) == -1) {
                    ignore.text("Unignore User");
                    IGNORED.push(name);
                    entry.addClass("userlist-ignored");
                } else {
                    ignore.text("Ignore User");
                    IGNORED.splice(IGNORED.indexOf(name), 1);
                    entry.removeClass("userlist-ignored");
                }
                setOpt("ignorelist", IGNORED);
            });
        if(IGNORED.indexOf(name) == -1) {
            entry.removeClass("userlist-ignored");
            ignore.text("Ignore User");
        } else {
            entry.addClass("userlist-ignored");
            ignore.text("Unignore User");
        }
    }

    /* pm button */
    if (name !== CLIENT.name) {
        var pm = $("<button/>").addClass("btn btn-xs btn-default")
            .text("Private Message")
            .appendTo(btngroup)
            .click(function () {
                initPm(name).find(".panel-heading").click();
                menu.hide();
            });
    }

    /* give/remove leader (moderator+ only) */
    if (hasPermission("leaderctl")) {
        var ldr = $("<button/>").addClass("btn btn-xs btn-default")
            .appendTo(btngroup);
        if(leader) {
            ldr.text("Remove Leader");
            ldr.click(function () {
                socket.emit("assignLeader", {
                    name: ""
                });
            });
        } else {
            ldr.text("Give Leader");
            ldr.click(function () {
                socket.emit("assignLeader", {
                    name: name
                });
            });
        }
    }

    /* kick button */
    if(hasPermission("kick")) {
        $("<button/>").addClass("btn btn-xs btn-default")
            .text("Kick")
            .click(function () {
                var reason = prompt("Enter kick reason (optional)");
                if (reason === null) {
                    return;
                }
                socket.emit("chatMsg", {
                    msg: "/kick " + name + " " + reason,
                    meta: {}
                });
            })
            .appendTo(btngroup);
    }

    /* mute buttons */
    if (hasPermission("mute")) {
        var mute = $("<button/>").addClass("btn btn-xs btn-default")
            .text("Mute")
            .click(function () {
                socket.emit("chatMsg", {
                    msg: "/mute " + name,
                    meta: {}
                });
            })
            .appendTo(btngroup);
        var smute = $("<button/>").addClass("btn btn-xs btn-default")
            .text("Shadow Mute")
            .click(function () {
                socket.emit("chatMsg", {
                    msg: "/smute " + name,
                    meta: {}
                });
            })
            .appendTo(btngroup);
        var unmute = $("<button/>").addClass("btn btn-xs btn-default")
            .text("Unmute")
            .click(function () {
                socket.emit("chatMsg", {
                    msg: "/unmute " + name,
                    meta: {}
                });
            })
            .appendTo(btngroup);
        if (meta.muted) {
            mute.hide();
            smute.hide();
        } else {
            unmute.hide();
        }
    }

    /* ban buttons */
    if(hasPermission("ban")) {
        $("<button/>").addClass("btn btn-xs btn-default")
            .text("Name Ban")
            .click(function () {
                var reason = prompt("Enter ban reason (optional)");
                if (reason === null) {
                    return;
                }
                socket.emit("chatMsg", {
                    msg: "/ban " + name + " " + reason,
                    meta: {}
                });
            })
            .appendTo(btngroup);
        $("<button/>").addClass("btn btn-xs btn-default")
            .text("IP Ban")
            .click(function () {
                var reason = prompt("Enter ban reason (optional)");
                if (reason === null) {
                    return;
                }
                socket.emit("chatMsg", {
                    msg: "/ipban " + name + " " + reason,
                    meta: {}
                });
            })
            .appendTo(btngroup);
    }

    var showdd = function(ev) {
        // Workaround for Chrome
        if (ev.shiftKey) return true;
        ev.preventDefault();
        if(menu.css("display") == "none") {
            $(".user-dropdown").hide();
            $(document).bind("mouseup.userlist-ddown", function (e) {
                if (menu.has(e.target).length === 0 &&
                    entry.parent().has(e.target).length === 0) {
                    menu.hide();
                    $(document).unbind("mouseup.userlist-ddown");
                }
            });
            menu.show();
            menu.css("top", entry.position().top);
        } else {
            menu.hide();
        }
        return false;
    };
    entry.contextmenu(showdd);
    entry.click(showdd);
}

function calcUserBreakdown() {
    var breakdown = {
        "Site Admins": 0,
        "Channel Admins": 0,
        "Moderators": 0,
        "Regular Users": 0,
        "Guests": 0,
        "Anonymous": 0,
        "AFK": 0
    };
    var total = 0;
    $("#userlist .userlist_item").each(function (index, item) {
        var data = {
            rank: $(item).data("rank")
        };

        if(data.rank >= 255)
            breakdown["Site Admins"]++;
        else if(data.rank >= 3)
            breakdown["Channel Admins"]++;
        else if(data.rank == 2)
            breakdown["Moderators"]++;
        else if(data.rank >= 1)
            breakdown["Regular Users"]++;
        else
            breakdown["Guests"]++;

        total++;

        if($(item).data().meta.afk)
            breakdown["AFK"]++;
    });

    breakdown["Anonymous"] = CHANNEL.usercount - total;

    return breakdown;
}

function sortUserlist() {
    var slice = Array.prototype.slice;
    var list = slice.call($("#userlist .userlist_item"));
    list.sort(function (a, b) {
        var r1 = $(a).data("rank");
        var r2 = $(b).data("rank");
        var afk1 = $(a).find(".glyphicon-time").length > 0;
        var afk2 = $(b).find(".glyphicon-time").length > 0;
        var name1 = a.children[1].innerHTML.toLowerCase();
        var name2 = b.children[1].innerHTML.toLowerCase();

        if(USEROPTS.sort_afk) {
            if(afk1 && !afk2)
                return 1;
            if(!afk1 && afk2)
                return -1;
        }

        if(USEROPTS.sort_rank) {
            if(r1 < r2)
                return 1;
            if(r1 > r2)
                return -1;
        }

        return name1 === name2 ? 0 : (name1 < name2 ? -1 : 1);
    });

    list.forEach(function (item) {
        $(item).detach();
    });
    list.forEach(function (item) {
        $(item).appendTo($("#userlist"));
    });
}

/* queue stuff */

function scrollQueue() {
    var li = playlistFind(PL_CURRENT);
    if(!li)
        return;

    li = $(li);
    $("#queue").scrollTop(0);
    var scroll = li.position().top - $("#queue").position().top;
    $("#queue").scrollTop(scroll);
}

function makeQueueEntry(item, addbtns) {
    var video = item.media;
    var li = $("<li/>");
    li.addClass("queue_entry");
    li.addClass("pluid-" + item.uid);
    li.data("uid", item.uid);
    li.data("media", video);
    li.data("temp", item.temp);
    if(video.thumb) {
        $("<img/>").attr("src", video.thumb.url)
            .css("float", "left")
            .css("clear", "both")
            .appendTo(li);
    }
    var title = $("<a/>").addClass("qe_title").appendTo(li)
        .text(video.title)
        .attr("href", formatURL(video))
        .attr("target", "_blank");
    var time = $("<span/>").addClass("qe_time").appendTo(li);
    time.text(video.duration);
    var clear = $("<div/>").addClass("qe_clear").appendTo(li);
    if(item.temp) {
        li.addClass("queue_temp");
    }

    if(addbtns)
        addQueueButtons(li);
    return li;
}

function makeSearchEntry(video) {
    var li = $("<li/>");
    li.addClass("queue_entry");
    li.data("media", video);
    if(video.thumb) {
        $("<img/>").attr("src", video.thumb.url)
            .css("float", "left")
            .css("clear", "both")
            .appendTo(li);
    }
    var title = $("<a/>").addClass("qe_title").appendTo(li)
        .text(video.title)
        .attr("href", formatURL(video))
        .attr("target", "_blank");
    var time = $("<span/>").addClass("qe_time").appendTo(li);
    time.text(video.duration);
    var clear = $("<div/>").addClass("qe_clear").appendTo(li);

    return li;
}

function addQueueButtons(li) {
    li.find(".btn-group").remove();
    var menu = $("<div/>").addClass("btn-group").appendTo(li);
    // Play
    if(hasPermission("playlistjump")) {
        $("<button/>").addClass("btn btn-xs btn-default qbtn-play")
            .html("<span class='glyphicon glyphicon-play'></span>Play")
            .click(function() {
                socket.emit("jumpTo", li.data("uid"));
            })
            .appendTo(menu);
    }
    // Queue next
    if(hasPermission("playlistmove")) {
        $("<button/>").addClass("btn btn-xs btn-default qbtn-next")
            .html("<span class='glyphicon glyphicon-share-alt'></span>Queue Next")
            .click(function() {
                socket.emit("moveMedia", {
                    from: li.data("uid"),
                    after: PL_CURRENT
                });
            })
            .appendTo(menu);
    }
    // Temp/Untemp
    if(hasPermission("settemp")) {
        var tempstr = li.data("temp")?"Make Permanent":"Make Temporary";
        $("<button/>").addClass("btn btn-xs btn-default qbtn-tmp")
            .html("<span class='glyphicon glyphicon-flag'></span>" + tempstr)
            .click(function() {
                socket.emit("setTemp", {
                    uid: li.data("uid"),
                    temp: !li.data("temp")
                });
            })
            .appendTo(menu);
    }
    // Delete
    if(hasPermission("playlistdelete")) {
        $("<button/>").addClass("btn btn-xs btn-default qbtn-delete")
            .html("<span class='glyphicon glyphicon-trash'></span>Delete")
            .click(function() {
                socket.emit("delete", li.data("uid"));
            })
            .appendTo(menu);
    }

    if(USEROPTS.qbtn_hide && !USEROPTS.qbtn_idontlikechange
        || menu.find(".btn").length == 0)
        menu.hide();

    // I DON'T LIKE CHANGE
    if(USEROPTS.qbtn_idontlikechange) {
        menu.addClass("pull-left");
        menu.detach().prependTo(li);
        menu.find(".btn").each(function() {
            // Clear icon
            var icon = $(this).find(".glyphicon");
            $(this).html("");
            icon.appendTo(this);
        });
        menu.find(".qbtn-play").addClass("btn-success");
        menu.find(".qbtn-delete").addClass("btn-danger");
    }
    else if(menu.find(".btn").length != 0) {
        li.unbind("contextmenu");
        li.contextmenu(function(ev) {
            // Allow shift+click to open context menu
            // (Chrome workaround, works by default on Firefox)
            if (ev.shiftKey) return true;
            ev.preventDefault();
            if(menu.css("display") == "none")
                menu.show("blind");
            else
                menu.hide("blind");
            return false;
        });
    }
}

function rebuildPlaylist() {
    var qli = $("#queue li");
    if(qli.length == 0)
        return;
    REBUILDING = Math.random() + "";
    var r = REBUILDING;
    var i = 0;
    qli.each(function() {
        var li = $(this);
        (function(i, r) {
            setTimeout(function() {
                // Stop if another rebuild is running
                if(REBUILDING != r)
                    return;
                addQueueButtons(li);
                if(i == qli.length - 1) {
                    scrollQueue();
                    REBUILDING = false;
                }
            }, 10*i);
        })(i, r);
        i++;
    });
}

/* menus */

/* user settings menu */
function showUserOptions() {
    if (CLIENT.rank < 2) {
        $("a[href='#us-mod']").parent().hide();
    } else {
        $("a[href='#us-mod']").parent().show();
    }

    $("#us-theme").val(USEROPTS.theme);
    $("#us-layout").val(USEROPTS.layout);
    $("#us-no-channelcss").prop("checked", USEROPTS.ignore_channelcss);
    $("#us-no-channeljs").prop("checked", USEROPTS.ignore_channeljs);

    $("#us-synch").prop("checked", USEROPTS.synch);
    $("#us-synch-accuracy").val(USEROPTS.sync_accuracy);
    $("#us-wmode-transparent").prop("checked", USEROPTS.wmode_transparent);
    $("#us-hidevideo").prop("checked", USEROPTS.hidevid);
    $("#us-playlistbuttons").prop("checked", USEROPTS.qbtn_hide);
    $("#us-oldbtns").prop("checked", USEROPTS.qbtn_idontlikechange);
    $("#us-default-quality").val(USEROPTS.default_quality || "auto");

    $("#us-chat-timestamp").prop("checked", USEROPTS.show_timestamps);
    $("#us-sort-rank").prop("checked", USEROPTS.sort_rank);
    $("#us-sort-afk").prop("checked", USEROPTS.sort_afk);
    $("#us-blink-title").val(USEROPTS.blink_title);
    $("#us-ping-sound").val(USEROPTS.boop);
    $("#us-notifications").val(USEROPTS.notifications);
    $("#us-sendbtn").prop("checked", USEROPTS.chatbtn);
    $("#us-no-emotes").prop("checked", USEROPTS.no_emotes);
    $("#us-strip-image").prop("checked", USEROPTS.strip_image);
    $("#us-chat-tab-method").val(USEROPTS.chat_tab_method);

    $("#us-modflair").prop("checked", USEROPTS.modhat);
    $("#us-shadowchat").prop("checked", USEROPTS.show_shadowchat);
    $("#us-show-ip-in-tooltip").prop("checked", USEROPTS.show_ip_in_tooltip);

    formatScriptAccessPrefs();

    $("a[href='#us-general']").click();
    $("#useroptions").modal();
}

function saveUserOptions() {
    USEROPTS.theme                = $("#us-theme").val();
    createCookie("cytube-theme", USEROPTS.theme, 1000);
    USEROPTS.layout               = $("#us-layout").val();
    USEROPTS.ignore_channelcss    = $("#us-no-channelcss").prop("checked");
    USEROPTS.ignore_channeljs     = $("#us-no-channeljs").prop("checked");
    USEROPTS.show_ip_in_tooltip   = $("#us-show-ip-in-tooltip").prop("checked");

    USEROPTS.synch                = $("#us-synch").prop("checked");
    USEROPTS.sync_accuracy        = parseFloat($("#us-synch-accuracy").val()) || 2;
    USEROPTS.wmode_transparent    = $("#us-wmode-transparent").prop("checked");
    USEROPTS.hidevid              = $("#us-hidevideo").prop("checked");
    USEROPTS.qbtn_hide            = $("#us-playlistbuttons").prop("checked");
    USEROPTS.qbtn_idontlikechange = $("#us-oldbtns").prop("checked");
    USEROPTS.default_quality      = $("#us-default-quality").val();

    USEROPTS.show_timestamps      = $("#us-chat-timestamp").prop("checked");
    USEROPTS.sort_rank            = $("#us-sort-rank").prop("checked");
    USEROPTS.sort_afk             = $("#us-sort-afk").prop("checked");
    USEROPTS.blink_title          = $("#us-blink-title").val();
    USEROPTS.boop                 = $("#us-ping-sound").val();
    USEROPTS.notifications        = $("#us-notifications").val();
    USEROPTS.chatbtn              = $("#us-sendbtn").prop("checked");
    USEROPTS.no_emotes            = $("#us-no-emotes").prop("checked");
    USEROPTS.strip_image          = $("#us-strip-image").prop("checked");
    USEROPTS.chat_tab_method      = $("#us-chat-tab-method").val();

    if (CLIENT.rank >= 2) {
        USEROPTS.modhat      = $("#us-modflair").prop("checked");
        USEROPTS.show_shadowchat = $("#us-shadowchat").prop("checked");
    }

    storeOpts();
    applyOpts();
}

function storeOpts() {
    for(var key in USEROPTS) {
        setOpt(key, USEROPTS[key]);
    }
}

function applyOpts() {
    if ($("#usertheme").attr("href") !== USEROPTS.theme) {
        var old = $("#usertheme").attr("id", "usertheme_old");
        var theme = USEROPTS.theme;
        if (theme === "default") {
            theme = DEFAULT_THEME;
        }
        $("<link/>").attr("rel", "stylesheet")
            .attr("type", "text/css")
            .attr("id", "usertheme")
            .attr("href", theme)
            .attr("onload", "$('#usertheme_old').remove()")
            .appendTo($("head"));
        fixWeirdButtonAlignmentIssue();
    }

    switch (USEROPTS.layout) {
        case "synchtube-fluid":
            fluidLayout();
        case "synchtube":
            synchtubeLayout();
            break;
        case "fluid":
            fluidLayout();
            break;
        case "hd":
            hdLayout();
            break;
        default:
            compactLayout();
            break;
    }

    if(USEROPTS.hidevid) {
        removeVideo();
    }

    $("#chatbtn").remove();
    if(USEROPTS.chatbtn) {
        var btn = $("<button/>").addClass("btn btn-default btn-block")
            .text("Send")
            .attr("id", "chatbtn")
            .appendTo($("#chatwrap"));
        btn.click(function() {
            if($("#chatline").val().trim()) {
                socket.emit("chatMsg", {
                    msg: $("#chatline").val(),
                    meta: {}
                });
                $("#chatline").val("");
            }
        });
    }

    if (USEROPTS.modhat) {
        $("#modflair").removeClass("label-default")
            .addClass("label-success");
    } else {
        $("#modflair").removeClass("label-success")
            .addClass("label-default");
    }

    if (USEROPTS.notifications !== "never") {
        if ("Notification" in window) {
            Notification.requestPermission().then(function(permission) {
                if (permission !== "granted") {
                    USEROPTS.notifications = "never";
                }
            });
        }
        else {
            USEROPTS.notifications = "never";
        }
    }
}

function parseTimeout(t) {
    var m;
    if (m = t.match(/^(\d+):(\d+):(\d+)$/)) {
        // HH:MM:SS
        return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    } else if (m = t.match(/^(\d+):(\d+)$/)) {
        // MM:SS
        return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    } else if (m = t.match(/^(\d+)$/)) {
        // Seconds
        return parseInt(m[1], 10);
    } else {
        throw new Error("Invalid timeout value '" + t + "'");
    }
}

function showPollMenu() {
    $("#pollwrap .poll-menu").remove();
    var menu = $("<div/>").addClass("well poll-menu")
        .prependTo($("#pollwrap"));

    $("<button/>").addClass("btn btn-sm btn-danger pull-right")
        .text("Cancel")
        .appendTo(menu)
        .click(function() {
            menu.remove();
        });

    $("<strong/>").text("Title").appendTo(menu);

    var title = $("<input/>").addClass("form-control")
        .attr("maxlength", "255")
        .attr("type", "text")
        .appendTo(menu);

    $("<strong/>").text("Timeout (optional)").appendTo(menu);
    $("<p/>").text("If you specify a timeout, the poll will automatically " +
                   "be closed after that amount of time.  You can either " +
                   "specify the number of seconds or use the format " +
                   "minutes:seconds.  Examples: 90 (90 seconds), 5:30 " +
                   "(5 minutes, 30 seconds)")
        .addClass("text-muted")
        .appendTo(menu);
    var timeout = $("<input/>").addClass("form-control")
        .attr("type", "text")
        .appendTo(menu);
    var timeoutError = null;

    var checkboxOuter = $("<div/>").addClass("checkbox").appendTo(menu);
    var lbl = $("<label/>").text("Hide poll results until it closes")
        .appendTo(checkboxOuter);
    var hidden = $("<input/>").attr("type", "checkbox")
        .prependTo(lbl);

    var retainVotesOuter = $("<div/>").addClass("checkbox").appendTo(menu);
    var retainVotesLbl = $("<label/>").text("Keep poll vote after user leaves")
        .appendTo(retainVotesOuter);
    var retainVotes = $("<input/>").attr("type", "checkbox")
        .prependTo(retainVotesLbl);

    $("<strong/>").text("Options").appendTo(menu);

    var addbtn = $("<button/>").addClass("btn btn-sm btn-default")
        .text("Add Option")
        .appendTo(menu);

    function addOption() {
        $("<input/>").addClass("form-control")
            .attr("type", "text")
            .attr("maxlength", "255")
            .addClass("poll-menu-option")
            .insertBefore(addbtn);
    }

    addbtn.click(addOption);
    addOption();
    addOption();

    $("<button/>").addClass("btn btn-default btn-block")
        .text("Open Poll")
        .appendTo(menu)
        .click(function() {
            var t = timeout.val().trim();
            if (t) {
                try {
                    t = parseTimeout(t);
                } catch (e) {
                    if (timeoutError) {
                        timeoutError.remove();
                    }

                    timeoutError = $("<p/>").addClass("text-danger").text(e.message);
                    timeoutError.insertAfter(timeout);
                    timeout.focus();
                    return;
                }
            } else {
                t = undefined;
            }
            var opts = [];
            menu.find(".poll-menu-option").each(function() {
                if($(this).val() != "")
                    opts.push($(this).val());
            });
            socket.emit("newPoll", {
                title: title.val(),
                opts: opts,
                obscured: hidden.prop("checked"),
                retainVotes: retainVotes.prop("checked"),
                timeout: t
            }, function ack(result) {
                if (result.error) {
                    modalAlert({
                        title: 'Error creating poll',
                        textContent: result.error.message
                    });
                } else {
                    menu.remove();
                }
            });
        });
}

function scrollChat() {
    scrollAndIgnoreEvent($("#messagebuffer").prop("scrollHeight"));
    $("#newmessages-indicator").remove();
}

function scrollAndIgnoreEvent(top) {
    IGNORE_SCROLL_EVENT = true;
    $("#messagebuffer").scrollTop(top);
}

function hasPermission(key) {
    if(key.indexOf("playlist") == 0 && CHANNEL.openqueue) {
        var key2 = "o" + key;
        var v = CHANNEL.perms[key2];
        if(typeof v == "number" && CLIENT.rank >= v) {
            return true;
        }
    }
    var v = CHANNEL.perms[key];
    if(typeof v != "number") {
        return false;
    }
    return CLIENT.rank >= v;
}

function setVisible(selector, bool) {
    // I originally added this check because of a race condition
    // Now it seems to work without but I don't trust it
    if($(selector) && $(selector).attr("id") != selector.substring(1)) {
        setTimeout(function() {
            setVisible(selector, bool);
        }, 100);
        return;
    }
    var disp = bool ? "" : "none";
    $(selector).css("display", disp);
}

function setParentVisible(selector, bool) {
    var disp = bool ? "" : "none";
    $(selector).parent().css("display", disp);
}

function handleModPermissions() {
    $("#cs-chanranks-adm").attr("disabled", CLIENT.rank < 4);
    $("#cs-chanranks-owner").attr("disabled", CLIENT.rank < 4);
    /* update channel controls */
    $("#cs-pagetitle").val(CHANNEL.opts.pagetitle);
    $("#cs-pagetitle").attr("disabled", CLIENT.rank < 3);
    $("#cs-externalcss").val(CHANNEL.opts.externalcss);
    $("#cs-externalcss").attr("disabled", CLIENT.rank < 3);
    $("#cs-externaljs").val(CHANNEL.opts.externaljs);
    $("#cs-externaljs").attr("disabled", CLIENT.rank < 3);
    $("#cs-chat_antiflood").prop("checked", CHANNEL.opts.chat_antiflood);
    if ("chat_antiflood_params" in CHANNEL.opts) {
        $("#cs-chat_antiflood_burst").val(CHANNEL.opts.chat_antiflood_params.burst);
        $("#cs-chat_antiflood_sustained").val(CHANNEL.opts.chat_antiflood_params.sustained);
    }
    $("#cs-show_public").prop("checked", CHANNEL.opts.show_public);
    $("#cs-show_public").attr("disabled", CLIENT.rank < 3);
    $("#cs-password").val(CHANNEL.opts.password || "");
    $("#cs-password").attr("disabled", CLIENT.rank < 3);
    $("#cs-enable_link_regex").prop("checked", CHANNEL.opts.enable_link_regex);
    $("#cs-afk_timeout").val(CHANNEL.opts.afk_timeout);
    $("#cs-allow_voteskip").prop("checked", CHANNEL.opts.allow_voteskip);
    $("#cs-voteskip_ratio").val(CHANNEL.opts.voteskip_ratio);
    $("#cs-allow_dupes").prop("checked", CHANNEL.opts.allow_dupes);
    $("#cs-torbanned").prop("checked", CHANNEL.opts.torbanned);
    $("#cs-block_anonymous_users").prop("checked", CHANNEL.opts.block_anonymous_users);
    $("#cs-allow_ascii_control").prop("checked", CHANNEL.opts.allow_ascii_control);
    $("#cs-playlist_max_per_user").val(CHANNEL.opts.playlist_max_per_user || 0);
    $("#cs-playlist_max_duration_per_user").val(formatTime(CHANNEL.opts.playlist_max_duration_per_user));
    $("#cs-new_user_chat_delay").val(formatTime(CHANNEL.opts.new_user_chat_delay || 0));
    $("#cs-new_user_chat_link_delay").val(formatTime(CHANNEL.opts.new_user_chat_link_delay || 0));
    $("#cs-maxlength").val(formatTime(CHANNEL.opts.maxlength));
    $("#cs-csstext").val(CHANNEL.css);
    $("#cs-jstext").val(CHANNEL.js);
    $("#cs-motdtext").val(CHANNEL.motd);
    setParentVisible("a[href='#cs-motdeditor']", hasPermission("motdedit"));
    setParentVisible("a[href='#cs-permedit']", CLIENT.rank >= 3);
    setParentVisible("a[href='#cs-banlist']", hasPermission("ban"));
    setParentVisible("a[href='#cs-csseditor']", CLIENT.rank >= 3);
    setParentVisible("a[href='#cs-jseditor']", CLIENT.rank >= 3);
    setParentVisible("a[href='#cs-chatfilters']", hasPermission("filteredit"));
    setParentVisible("a[href='#cs-emotes']", hasPermission("emoteedit"));
    setParentVisible("a[href='#cs-chanranks']", CLIENT.rank >= 3);
    setParentVisible("a[href='#cs-chanlog']", CLIENT.rank >= 3);
    $("#cs-chatfilters-import").attr("disabled", !hasPermission("filterimport"));
    $("#cs-emotes-import").attr("disabled", !hasPermission("filterimport"));
}

function handlePermissionChange() {
    if(CLIENT.rank >= 2) {
        handleModPermissions();
    }

    $("#qlockbtn").attr("disabled", !hasPermission("playlistlock"));
    setVisible("#showchansettings", CLIENT.rank >= 2);
    setVisible("#playlistmanagerwrap", CLIENT.rank >= 1);
    setVisible("#modflair", CLIENT.rank >= 2);
    setVisible("#guestlogin", CLIENT.rank < 0);
    setVisible("#chatline", CLIENT.rank >= 0);
    setVisible("#queue", hasPermission("seeplaylist"));
    setVisible("#plmeta", hasPermission("seeplaylist"));
    $("#getplaylist").attr("disabled", !hasPermission("seeplaylist"));

    setVisible("#showplaylistmanager", hasPermission("seeplaylist"));
    setVisible("#showmediaurl", hasPermission("playlistadd"));
    setVisible("#showcustomembed", hasPermission("playlistaddcustom"));
    $("#queue_next").attr("disabled", !hasPermission("playlistnext"));

    if(hasPermission("playlistadd") ||
        hasPermission("playlistmove") ||
        hasPermission("playlistjump") ||
        hasPermission("playlistdelete") ||
        hasPermission("settemp")) {
        if(USEROPTS.first_visit && $("#plonotification").length == 0) {
            var al = makeAlert("Playlist Options", [
                "From the Options menu, you can choose to automatically",
                " hide the buttons on each entry (and show them when",
                " you right click).  You can also choose to use the old",
                " style of playlist buttons.",
                "<br>"].join(""))
                .attr("id", "plonotification")
                .insertAfter($("#queuefail"));

            al.find(".close").remove();

            $("<button/>").addClass("btn btn-primary")
                .text("Dismiss")
                .appendTo(al.find(".alert"))
                .click(function() {
                    USEROPTS.first_visit = false;
                    storeOpts();
                    al.hide("fade", function() {
                        al.remove();
                    });
                });
        }
    }

    if(hasPermission("playlistmove")) {
        $("#queue").sortable("enable");
        $("#queue").addClass("queue_sortable");
    }
    else {
        $("#queue").sortable("disable");
        $("#queue").removeClass("queue_sortable");
    }

    setVisible("#clearplaylist", hasPermission("playlistclear"));
    setVisible("#shuffleplaylist", hasPermission("playlistshuffle"));
    if (!hasPermission("addnontemp")) {
        $(".add-temp").prop("checked", true);
        $(".add-temp").attr("disabled", true);
    } else {
        $(".add-temp").attr("disabled", false);
    }

    fixWeirdButtonAlignmentIssue();

    setVisible("#newpollbtn", hasPermission("pollctl"));
    $("#voteskip").attr("disabled", !hasPermission("voteskip") ||
                                    !CHANNEL.opts.allow_voteskip);

    $("#pollwrap .active").find(".btn-danger").remove();
    if(hasPermission("pollctl")) {
        var poll = $("#pollwrap .active");
        if(poll.length > 0) {
            $("<button/>").addClass("btn btn-danger pull-right")
                .text("End Poll")
                .insertAfter(poll.find(".close"))
                .click(function() {
                    socket.emit("closePoll");
                });
        }
    }
    var poll = $("#pollwrap .active");
    if(poll.length > 0) {
        poll.find(".btn").attr("disabled", !hasPermission("pollvote"));
    }
    var users = $("#userlist").children();
    for(var i = 0; i < users.length; i++) {
        addUserDropdown($(users[i]));
    }

    $("#chatline").attr("disabled", !hasPermission("chat"));
    if (!hasPermission("chat")) {
        $("#chatline").attr("placeholder", "Chat permissions are restricted on this channel");
    } else {
        $("#chatline").attr("placeholder", "");
    }
    rebuildPlaylist();
}

function fixWeirdButtonAlignmentIssue() {
    // Weird things happen to the alignment in chromium when I toggle visibility
    // of the above buttons
    // This fixes it?
    var wtf = $("#videocontrols").removeClass("pull-right");
    setTimeout(function () {
        wtf.addClass("pull-right");
    }, 1);
}

/* search stuff */

function clearSearchResults() {
    $("#library").html("");
    $("#search_clear").remove();
    var p = $("#library").data("paginator");
    if(p) {
        p.paginator.html("");
    }
}

function addLibraryButtons(li, item, source) {
    var btns = $("<div/>").addClass("btn-group")
        .addClass("pull-left")
        .prependTo(li);

    var id = item.id;
    var type = item.type;

    if(hasPermission("playlistadd")) {
        if(hasPermission("playlistnext")) {
            $("<button/>").addClass("btn btn-xs btn-default")
                .text("Next")
                .click(function() {
                    socket.emit("queue", {
                        id: id,
                        pos: "next",
                        type: type,
                        temp: $(".add-temp").prop("checked")
                    });
                })
                .appendTo(btns);
        }
        $("<button/>").addClass("btn btn-xs btn-default")
            .text("End")
            .click(function() {
                socket.emit("queue", {
                    id: id,
                    pos: "end",
                    type: type,
                    temp: $(".add-temp").prop("checked")
                });
            })
            .appendTo(btns);
    }
    if(hasPermission("deletefromchannellib") && source === "library") {
        $("<button/>").addClass("btn btn-xs btn-danger")
            .html("<span class='glyphicon glyphicon-trash'></span>")
            .click(function() {
                socket.emit("uncache", {
                    id: id
                });
                li.hide("fade", function() {
                    li.remove();
                });
            })
            .appendTo(btns);
    }
}

/* queue stuff */

var AsyncQueue = function () {
    this._q = [];
    this._lock = false;
    this._tm = 0;
};

AsyncQueue.prototype.next = function () {
    if (this._q.length > 0) {
        if (!this.lock())
            return;
        var item = this._q.shift();
        var fn = item[0], tm = item[1];
        this._tm = Date.now() + item[1];
        fn(this);
    }
};

AsyncQueue.prototype.lock = function () {
    if (this._lock) {
        if (this._tm > 0 && Date.now() > this._tm) {
            this._tm = 0;
            return true;
        }
        return false;
    }

    this._lock = true;
    return true;
};

AsyncQueue.prototype.release = function () {
    var self = this;
    if (!self._lock)
        return false;

    self._lock = false;
    self.next();
    return true;
};

AsyncQueue.prototype.queue = function (fn) {
    var self = this;
    self._q.push([fn, 20000]);
    self.next();
};

AsyncQueue.prototype.reset = function () {
    this._q = [];
    this._lock = false;
};

var PL_ACTION_QUEUE = new AsyncQueue();

// Because jQuery UI does weird things
// 2017-03-26: Does it really though?  I have no idea if this is still needed.
function playlistFind(uid) {
    var children = document.getElementById("queue").children;
    for(var i in children) {
        if(typeof children[i].className != "string")
            continue;
        if(children[i].className.split(" ").indexOf("pluid-" + uid) > 0)
            return children[i];
    }
    return false;
}

function playlistMove(from, after, cb) {
    var lifrom = $(".pluid-" + from);
    if(lifrom.length == 0) {
        cb(false);
        return;
    }

    var q = $("#queue");

    if(after === "prepend") {
        lifrom.hide("blind", function() {
            lifrom.detach();
            lifrom.prependTo(q);
            lifrom.show("blind", cb);
        });
    }
    else if(after === "append") {
        lifrom.hide("blind", function() {
            lifrom.detach();
            lifrom.appendTo(q);
            lifrom.show("blind", cb);
        });
    }
    else {
        var liafter = $(".pluid-" + after);
        if(liafter.length == 0) {
            cb(false);
            return;
        }
        lifrom.hide("blind", function() {
            lifrom.detach();
            lifrom.insertAfter(liafter);
            lifrom.show("blind", cb);
        });
    }
}

function extractQueryParam(query, param) {
    var params = {};
    query.split("&").forEach(function (kv) {
        kv = kv.split("=");
        params[kv[0]] = kv[1];
    });

    return params[param];
}

function parseMediaLink(url) {
    if(typeof url != "string") {
        return {
            id: null,
            type: null
        };
    }
    url = url.trim();
    url = url.replace("feature=player_embedded&", "");

    if(url.indexOf("rtmp://") == 0) {
        return {
            id: url,
            type: "rt"
        };
    }

    var m;
    if((m = url.match(/youtube\.com\/watch\?([^#]+)/))) {
        return {
            id: extractQueryParam(m[1], "v"),
            type: "yt"
        };
    }

    // YouTube shorts
    if((m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/))) {
        return {
            id: m[1],
            type: "yt"
        };
    }

    if((m = url.match(/youtu\.be\/([^\?&#]+)/))) {
        return {
            id: m[1],
            type: "yt"
        };
    }

    if((m = url.match(/youtube\.com\/playlist\?([^#]+)/))) {
        return {
            id: extractQueryParam(m[1], "list"),
            type: "yp"
        };
    }

    if ((m = url.match(/clips\.twitch\.tv\/([A-Za-z]+)/))) {
        return {
            id: m[1],
            type: "tc"
        };
    }

    // #790
    if ((m = url.match(/twitch\.tv\/(?:.*?)\/clip\/([A-Za-z]+)/))) {
        return {
            id: m[1],
            type: "tc"
        }
    }

    if((m = url.match(/twitch\.tv\/(?:.*?)\/([cv])\/(\d+)/))) {
        return {
            id: m[1] + m[2],
            type: "tv"
        };
    }

    /**
     * 2017-02-23
     * Twitch changed their URL pattern for recorded videos, apparently.
     * https://github.com/calzoneman/sync/issues/646
     */
    if((m = url.match(/twitch\.tv\/videos\/(\d+)/))) {
        return {
            id: "v" + m[1],
            type: "tv"
        };
    }

    if((m = url.match(/twitch\.tv\/([\w-]+)/))) {
        return {
            id: m[1],
            type: "tw"
        };
    }

    if((m = url.match(/livestream\.com\/([^\?&#]+)/))) {
        return {
            id: m[1],
            type: "li"
        };
    }

    if((m = url.match(/ustream\.tv\/([^\?&#]+)/))) {
        return {
            id: m[1],
            type: "us"
        };
    }

    if ((m = url.match(/(?:hitbox|smashcast)\.tv\/([^\?&#]+)/))) {
        return {
            id: m[1],
            type: "hb"
        };
    }

    if((m = url.match(/vimeo\.com\/([^\?&#]+)/))) {
        return {
            id: m[1],
            type: "vi"
        };
    }

    if((m = url.match(/dailymotion\.com\/video\/([^\?&#_]+)/))) {
        return {
            id: m[1],
            type: "dm"
        };
    }

    if((m = url.match(/soundcloud\.com\/([^\?&#]+)/))) {
        return {
            id: url,
            type: "sc"
        };
    }

    if ((m = url.match(/(?:docs|drive)\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)) ||
        (m = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/))) {
        return {
            id: m[1],
            type: "gd"
        };
    }

    if ((m = url.match(/(.*\.m3u8)/))) {
        return {
            id: url,
            type: "hl"
        };
    }

    if((m = url.match(/streamable\.com\/([\w-]+)/))) {
        return {
            id: m[1],
            type: "sb"
        };
    }

    /*  Shorthand URIs  */
    // So we still trim DailyMotion URLs
    if((m = url.match(/^dm:([^\?&#_]+)/))) {
        return {
            id: m[1],
            type: "dm"
        };
    }
    // Raw files need to keep the query string
    if ((m = url.match(/^fi:(.*)/))) {
        return {
            id: m[1],
            type: "fi"
        };
    }
    if ((m = url.match(/^cm:(.*)/))) {
        return {
            id: m[1],
            type: "cm"
        };
    }
    // Generic for the rest.
    if ((m = url.match(/^([a-z]{2}):([^\?&#]+)/))) {
        return {
            id: m[2],
            type: m[1]
        };
    }

    /* Raw file */
    var tmp = url.split("?")[0];
    if (tmp.match(/^https?:\/\//)) {
        if (tmp.match(/\.json$/)) {
            // Custom media manifest format
            return {
                id: url,
                type: "cm"
            };
        } else {
            // Assume raw file (server will check)
            return {
                id: url,
                type: "fi"
            };
        }
    }

    throw new Error(
        'Could not determine video type.  Check https://git.io/fjtOK for a list ' +
        'of supported media providers.'
    );
}

function sendVideoUpdate() {
    if (!CLIENT.leader) {
        return;
    }
    PLAYER.getTime(function (seconds) {
        socket.emit("mediaUpdate", {
            id: PLAYER.mediaId,
            currentTime: seconds,
            paused: PLAYER.paused,
            type: PLAYER.mediaType
        });
    });
}

/* chat */

function stripImages(msg){
    if (!USEROPTS.strip_image) {
        return msg;
    }
    return msg.replace(IMAGE_MATCH, function(match,img){
        return CHANNEL.opts.enable_link_regex ?
            '<a target="_blank" href="'+img+'">'+img+'</a>' : img;
    });
}

function formatChatMessage(data, last) {
    // Backwards compat
    if (!data.meta || data.msgclass) {
        data.meta = {
            addClass: data.msgclass,
            // And the award for "variable name most like Java source code" goes to...
            addClassToNameAndTimestamp: data.msgclass
        };
    }
    // Phase 1: Determine whether to show the username or not
    var skip = data.username === last.name;
    if(data.meta.addClass === "server-whisper")
        skip = true;
    // Prevent impersonation by abuse of the bold filter
    if(data.msg.match(/^\s*<strong>\w+\s*:\s*<\/strong>\s*/))
        skip = false;
    if (data.meta.forceShowName)
        skip = false;

    data.msg = stripImages(data.msg);
    data.msg = execEmotes(data.msg);

    last.name = data.username;
    var div = $("<div/>");
    /* drink is a special case because the entire container gets the class, not
       just the message */
    if (data.meta.addClass === "drink") {
        div.addClass("drink");
        data.meta.addClass = "";
    }

    // Add timestamps (unless disabled)
    if (USEROPTS.show_timestamps) {
        var time = $("<span/>").addClass("timestamp").appendTo(div);
        var timestamp = new Date(data.time).toTimeString().split(" ")[0];
        time.text("["+timestamp+"] ");
        if (data.meta.addClass && data.meta.addClassToNameAndTimestamp) {
            time.addClass(data.meta.addClass);
        }
    }

    // Add username
    var name = $("<span/>");
    if (!skip) {
        name.appendTo(div);
    }
    $("<strong/>").addClass("username").text(data.username + ": ").appendTo(name);
    if (data.meta.modflair) {
        name.addClass(getNameColor(data.meta.modflair));
    }
    if (data.meta.addClass && data.meta.addClassToNameAndTimestamp) {
        name.addClass(data.meta.addClass);
    }
    if (data.meta.superadminflair) {
        name.addClass("label")
            .addClass(data.meta.superadminflair.labelclass);
        $("<span/>").addClass(data.meta.superadminflair.icon)
            .addClass("glyphicon")
            .css("margin-right", "3px")
            .prependTo(name);
    }

    // Add the message itself
    var message = $("<span/>").appendTo(div);
    message[0].innerHTML = data.msg;

    // For /me the username is part of the message
    if (data.meta.action) {
        name.remove();
        message[0].innerHTML = data.username + " " + data.msg;
    }
    if (data.meta.addClass) {
        message.addClass(data.meta.addClass);
    }
    if (data.meta.shadow) {
        div.addClass("chat-shadow");
    }
    return div;
}

function addChatMessage(data) {
    if(IGNORED.indexOf(data.username) !== -1) {
        return;
    }
    if (data.meta.shadow && !USEROPTS.show_shadowchat) {
        return;
    }
    var msgBuf = $("#messagebuffer");
    var div = formatChatMessage(data, LASTCHAT);
    // Incoming: a bunch of crap for the feature where if you hover over
    // a message, it highlights messages from that user
    var safeUsername = data.username.replace(/[^\w-]/g, '\\$');
    div.addClass("chat-msg-" + safeUsername);
    div.appendTo(msgBuf);
    div.mouseover(function() {
        $(".chat-msg-" + safeUsername).addClass("nick-hover");
    });
    div.mouseleave(function() {
        $(".nick-hover").removeClass("nick-hover");
    });
    var oldHeight = msgBuf.prop("scrollHeight");
    var numRemoved = trimChatBuffer();
    if (SCROLLCHAT) {
        scrollChat();
    } else {
        var newMessageDiv = $("#newmessages-indicator");
        if (!newMessageDiv.length) {
            newMessageDiv = $("<div/>").attr("id", "newmessages-indicator")
                    .insertBefore($("#chatline"));
            var bgHack = $("<span/>").attr("id", "newmessages-indicator-bghack")
                    .appendTo(newMessageDiv);

            $("<span/>").addClass("glyphicon glyphicon-chevron-down")
                    .appendTo(bgHack);
            $("<span/>").text("New Messages Below").appendTo(bgHack);
            $("<span/>").addClass("glyphicon glyphicon-chevron-down")
                    .appendTo(bgHack);
            newMessageDiv.click(function () {
                SCROLLCHAT = true;
                scrollChat();
            });
        }

        if (numRemoved > 0) {
            IGNORE_SCROLL_EVENT = true;
            var diff = oldHeight - msgBuf.prop("scrollHeight");
            scrollAndIgnoreEvent(msgBuf.scrollTop() - diff);
        }
    }

    div.find("img").load(function () {
        if (SCROLLCHAT) {
            scrollChat();
        } else if ($(this).position().top < 0) {
            scrollAndIgnoreEvent(msgBuf.scrollTop() + $(this).height());
        }
    });

    var isHighlight = false;
    if (CLIENT.name && data.username != CLIENT.name) {
        if (highlightsMe(data.msg)) {
            div.addClass("nick-highlight");
            isHighlight = true;
        }
    }

    pingMessage(isHighlight, data.username, $(div.children()[2]).text());
}

function highlightsMe(message) {
    // TODO: distinguish between text and HTML attributes as noted in #819
    return message.match(new RegExp("(^|\\b)" + CLIENT.name + "($|\\b)", "gi"));
}

function trimChatBuffer() {
    var maxSize = window.CHATMAXSIZE;
    if (!maxSize || typeof maxSize !== "number")
        maxSize = parseInt(maxSize || 100, 10) || 100;
    var buffer = document.getElementById("messagebuffer");
    var count = buffer.childNodes.length - maxSize;

    for (var i = 0; i < count; i++) {
        buffer.firstChild.remove();
    }

    return count;
}

function pingMessage(isHighlight, notificationTitle, notificationBody) {
    if (!FOCUSED) {
        if (!TITLE_BLINK && (USEROPTS.blink_title === "always" ||
            USEROPTS.blink_title === "onlyping" && isHighlight)) {
            TITLE_BLINK = setInterval(function() {
                if(document.title == "*Chat*")
                    document.title = PAGETITLE;
                else
                    document.title = "*Chat*";
            }, 1000);
        }

        if (USEROPTS.boop === "always" || (USEROPTS.boop === "onlyping" &&
            isHighlight)) {
            CHATSOUND.play();
        }

        if (USEROPTS.notifications === "always" || (USEROPTS.notifications === "onlyping" &&
            isHighlight)) {
            showDesktopNotification(notificationTitle, notificationBody);
        }
    }
}

function showDesktopNotification(notificationTitle, notificationBody)
{
    new Notification(notificationTitle, {body: notificationBody, icon: null});
}

/* layouts */

function undoHDLayout() {
    $("body").removeClass("hd");
    $("#drinkbar").detach().removeClass().addClass("col-lg-12 col-md-12")
      .appendTo("#drinkbarwrap");
    $("#chatwrap").detach().removeClass().addClass("col-lg-5 col-md-5")
      .appendTo("#main");
    $("#videowrap").detach().removeClass().addClass("col-lg-7 col-md-7")
      .appendTo("#main");

    $("#leftcontrols").detach().removeClass().addClass("col-lg-5 col-md-5")
      .prependTo("#controlsrow");

    $("#plcontrol").detach().appendTo("#rightcontrols");
    $("#videocontrols").detach().appendTo("#rightcontrols");

    $("#playlistrow").prepend('<div id="leftpane" class="col-lg-5 col-md-5" />');
    $("#leftpane").append('<div id="leftpane-inner" class="row" />');

    $("#pollwrap").detach().removeClass().addClass("col-lg-12 col-md-12")
      .appendTo("#leftpane-inner");
    $("#playlistmanagerwrap").detach().removeClass().addClass("col-lg-12 col-md-12")
      .css("margin-top", "10px")
      .appendTo("#leftpane-inner");

    $("#rightpane").detach().removeClass().addClass("col-lg-7 col-md-7")
      .appendTo("#playlistrow");

    $("nav").addClass("navbar-fixed-top");
    $("#mainpage").css("padding-top", "60px");
    $("#queue").css("max-height", "500px");
    $("#messagebuffer, #userlist").css("max-height", "");
}

function compactLayout() {
    /* Undo synchtube layout */
    if ($("body").hasClass("synchtube")) {
        $("body").removeClass("synchtube")
        $("#chatwrap").detach().insertBefore($("#videowrap"));
        $("#leftcontrols").detach().insertBefore($("#rightcontrols"));
        $("#leftpane").detach().insertBefore($("#rightpane"));
        $("#userlist").css("float", "left");
        if($("#userlisttoggle").hasClass("glyphicon-chevron-left")){
            $("#userlisttoggle").removeClass("glyphicon-chevron-left").addClass("glyphicon-chevron-right")
        }
        $("#userlisttoggle").removeClass("pull-right").addClass("pull-left")
    }

    /* Undo fluid layout */
    if ($("body").hasClass("fluid")) {
        $("body").removeClass("fluid")
        $(".container-fluid").removeClass("container-fluid").addClass("container");
    }

    /* Undo HD layout */
    if ($("body").hasClass("hd")) {
        undoHDLayout();
    }

    $("body").addClass("compact");
    handleVideoResize();
}

function fluidLayout() {
    if ($("body").hasClass("hd")) {
        undoHDLayout();
    }
    $(".container").removeClass("container").addClass("container-fluid");
    $("footer .container-fluid").removeClass("container-fluid").addClass("container");
    $("body").addClass("fluid");
    handleVideoResize();
}

function synchtubeLayout() {
    if ($("body").hasClass("hd")) {
        undoHDLayout();
    }
    if($("#userlisttoggle").hasClass("glyphicon-chevron-right")){
        $("#userlisttoggle").removeClass("glyphicon-chevron-right").addClass("glyphicon-chevron-left")
    }
    $("#userlisttoggle").removeClass("pull-left").addClass("pull-right")
    $("#videowrap").detach().insertBefore($("#chatwrap"));
    $("#rightcontrols").detach().insertBefore($("#leftcontrols"));
    $("#rightpane").detach().insertBefore($("#leftpane"));
    $("#userlist").css("float", "right");
    $("body").addClass("synchtube");
}

/*
 * "HD" is kind of a misnomer.  Should be renamed at some point.
 */
function hdLayout() {
    var videowrap = $("#videowrap"),
        chatwrap = $("#chatwrap"),
        playlist = $("#rightpane")

    videowrap.detach().insertAfter($("#drinkbar"))
        .removeClass()
        .addClass("col-md-8 col-md-offset-2");

    playlist.detach().insertBefore(chatwrap)
        .removeClass()
        .addClass("col-md-6");

    chatwrap.removeClass()
        .addClass("col-md-6");

    var ch = "320px";
    $("#messagebuffer").css("max-height", ch);
    $("#userlist").css("max-height", ch);
    $("#queue").css("max-height", "312px");

    $("#leftcontrols").detach()
        .insertAfter(chatwrap)
        .removeClass()
        .addClass("col-md-6");

    $("#playlistmanagerwrap").detach()
        .insertBefore($("#leftcontrols"))
        .css("margin-top", "0")
        .removeClass()
        .addClass("col-md-6");

    $("#showplaylistmanager").addClass("btn-sm");

    var plcontrolwrap = $("<div/>").addClass("col-md-12")
        .prependTo($("#rightpane-inner"));

    $("#plcontrol").detach().appendTo(plcontrolwrap);
    $("#videocontrols").detach()
        .appendTo(plcontrolwrap);

    $("#controlswrap").remove();

    $("#pollwrap").detach()
        .insertAfter($("#leftcontrols"))
        .removeClass()
        .addClass("col-md-6 col-md-offset-6");

    $("#leftpane").remove();
    $("nav.navbar-fixed-top").removeClass("navbar-fixed-top");
    $("#mainpage").css("padding-top", "0");

    $("body").addClass("hd");
    handleVideoResize();
}

function chatOnly() {
    var chat = $("#chatwrap").detach();
    removeVideo();
    $("#wrap").remove();
    $("footer").remove();
    chat.prependTo($("body"));
    chat.css({
        "min-height": "100%",
        "min-width": "100%",
        margin: "0",
        padding: "0"
    });
    $("<span/>").addClass("label label-default pull-right pointer")
        .text("User Options")
        .appendTo($("#chatheader"))
        .click(showUserOptions);
    $("<span/>").addClass("label label-default pull-right pointer")
        .attr("id", "showchansettings")
        .text("Channel Settings")
        .appendTo($("#chatheader"))
        .click(function () {
            $("#channeloptions").modal();
        });
    $("<span/>").addClass("label label-default pull-right pointer")
        .text("Emote List")
        .appendTo($("#chatheader"))
        .click(function () {
            EMOTELISTMODAL.modal();
        });
    setVisible("#showchansettings", CLIENT.rank >= 2);

    $("body").addClass("chatOnly");
    handleWindowResize();
}

function handleWindowResize() {
    if ($("body").hasClass("chatOnly")) {
        var h = $("body").outerHeight() - $("#chatline").outerHeight() -
                $("#chatheader").outerHeight();
        $("#messagebuffer").outerHeight(h);
        $("#userlist").outerHeight(h);
        return;
    } else {
        handleVideoResize();
    }
    scrollChat();
}

function handleVideoResize() {
    if ($("#ytapiplayer").length === 0) return;

    var intv, ticks = 0;
    var resize = function () {
        if (++ticks > 10) clearInterval(intv);
        if ($("#ytapiplayer").parent().outerHeight() <= 0) return;
        clearInterval(intv);

        var responsiveFrame = $("#ytapiplayer").parent();
        var height = responsiveFrame.outerHeight() - $("#chatline").outerHeight() - 2;
        $("#messagebuffer").height(height);
        $("#userlist").height(height);

        $("#ytapiplayer").attr("height", VHEIGHT = responsiveFrame.outerHeight());
        $("#ytapiplayer").attr("width", VWIDTH = responsiveFrame.outerWidth());
    };

    if ($("#ytapiplayer").height() > 0) resize();
    else intv = setInterval(resize, 500);
}

$(window).resize(handleWindowResize);
handleWindowResize();

function removeVideo(event) {
    try {
        PLAYER.setVolume(0);
    } catch (e) {
    }

    $("#videowrap").remove();
    $("#chatwrap").removeClass("col-lg-5 col-md-5").addClass("col-md-12");
    if (event) event.preventDefault();
}

/* channel administration stuff */

function genPermissionsEditor() {
    $("#cs-permedit").html("");
    var form = $("<form/>").addClass("form-horizontal")
        .attr("action", "javascript:void(0)")
        .appendTo($("#cs-permedit"));

    function makeOption(text, key, permset, defval) {
        var group = $("<div/>").addClass("form-group")
            .appendTo(form);
        $("<label/>").addClass("control-label col-sm-4")
            .text(text)
            .appendTo(group);
        var controls = $("<div/>").addClass("col-sm-8")
            .appendTo(group);
        var select = $("<select/>").addClass("form-control")
            .appendTo(controls)
            .data("key", key);

        for (var i = 0; i < permset.length; i++) {
            $("<option/>").attr("value", permset[i][1])
                .text(permset[i][0])
                .attr("selected", defval === permset[i][1])
                .appendTo(select);
        }
    }

    function addDivider(text, nonewline) {
        $("<hr/>").appendTo(form);
        if (!nonewline) {
            $("<h3/>").text(text).appendTo(form);
        }
    }

    var standard = [
        ["Anonymous"    , "-1"],
        ["Guest"        , "0"],
        ["Registered"   , "1"],
        ["Leader"       , "1.5"],
        ["Moderator"    , "2"],
        ["Channel Admin", "3"],
        ["Nobody"       , "1000000"]
    ];

    var noanon = [
        ["Guest"        , "0"],
        ["Registered"   , "1"],
        ["Leader"       , "1.5"],
        ["Moderator"    , "2"],
        ["Channel Admin", "3"],
        ["Nobody"       , "1000000"]
    ];

    var modleader = [
        ["Leader"       , "1.5"],
        ["Moderator"    , "2"],
        ["Channel Admin", "3"],
        ["Nobody"       , "1000000"]
    ];

    var modplus = [
        ["Moderator"    , "2"],
        ["Channel Admin", "3"],
        ["Nobody"       , "1000000"]
    ];

    $("<h3/>").text("Open playlist permissions").appendTo(form);
    makeOption("Add to playlist", "oplaylistadd", standard, CHANNEL.perms.oplaylistadd+"");
    makeOption("Add/move to next", "oplaylistnext", standard, CHANNEL.perms.oplaylistnext+"");
    makeOption("Move playlist items", "oplaylistmove", standard, CHANNEL.perms.oplaylistmove+"");
    makeOption("Delete playlist items", "oplaylistdelete", standard, CHANNEL.perms.oplaylistdelete+"");
    makeOption("Jump to video", "oplaylistjump", standard, CHANNEL.perms.oplaylistjump+"");
    makeOption("Queue playlist", "oplaylistaddlist", standard, CHANNEL.perms.oplaylistaddlist+"");

    addDivider("General playlist permissions");
    makeOption("View the playlist", "seeplaylist", standard, CHANNEL.perms.seeplaylist+"");
    makeOption("Add to playlist", "playlistadd", standard, CHANNEL.perms.playlistadd+"");
    makeOption("Add/move to next", "playlistnext", standard, CHANNEL.perms.playlistnext+"");
    makeOption("Move playlist items", "playlistmove", standard, CHANNEL.perms.playlistmove+"");
    makeOption("Delete playlist items", "playlistdelete", standard, CHANNEL.perms.playlistdelete+"");
    makeOption("Jump to video", "playlistjump", standard, CHANNEL.perms.playlistjump+"");
    makeOption("Queue playlist", "playlistaddlist", standard, CHANNEL.perms.playlistaddlist+"");
    makeOption("Queue livestream", "playlistaddlive", standard, CHANNEL.perms.playlistaddlive+"");
    makeOption("Embed custom media", "playlistaddcustom", standard, CHANNEL.perms.playlistaddcustom + "");
    makeOption("Add raw video file", "playlistaddrawfile", standard, CHANNEL.perms.playlistaddrawfile + "");
    makeOption("Exceed maximum media length", "exceedmaxlength", standard, CHANNEL.perms.exceedmaxlength+"");
    makeOption("Exceed maximum total media length", "exceedmaxdurationperuser", standard, CHANNEL.perms.exceedmaxdurationperuser+"");
    makeOption("Exceed maximum number of videos per user", "exceedmaxitems", standard, CHANNEL.perms.exceedmaxitems+"");
    makeOption("Add nontemporary media", "addnontemp", standard, CHANNEL.perms.addnontemp+"");
    makeOption("Temp/untemp playlist item", "settemp", standard, CHANNEL.perms.settemp+"");
    makeOption("Lock/unlock playlist", "playlistlock", modleader, CHANNEL.perms.playlistlock+"");
    makeOption("Shuffle playlist", "playlistshuffle", standard, CHANNEL.perms.playlistshuffle+"");
    makeOption("Clear playlist", "playlistclear", standard, CHANNEL.perms.playlistclear+"");
    makeOption("Delete from channel library", "deletefromchannellib", standard, CHANNEL.perms.deletefromchannellib+"");

    addDivider("Polls");
    makeOption("Open/Close poll", "pollctl", modleader, CHANNEL.perms.pollctl+"");
    makeOption("Vote", "pollvote", standard, CHANNEL.perms.pollvote+"");
    makeOption("View hidden poll results", "viewhiddenpoll", standard, CHANNEL.perms.viewhiddenpoll+"");
    makeOption("Voteskip", "voteskip", standard, CHANNEL.perms.voteskip+"");
    makeOption("View voteskip results", "viewvoteskip", standard, CHANNEL.perms.viewvoteskip+"");

    addDivider("Moderation");
    makeOption("Assign/Remove leader", "leaderctl", modplus, CHANNEL.perms.leaderctl+"");
    makeOption("Mute users", "mute", modleader, CHANNEL.perms.mute+"");
    makeOption("Kick users", "kick", modleader, CHANNEL.perms.kick+"");
    makeOption("Ban users", "ban", modplus, CHANNEL.perms.ban+"");
    makeOption("Edit MOTD", "motdedit", modplus, CHANNEL.perms.motdedit+"");
    makeOption("Edit chat filters", "filteredit", modplus, CHANNEL.perms.filteredit+"");
    makeOption("Import chat filters", "filterimport", modplus, CHANNEL.perms.filterimport+"");
    makeOption("Edit chat emotes", "emoteedit", modplus, CHANNEL.perms.emoteedit+"");
    makeOption("Import chat emotes", "emoteimport", modplus, CHANNEL.perms.emoteimport+"");

    addDivider("Misc");
    makeOption("Drink calls", "drink", modleader, CHANNEL.perms.drink+"");
    makeOption("Chat", "chat", noanon, CHANNEL.perms.chat+"");
    makeOption("Clear Chat", "chatclear", modleader, CHANNEL.perms.chatclear+"");

    var sgroup = $("<div/>").addClass("form-group").appendTo(form);
    var sgroupinner = $("<div/>").addClass("col-sm-8 col-sm-offset-4").appendTo(sgroup);
    var submit = $("<button/>").addClass("btn btn-primary").appendTo(sgroupinner);
    submit.text("Save");
    submit.click(function() {
        var perms = {};
        form.find("select").each(function() {
            perms[$(this).data("key")] = parseFloat($(this).val());
        });
        socket.emit("setPermissions", perms);
    });

    var msggroup = $("<div/>").addClass("form-group").insertAfter(sgroup);
    var msginner = $("<div/>").addClass("col-sm-8 col-sm-offset-4").appendTo(msggroup);
    var text = $("<span/>").addClass("text-info").text("Permissions updated")
        .appendTo(msginner);

    setTimeout(function () {
        msggroup.hide("fade", function () {
            msggroup.remove();
        });
    }, 5000);
}

function waitUntilDefined(obj, key, fn) {
    if(typeof obj[key] === "undefined") {
        setTimeout(function () {
            waitUntilDefined(obj, key, fn);
        }, 100);
        return;
    }
    fn();
}

/*
    God I hate supporting IE11
    https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Default_parameters
    https://caniuse.com/#search=default%20function

    This would be the ideal:
    function chatDialog(div, zin = "auto") {
*/
function chatDialog(div, zin) {
    if(!zin){ zin = 'auto'; }
    var parent = $("<div/>").addClass("profile-box")
        .css({
            padding: "10px",
            "z-index": zin,
            position: "absolute"
        })
        .appendTo($("#chatwrap"));

    div.appendTo(parent);
    var cw = $("#chatwrap").width();
    var ch = $("#chatwrap").height();
    var x = cw/2 - parent.width()/2;
    var y = ch/2 - parent.height()/2;
    parent.css("left", x + "px");
    parent.css("top", y + "px");
    return parent;
}

function errDialog(err) {
    var div = $("<div/>").addClass("profile-box")
        .css("padding", "10px")
        .text(err)
        .appendTo($("body"));

    $("<br/>").appendTo(div);
    $("<button/>").addClass("btn btn-xs btn-default")
        .css("width", "100%")
        .text("OK")
        .click(function () { div.remove(); })
        .appendTo(div);
    var cw = $("#chatwrap").width();
    var ch = $("#chatwrap").height();
    var cp = $("#chatwrap").offset();
    var x = cp.left + cw/2 - div.width()/2;
    var y = cp.top + ch/2 - div.height()/2;
    div.css("left", x + "px")
        .css("top", y + "px")
        .css("position", "absolute");
    return div;
}

/**
 * 2016-12-08
 * I *promise* that one day I will actually split this file into submodules
 * -cal
 */

/**
 * modalAlert accepts options { title, textContent, htmlContent }
 * All are optional
 */
function modalAlert(options) {
    if (typeof options !== "object" || options === null) {
        throw new Error("modalAlert() called without required parameter");
    }

    var modal = makeModal();
    modal.addClass("cytube-modal-alert");
    modal.removeClass("fade");
    modal.find(".modal-dialog").addClass("modal-dialog-nonfluid");

    if (options.title) {
        $("<h3/>").text(options.title).appendTo(modal.find(".modal-header"));
    }

    var contentDiv = $("<div/>").addClass("modal-body");
    if (options.htmlContent) {
        contentDiv.html(options.htmlContent);
    } else if (options.textContent) {
        contentDiv.text(options.textContent);
    }

    contentDiv.appendTo(modal.find(".modal-content"));

    var footer = $("<div/>").addClass("modal-footer");
    var okButton = $("<button/>").addClass("btn btn-primary")
            .attr({ "data-dismiss": "modal"})
            .text(options.dismissText || "OK")
            .appendTo(footer);
    footer.appendTo(modal.find(".modal-content"));
    modal.appendTo(document.body);
    modal.modal();
}

function queueMessage(data, type) {
    if (!data)
        data = { link: null };
    if (!data.msg || data.msg === true) {
        data.msg = "Queue failed.  Check your link to make sure it is valid.";
    }
    var ltype = "label-danger";
    var title = "Error";
    if (type === "alert-warning") {
        ltype = "label-warning";
        title = "Warning";
    }

    var alerts = $(".qfalert.qf-" + type + " .alert");
    for (var i = 0; i < alerts.length; i++) {
        var al = $(alerts[i]);
        if (al.data("reason") === data.msg) {
            var tag = al.find("." + ltype);
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
                    .addClass("label pull-right pointer " + ltype)
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
    text = text.replace(/(https?:[^ ]+)/g, "<a href='$1' target='_blank'>$1</a>");
    if (typeof data.link === "string") {
        text += "<br><a href='" + data.link + "' target='_blank'>" +
                data.link + "</a>";
    }
    var newAlert = makeAlert(title, text, type)
        .addClass("linewrap qfalert qf-" + type)
        .prependTo($("#queuefail"));
    newAlert.find(".alert").data("reason", data.msg);
}

function setupChanlogFilter(data) {
    data = data.split("\n").filter(function (ln) {
        return ln.indexOf("[") === 0 && ln.indexOf("]") > 0;
    });

    var log = $("#cs-chanlog-text");
    var select = $("#cs-chanlog-filter");
    select.html("");
    log.data("lines", data);

    var keys = {};
    data.forEach(function (ln) {
        var m = ln.match(/^\[.*?\] \[(\w+?)\].*$/);
        if (m) {
            keys[m[1]] = true;
        }
    });

    Object.keys(keys).forEach(function (key) {
        $("<option/>").attr("value", key).text(key).appendTo(select);
    });

    $("<option/>").attr("value", "chat").text("chat").prependTo(select);
}

function filterChannelLog() {
    var log = $("#cs-chanlog-text");
    var filter = $("#cs-chanlog-filter").val();
    var getKey = function (ln) {
        var left = ln.indexOf("[", 1);
        var right = ln.indexOf("]", left);
        if (left === -1) {
            return false;
        }
        return ln.substring(left+1, right);
    };

    var getTimestamp = function (ln) {
        var right = ln.indexOf("]");
        return ln.substring(1, right);
    };

    var getMessage = function (ln) {
        var right = ln.indexOf("]");
        return ln.substring(right + 2);
    };

    var show = [];
    (log.data("lines")||[]).forEach(function (ln) {
        var key = getKey(ln);
        if (!filter || !key && filter.indexOf("chat") !== -1) {
            show.push(ln);
        } else if (filter.indexOf(key) >= 0) {
            show.push(ln);
        }
    });

    log.text(show.join("\n"));
    log.scrollTop(log.prop("scrollHeight"));
}

function makeModal() {
    var wrap = $("<div/>").addClass("modal fade");
    var dialog = $("<div/>").addClass("modal-dialog").appendTo(wrap);
    var content = $("<div/>").addClass("modal-content").appendTo(dialog);

    var head = $("<div/>").addClass("modal-header").appendTo(content);
    $("<button/>").addClass("close")
        .attr("data-dismiss", "modal")
        .attr("data-hidden", "true")
        .html("&times;")
        .appendTo(head);

    wrap.on("hidden.bs.modal", function () {
        wrap.remove();
    });
    return wrap;
}

function formatCSModList() {
    var tbl = $("#cs-chanranks table");
    tbl.find("tbody").remove();
    var entries = tbl.data("entries") || [];
    entries.sort(function(a, b) {
        if (a.rank === b.rank) {
            var x = a.name.toLowerCase();
            var y = b.name.toLowerCase();
            return y == x ? 0 : (x < y ? -1 : 1);
        }

        return b.rank - a.rank;
    });

    entries.forEach(function (entry) {
        var tr = $("<tr/>").addClass("cs-chanrank-tr-" + entry.name);
        var name = $("<td/>").text(entry.name).appendTo(tr);
        name.addClass(getNameColor(entry.rank));
        var rankwrap = $("<td/>");
        var rank = $("<span/>").text(entry.rank).appendTo(rankwrap);
        var dd = $("<div/>").addClass("btn-group");
        var toggle = $("<button/>")
            .addClass("btn btn-xs btn-default dropdown-toggle")
            .attr("data-toggle", "dropdown")
            .html("Edit <span class=caret></span>")
            .appendTo(dd);
        if (CLIENT.rank <= entry.rank && !(CLIENT.rank === 4 && entry.rank === 4)) {
            toggle.addClass("disabled");
        }

        var menu = $("<ul/>").addClass("dropdown-menu")
            .attr("role", "menu")
            .appendTo(dd);

        var ranks = [
            { name: "Remove Moderator", rank: 1 },
            { name: "Moderator", rank: 2 },
            { name: "Admin", rank: 3 },
            { name: "Owner", rank: 4 },
            { name: "Founder", rank: 5 }
        ];

        ranks.forEach(function (r) {
            var li = $("<li/>").appendTo(menu);
            var a = $("<a/>")
                .addClass(getNameColor(r.rank))
                .attr("href", "javascript:void(0)")
                .text(r.name)
                .appendTo(li);
            if (r.rank !== entry.rank) {
                a.click(function () {
                    socket.emit("setChannelRank", {
                        name: entry.name,
                        rank: r.rank
                    });
                });
            } else {
                $("<span/>").addClass("glyphicon glyphicon-ok")
                    .appendTo(a);
                li.addClass("disabled");
            }

            if (r.rank > CLIENT.rank || (CLIENT.rank < 4 && r.rank === CLIENT.rank)) {
                li.addClass("disabled");
            }
        });

        dd.css("margin-right", "10px").prependTo(rankwrap);
        rankwrap.appendTo(tr);
        tr.appendTo(tbl);
    });
}

function formatCSBanlist() {
    var tbl = $("#cs-banlist table");
    tbl.find("tbody").remove();
    var entries = tbl.data("entries") || [];
    var sparse = {};
    for (var i = 0; i < entries.length; i++) {
        if (!(entries[i].name in sparse)) {
            sparse[entries[i].name] = [];
        }
        sparse[entries[i].name].push(entries[i]);
    }

    var flat = [];
    for (var name in sparse) {
        flat.push({
            name: name,
            bans: sparse[name]
        });
    }
    flat.sort(function (a, b) {
        var x = a.name.toLowerCase(),
            y = b.name.toLowerCase();
        return x === y ? 0 : (x > y ? 1 : -1);
    });

    var addBanRow = function (entry, after) {
        var tr = $("<tr/>");
        if (after) {
            tr.insertAfter(after);
        } else {
            tr.appendTo(tbl);
        }
        var unban = $("<button/>").addClass("btn btn-xs btn-danger")
            .appendTo($("<td/>").appendTo(tr));
        unban.click(function () {
            socket.emit("unban", {
                id: entry.id,
                name: entry.name
            });
        });
        $("<span/>").addClass("glyphicon glyphicon-remove-circle").appendTo(unban);
        $("<td/>").text(entry.ip).appendTo(tr);
        $("<td/>").text(entry.name).appendTo(tr);
        $("<td/>").text(entry.bannedby).appendTo(tr);
        tr.attr("title", "Ban Reason: " + entry.reason);
        return tr;
    };

    flat.forEach(function (person) {
        var bans = person.bans;
        var name = person.name;
        var first = addBanRow(bans.shift());

        if (bans.length > 0) {
            var showmore = $("<button/>").addClass("btn btn-xs btn-default pull-right");
            $("<span/>").addClass("glyphicon glyphicon-list").appendTo(showmore);
            showmore.appendTo(first.find("td")[1]);

            showmore.click(function () {
                if (showmore.data("elems")) {
                    showmore.data("elems").forEach(function (e) {
                        e.remove();
                    });
                    showmore.data("elems", null);
                } else {
                    var elems = [];
                    bans.forEach(function (b) {
                        elems.push(addBanRow(b, first));
                    });
                    showmore.data("elems", elems);
                }
            });
        }
    });
}

function checkEntitiesInStr(str) {
    var entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
        "\\(": "&#40;",
        "\\)": "&#41;"
    };

    var m = str.match(/([&<>"'])|(\\\()|(\\\))/);
    if (m && m[1] in entities) {
        return { src: m[1].replace(/^\\/, ""), replace: entities[m[1]] };
    } else {
        return false;
    }
}

function formatCSChatFilterList() {
    var tbl = $("#cs-chatfilters table");
    tbl.find("tbody").remove();
    tbl.find(".ui-sortable").remove();
    var entries = tbl.data("entries") || [];
    entries.forEach(function (f) {
        var tr = $("<tr/>").appendTo(tbl);
        var controlgroup = $("<div/>").addClass("btn-group")
            .appendTo($("<td/>").appendTo(tr));
        var control = $("<button/>").addClass("btn btn-xs btn-default")
            .attr("title", "Edit this filter")
            .appendTo(controlgroup);
        $("<span/>").addClass("glyphicon glyphicon-list").appendTo(control);
        var del = $("<button/>").addClass("btn btn-xs btn-danger")
            .appendTo(controlgroup);
        $("<span/>").addClass("glyphicon glyphicon-trash").appendTo(del);
        del.click(function () {
            socket.emit("removeFilter", f);
        });
        var name = $("<code/>").text(f.name).appendTo($("<td/>").appendTo(tr));
        var activetd = $("<td/>").appendTo(tr);
        var active = $("<input/>").attr("type", "checkbox")
            .prop("checked", f.active)
            .appendTo(activetd)
            .change(function () {
                f.active = $(this).prop("checked");
                socket.emit("updateFilter", f);
            });

        var reset = function () {
            control.data("editor") && control.data("editor").remove();
            control.data("editor", null);
            control.parent().find(".btn-success").remove();
            var tbody = $(tbl.children()[1]);
            if (tbody.find(".filter-edit-row").length === 0) {
                tbody.sortable("enable");
            }
        };

        control.click(function () {
            if (control.data("editor")) {
                return reset();
            }
            $(tbl.children()[1]).sortable("disable");
            var tr2 = $("<tr/>").insertAfter(tr).addClass("filter-edit-row");
            var wrap = $("<td/>").attr("colspan", "3").appendTo(tr2);
            var form = $("<form/>").addClass("form-inline").attr("role", "form")
                .attr("action", "javascript:void(0)")
                .appendTo(wrap);
            var addTextbox = function (placeholder) {
                var div = $("<div/>").addClass("form-group").appendTo(form)
                    .css("margin-right", "10px");
                var input = $("<input/>").addClass("form-control")
                    .attr("type", "text")
                    .attr("placeholder", placeholder)
                    .attr("title", placeholder)
                    .appendTo(div);
                return input;
            };

            var regex = addTextbox("Filter regex").val(f.source);
            var flags = addTextbox("Regex flags").val(f.flags);
            var replace = addTextbox("Replacement text").val(f.replace);

            var checkwrap = $("<div/>").addClass("checkbox").appendTo(form);
            var checklbl = $("<label/>").text("Filter Links").appendTo(checkwrap);
            var filterlinks = $("<input/>").attr("type", "checkbox")
                .prependTo(checklbl)
                .prop("checked", f.filterlinks);

            var save = $("<button/>").addClass("btn btn-xs btn-success")
                .attr("title", "Save changes")
                .insertAfter(control);
            $("<span/>").addClass("glyphicon glyphicon-floppy-save").appendTo(save);
            save.click(function () {
                f.source = regex.val();
                var entcheck = checkEntitiesInStr(f.source);
                if (entcheck) {
                    alert("Warning: " + entcheck.src + " will be replaced by " +
                          entcheck.replace + " in the message preprocessor.  This " +
                          "regular expression may not match what you intended it to " +
                          "match.");
                }
                f.flags = flags.val();
                f.replace = replace.val();
                f.filterlinks = filterlinks.prop("checked");

                socket.emit("updateFilter", f);
                socket.once("updateFilterSuccess", function () {
                    reset();
                });
            });

            control.data("editor", tr2);
        });
    });
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
}

function formatTime(sec) {
    var h = Math.floor(sec / 3600) + "";
    var m = Math.floor((sec % 3600) / 60) + "";
    var s = sec % 60 + "";

    if (h.length < 2) {
        h = "0" + h;
    }

    if (m.length < 2) {
        m = "0" + m;
    }

    if (s.length < 2) {
        s = "0" + s;
    }

    if (h === "00") {
        return [m, s].join(":");
    } else {
        return [h, m, s].join(":");
    }
}

function formatUserPlaylistList() {
    var list = $("#userpl_list").data("entries") || [];
    list.sort(function (a, b) {
        var x = a.name.toLowerCase();
        var y = b.name.toLowerCase();
        return x == y ? 0 : (x < y ? -1 : 1);
    });

    $("#userpl_list").html("");
    list.forEach(function (pl) {
        var li = $("<li/>").addClass("queue_entry").appendTo($("#userpl_list"));
        var title = $("<span/>").addClass("qe_title").appendTo(li)
            .text(pl.name);
        var time = $("<span/>").addClass("pull-right").appendTo(li)
            .text(pl.count + " items, playtime " + formatTime(pl.duration));
        var clear = $("<div/>").addClass("qe_clear").appendTo(li);

        var btns = $("<div/>").addClass("btn-group pull-left").prependTo(li);
        if (hasPermission("playlistadd")) {
            $("<button/>").addClass("btn btn-xs btn-default")
                .text("End")
                .appendTo(btns)
                .click(function () {
                    socket.emit("queuePlaylist", {
                        name: pl.name,
                        pos: "end",
                        temp: $(".add-temp").prop("checked")
                    });
                });
        }

        if (hasPermission("playlistadd") && hasPermission("playlistnext")) {
            $("<button/>").addClass("btn btn-xs btn-default")
                .text("Next")
                .prependTo(btns)
                .click(function () {
                    socket.emit("queuePlaylist", {
                        name: pl.name,
                        pos: "next",
                        temp: $(".add-temp").prop("checked")
                    });
                });
        }

        $("<button/>").addClass("btn btn-xs btn-danger")
            .html("<span class='glyphicon glyphicon-trash'></span>")
            .attr("title", "Delete playlist")
            .appendTo(btns)
            .click(function () {
                var really = confirm("Are you sure you want to delete" +
                    " this playlist? This cannot be undone.");
                if (!really) {
                    return;
                }
                socket.emit("deletePlaylist", {
                    name: pl.name
                });
            });
    });
}

function loadEmotes(data) {
    function sanitizeText(str) {
        str = str.replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;");
        return str;
    }

    CHANNEL.emotes = [];
    CHANNEL.emoteMap = {};
    CHANNEL.badEmotes = [];
    data.forEach(function (e) {
        if (e.image && e.name) {
            e.regex = new RegExp(e.source, "gi");
            CHANNEL.emotes.push(e);
            if (/\s/g.test(e.name)) {
                // Emotes with spaces can't be hashmapped
                CHANNEL.badEmotes.push(e);
            } else {
                CHANNEL.emoteMap[sanitizeText(e.name)] = e;
            }
        } else {
            console.error("Rejecting invalid emote: " + JSON.stringify(e));
        }
    });
}

function execEmotes(msg) {
    if (USEROPTS.no_emotes) {
        return msg;
    }

    if (CyTube.featureFlag && CyTube.featureFlag.efficientEmotes) {
        return execEmotesEfficient(msg);
    }

    CHANNEL.emotes.forEach(function (e) {
        msg = msg.replace(e.regex, '$1<img class="channel-emote" src="' +
                                   e.image + '" title="' + e.name + '">');
    });

    return msg;
}

function execEmotesEfficient(msg) {
    CHANNEL.badEmotes.forEach(function (e) {
        msg = msg.replace(e.regex, '$1<img class="channel-emote" src="' +
                          e.image + '" title="' + e.name + '">');
    });
    msg = msg.replace(/[^\s]+/g, function (m) {
        if (CHANNEL.emoteMap.hasOwnProperty(m)) {
            var e = CHANNEL.emoteMap[m];
            return '<img class="channel-emote" src="' + e.image + '" title="' + e.name + '">';
        } else {
            return m;
        }
    });
    return msg;
}

function initPm(user) {
    if ($("#pm-" + user).length > 0) {
        return $("#pm-" + user);
    }

    var pm = $("<div/>").addClass("panel panel-default pm-panel")
        .appendTo($("#pmbar"))
        .data("last", { name: "" })
        .attr("id", "pm-" + user);

    var title = $("<div/>").addClass("panel-heading").text(user).appendTo(pm);
    var close = $("<button/>").addClass("close pull-right")
        .html("&times;")
        .appendTo(title).click(function () {
            pm.remove();
            $("#pm-placeholder-" + user).remove();
        });

    var body = $("<div/>").addClass("panel-body").appendTo(pm).hide();
    var placeholder;
    title.click(function () {
        body.toggle();
        pm.removeClass("panel-primary").addClass("panel-default");
        if (!body.is(":hidden")) {
            placeholder = $("<div/>").addClass("pm-panel-placeholder")
                .attr("id", "pm-placeholder-" + user)
                .insertAfter(pm);
            var left = pm.position().left;
            pm.css("position", "absolute")
                .css("bottom", "0px")
                .css("left", left);
        } else {
            pm.css("position", "");
            $("#pm-placeholder-" + user).remove();
        }
    });
    var buffer = $("<div/>").addClass("pm-buffer linewrap").appendTo(body);
    $("<hr/>").appendTo(body);
    var input = $("<input/>").addClass("form-control pm-input").attr("type", "text")
        .attr("maxlength", 320)
        .appendTo(body);

    input.keydown(function (ev) {
        if (ev.keyCode === 13) {
            if (CHATTHROTTLE) {
                return;
            }
            var meta = {};
            var msg = input.val();
            if (msg.trim() === "") {
                return;
            }

            if (USEROPTS.modhat && CLIENT.rank >= Rank.Moderator) {
                meta.modflair = CLIENT.rank;
            }

            if (CLIENT.rank >= 2 && msg.indexOf("/m ") === 0) {
                meta.modflair = CLIENT.rank;
                msg = msg.substring(3);
            }
            socket.emit("pm", {
                to: user,
                msg: msg,
                meta: meta
            });
            input.val("");
        } else if(ev.keyCode == 9) { // Tab completion
            try {
                chatTabComplete(ev.target);
            } catch (error) {
                console.error(error);
            }
            ev.preventDefault();
            return false;
        }
    });

    return pm;
}

function checkScriptAccess(viewSource, type, cb) {
    var pref = JSPREF[CHANNEL.name.toLowerCase() + "_" + type];
    if (pref === "ALLOW") {
        return cb("ALLOW");
    } else if (pref !== "DENY") {
        var div = $("#chanjs-allow-prompt");
        if (div.length > 0) {
            setTimeout(function () {
                checkScriptAccess(viewSource, type, cb);
            }, 500);
            return;
        }

        div = $("<div/>").attr("id", "chanjs-allow-prompt");
        var close = $("<button/>").addClass("close pull-right")
            .html("&times;")
            .appendTo(div);
        var form = $("<form/>")
            .attr("action", "javascript:void(0)")
            .attr("id", "chanjs-allow-prompt")
            .attr("style", "text-align: center")
            .appendTo(div);
        if (type === "embedded") {
            form.append("<span>This channel has special features that require your permission to run.</span><br>");
        } else {
            form.append("<span>This channel has special features that require your permission to run.  This script is hosted on a third-party website and is not endorsed by the owners of the website hosting this channel.</span><br>");
        }

        $(viewSource).appendTo(form);

        form.append("<div id='chanjs-allow-prompt-buttons'>" +
                        "<button id='chanjs-allow' class='btn btn-xs btn-danger'>Allow</button>" +
                        "<button id='chanjs-deny' class='btn btn-xs btn-danger'>Deny</button>" +
                    "</div>");
        form.append("<div class='checkbox'><label><input type='checkbox' " +
                    "id='chanjs-save-pref'/>Remember my choice for this channel" +
                    "</label></div>");
        var dialog = chatDialog(div);

        close.click(function () {
            dialog.remove();
            /* Implicit denial of script access */
            cb("DENY");
        });

        $("#chanjs-allow").click(function () {
            var save = $("#chanjs-save-pref").is(":checked");
            dialog.remove();
            if (save) {
                JSPREF[CHANNEL.name.toLowerCase() + "_" + type] = "ALLOW";
                setOpt("channel_js_pref", JSPREF);
            }
            cb("ALLOW");
        });

        $("#chanjs-deny").click(function () {
            var save = $("#chanjs-save-pref").is(":checked");
            dialog.remove();
            if (save) {
                JSPREF[CHANNEL.name.toLowerCase() + "_" + type] = "DENY";
                setOpt("channel_js_pref", JSPREF);
            }
            cb("DENY");
        });
    }
}

function formatScriptAccessPrefs() {
    var tbl = $("#us-scriptcontrol table");
    tbl.find("tbody").remove();

    var channels = Object.keys(JSPREF).sort();
    channels.forEach(function (channel) {
        var idx = String(channel).lastIndexOf("_");
        if (idx < 0) {
            // Invalid
            console.error("Channel JS pref: invalid key '" + channel + "', deleting it");
            delete JSPREF[channel];
            setOpt("channel_js_pref", JSPREF);
            return;
        }

        var channelName = channel.substring(0, idx);
        var prefType = channel.substring(idx + 1);
        console.log(channelName, prefType);
        if (prefType !== "external" && prefType !== "embedded") {
            // Invalid
            console.error("Channel JS pref: invalid key '" + channel + "', deleting it");
            delete JSPREF[channel];
            setOpt("channel_js_pref", JSPREF);
            return;
        }

        var pref = JSPREF[channel];
        var tr = $("<tr/>").appendTo(tbl);
        $("<td/>").text(channelName).appendTo(tr);
        $("<td/>").text(prefType).appendTo(tr);

        var pref_td = $("<td/>").appendTo(tr);
        var allow_label = $("<label/>").addClass("radio-inline")
            .text("Allow").appendTo(pref_td);
        var allow = $("<input/>").attr("type", "radio")
            .prop("checked", pref === "ALLOW").
            prependTo(allow_label);
        allow.change(function () {
            if (allow.is(":checked")) {
                JSPREF[channel] = "ALLOW";
                setOpt("channel_js_pref", JSPREF);
                deny.prop("checked", false);
            }
        });

        var deny_label = $("<label/>").addClass("radio-inline")
            .text("Deny").appendTo(pref_td);
        var deny = $("<input/>").attr("type", "radio")
            .prop("checked", pref === "DENY").
            prependTo(deny_label);
        deny.change(function () {
            if (deny.is(":checked")) {
                JSPREF[channel] = "DENY";
                setOpt("channel_js_pref", JSPREF);
                allow.prop("checked", false);
            }
        });

        var clearpref = $("<button/>").addClass("btn btn-sm btn-danger")
            .text("Clear Preference")
            .appendTo($("<td/>").appendTo(tr))
            .click(function () {
                delete JSPREF[channel];
                setOpt("channel_js_pref", JSPREF);
                tr.remove();
            });
    });
}

function EmoteList(selector, emoteClickCallback) {
    this.elem = $(selector);
    this.initSearch();
    this.initSortOption();
    this.table = this.elem.find(".emotelist-table")[0];
    this.paginatorContainer = this.elem.find(".emotelist-paginator-container");
    this.cols = 5;
    this.itemsPerPage = 25;
    this.emotes = [];
    this.page = 0;
    this.emoteClickCallback = emoteClickCallback || function(){};
}

EmoteList.prototype.initSearch = function () {
    this.searchbar = this.elem.find(".emotelist-search");
    var self = this;

    this.searchbar.keyup(function () {
        var value = this.value.toLowerCase();
        if (value) {
            self.filter = function (emote) {
                return emote.name.toLowerCase().indexOf(value) >= 0;
            };
        } else {
            self.filter = null;
        }
        self.handleChange();
        self.loadPage(0);
    });
};

EmoteList.prototype.initSortOption = function () {
    this.sortOption = this.elem.find(".emotelist-alphabetical");
    this.sortAlphabetical = false;
    var self = this;

    this.sortOption.change(function () {
        self.sortAlphabetical = this.checked;
        self.handleChange();
        self.loadPage(0);
    });
};

EmoteList.prototype.handleChange = function () {
    this.emotes = CHANNEL.emotes.slice();
    if (this.sortAlphabetical) {
        this.emotes.sort(function (a, b) {
            var x = a.name.toLowerCase();
            var y = b.name.toLowerCase();

            if (x < y) {
                return -1;
            } else if (x > y) {
                return 1;
            } else {
                return 0;
            }
        });
    }

    if (this.filter) {
        this.emotes = this.emotes.filter(this.filter);
    }

    this.paginator = new NewPaginator(this.emotes.length, this.itemsPerPage,
            this.loadPage.bind(this));
    this.paginatorContainer.html("");
    this.paginatorContainer.append(this.paginator.elem);
    this.paginator.loadPage(this.page);
};

EmoteList.prototype.loadPage = function (page) {
    var tbody = this.table.children[0];
    tbody.innerHTML = "";

    var row;
    var start = page * this.itemsPerPage;
    if (start >= this.emotes.length) return;
    var end = Math.min(start + this.itemsPerPage, this.emotes.length);
    var _this = this;

    for (var i = start; i < end; i++) {
        if ((i - start) % this.cols === 0) {
            row = document.createElement("tr");
            tbody.appendChild(row);
        }

        (function (emote) {
            var td = document.createElement("td");
            td.className = "emote-preview-container";

            // Trick element to vertically align the emote within the container
            var hax = document.createElement("span");
            hax.className = "emote-preview-hax";
            td.appendChild(hax);

            var img = document.createElement("img");
            img.src = emote.image;
            img.className = "emote-preview";
            img.title = emote.name;
            img.onclick = _this.emoteClickCallback.bind(null, emote);

            td.appendChild(img);
            row.appendChild(td);
        })(this.emotes[i]);
    }

    this.page = page;
};

function onEmoteClicked(emote) {
    var val = chatline.value;
    if (!val) {
        chatline.value = emote.name;
    } else {
        if (!val.charAt(val.length - 1).match(/\s/)) {
            chatline.value += " ";
        }
        chatline.value += emote.name;
    }

    window.EMOTELISTMODAL.modal("hide");
    chatline.focus();
}

window.EMOTELIST = new EmoteList("#emotelist", onEmoteClicked);
window.EMOTELIST.sortAlphabetical = USEROPTS.emotelist_sort;

function CSEmoteList(selector) {
    EmoteList.call(this, selector);
}

CSEmoteList.prototype = Object.create(EmoteList.prototype);

CSEmoteList.prototype.loadPage = function (page) {
    var tbody = this.table.children[1];
    tbody.innerHTML = "";

    var start = page * this.itemsPerPage;
    if (start >= this.emotes.length) {
        return;
    }
    var end = Math.min(start + this.itemsPerPage, this.emotes.length);
    var self = this;
    this.page = page;

    for (var i = start; i < end; i++) {
        var row = document.createElement("tr");
        tbody.appendChild(row);

        (function (emote, row) {
            // Add delete button
            var tdDelete = document.createElement("td");
            var btnDelete = document.createElement("button");
            btnDelete.className = "btn btn-xs btn-danger";
            var pennJillette = document.createElement("span");
            pennJillette.className = "glyphicon glyphicon-trash";
            btnDelete.appendChild(pennJillette);
            tdDelete.appendChild(btnDelete);
            row.appendChild(tdDelete);

            btnDelete.onclick = function deleteEmote() {
                document.getElementById("cs-emotes-newname").value = emote.name;
                document.getElementById("cs-emotes-newimage").value = emote.image;
                socket.emit("removeEmote", emote);
            };

            // Add emote name
            var tdName = document.createElement("td");
            var nameDisplay = document.createElement("code");
            nameDisplay.textContent = emote.name;
            tdName.appendChild(nameDisplay);
            row.appendChild(tdName);

            var $nameDisplay = $(nameDisplay);
            $nameDisplay.click(function (clickEvent) {
                $nameDisplay.detach();

                var editInput = document.createElement("input");
                editInput.className = "form-control";
                editInput.type = "text";
                editInput.value = emote.name;
                tdName.appendChild(editInput);
                editInput.focus();

                function save() {
                    var val = editInput.value;
                    tdName.removeChild(editInput);
                    tdName.appendChild(nameDisplay);

                    // Nothing was changed
                    if(val === emote.name){ return }

                    // Emote name already exists
                    if( CHANNEL.emotes.filter(function(emote){ return emote.name === val }).length ){
                        /*
                         * Since we are already in a modal
                         *  and Bootstrap doesn't have supermodals
                         *   we will make a self destructing warning
                         *    as a row in the table
                         */
                        var wrow = document.createElement("tr");
                        var tdBlankDel = document.createElement("td"); wrow.appendChild(tdBlankDel);
                        var tdWarnMess = document.createElement("td"); wrow.appendChild(tdWarnMess);
                        var warnSpan = document.createElement("p"); tdWarnMess.appendChild(warnSpan);
                        warnSpan.className = "text-warning";
                        warnSpan.textContent = "An emote of that name already exists.";
                        tdWarnMess.colSpan = "2";

                        row.insertAdjacentElement("beforebegin", wrow)
                        $(wrow).delay(2500).fadeOut('slow', function(){ $(this).remove() });

                        return;
                    }
                    socket.emit("renameEmote", {
                        old: emote.name,
                        image: emote.image,
                        name: val
                    });
                }

                editInput.onblur = save;
                editInput.onkeyup = function (event) {
                    if (event.keyCode === 13) {
                        save();
                    }
                };
            });

            // Add emote image
            var tdImage = document.createElement("td");
            var urlDisplay = document.createElement("code");
            urlDisplay.textContent = emote.image;
            tdImage.appendChild(urlDisplay);
            row.appendChild(tdImage);

            // Add popover to display the image
            var $urlDisplay = $(urlDisplay);
            $urlDisplay.popover({
                html: true,
                trigger: "hover",
                content: '<img src="' + emote.image + '" class="channel-emote">'
            });

            // Change the image for an emote
            $urlDisplay.click(function (clickEvent) {
                $(tdImage).find(".popover").remove();
                $urlDisplay.detach();

                var editInput = document.createElement("input");
                editInput.className = "form-control";
                editInput.type = "text";
                editInput.value = emote.image;
                tdImage.appendChild(editInput);
                editInput.focus();

                function save() {
                    var val = editInput.value;
                    tdImage.removeChild(editInput);
                    tdImage.appendChild(urlDisplay);

                    socket.emit("updateEmote", {
                        name: emote.name,
                        image: val
                    });
                }

                editInput.onblur = save;
                editInput.onkeyup = function (event) {
                    if (event.keyCode === 13) {
                        save();
                    }
                };
            });
        })(this.emotes[i], row);
    }
};

window.CSEMOTELIST = new CSEmoteList("#cs-emotes");
window.CSEMOTELIST.sortAlphabetical = USEROPTS.emotelist_sort;

function showChannelSettings() {
    $("#channeloptions").modal();
}

// There is a point where this file needed to stop and we have clearly passed
// it but let's keep going and see what happens

function startQueueSpinner(data) {
    if ($("#queueprogress").length > 0) {
        return;
    }

    var id = data.id;
    if (data.type === "yp") {
        id = "$any";
    }

    var progress = $("<div/>").addClass("progress").attr("id", "queueprogress")
            .data("queue-id", id);
    var progressBar = $("<div/>").addClass("progress-bar progress-bar-striped active")
            .attr({
                role: "progressbar",
                "aria-valuenow": "100",
                "aria-valuemin": "0",
                "aria-valuemax": "100",
            }).css({
                width: "100%"
            }).appendTo(progress);
    progress.appendTo($("#addfromurl"));
}

function stopQueueSpinner(data) {
    // TODO: this is a temp hack, need to replace media ID check with
    // a passthrough request ID (since media ID from API is not necessarily
    // the same as the URL "ID" from the user)
    if (data && data.type === "us") {
        data = { id: data.title.match(/Ustream.tv - (.*)/)[1] };
    } else if (data && data.type === "mx") {
        data = { id: data.meta.mixer.channelToken };
    }

    var shouldRemove = (data !== null &&
                        typeof data === 'object' &&
                        $("#queueprogress").data("queue-id") === data.id);
    shouldRemove = shouldRemove || data === null;
    shouldRemove = shouldRemove || $("#queueprogress").data("queue-id") === "$any";
    if (shouldRemove) {
        $("#queueprogress").remove();
    }
}

function maybePromptToUpgradeUserscript() {
    if (document.getElementById('prompt-upgrade-drive-userscript')) {
        return;
    }

    if (!window.hasDriveUserscript) {
        return;
    }

    var currentVersion = GS_VERSION.toString(); // data.js
    var userscriptVersion = window.driveUserscriptVersion;
    if (!userscriptVersion) {
        userscriptVersion = '1.0';
    }

    currentVersion = currentVersion.split('.').map(function (part) {
        return parseInt(part, 10);
    });
    userscriptVersion = userscriptVersion.split('.').map(function (part) {
        return parseInt(part, 10);
    });

    var older = false;
    for (var i = 0; i < currentVersion.length; i++) {
        if (userscriptVersion[i] < currentVersion[i]) {
            older = true;
        }
    }

    if (!older) {
        return;
    }

    var alertBox = document.createElement('div');
    alertBox.id = 'prompt-upgrade-drive-userscript';
    alertBox.className = 'alert alert-info'
    alertBox.innerHTML = 'A newer version of the Google Drive userscript is available.';
    alertBox.appendChild(document.createElement('br'));
    var infoLink = document.createElement('a');
    infoLink.className = 'btn btn-info';
    infoLink.href = '/google_drive_userscript';
    infoLink.textContent = 'Click here for installation instructions';
    infoLink.target = '_blank';
    alertBox.appendChild(infoLink);

    var closeButton = document.createElement('button');
    closeButton.className = 'close pull-right';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = function () {
        alertBox.parentNode.removeChild(alertBox);
    }
    alertBox.insertBefore(closeButton, alertBox.firstChild)
    document.getElementById('videowrap').appendChild(alertBox);
}

function backoffRetry(fn, cb, options) {
    var jitter = options.jitter || 0;
    var factor = options.factor || 1;
    var isRetryable = options.isRetryable || function () { return true; };
    var tries = 0;

    function callback(error, result) {
        tries++;
        factor *= factor;
        if (error) {
            if (tries >= options.maxTries) {
                console.log('Max tries exceeded');
                cb(error, result);
            } else if (isRetryable(error)) {
                var offset = Math.random() * jitter;
                var delay = options.delay * factor + offset;
                console.log('Retrying on error: ' + error);
                console.log('Waiting ' + delay + ' ms before retrying');

                setTimeout(function () {
                    fn(callback);
                }, delay);
            }
        } else {
            cb(error, result);
        }
    }

    fn(callback);
}

CyTube.ui.changeVideoWidth = function uiChangeVideoWidth(direction) {
    var body = document.body;
    if (/hd/.test(body.className)) {
        throw new Error("ui::changeVideoWidth does not work with the 'hd' layout");
    }

    var videoWrap = document.getElementById("videowrap");
    var leftControls = document.getElementById("leftcontrols");
    var leftPane = document.getElementById("leftpane");
    var chatWrap = document.getElementById("chatwrap");
    var rightControls = document.getElementById("rightcontrols");
    var rightPane = document.getElementById("rightpane");

    var match = videoWrap.className.match(/col-md-(\d+)/);
    if (!match) {
        throw new Error("ui::changeVideoWidth: videowrap is missing bootstrap class!");
    }

    var videoWidth = parseInt(match[1], 10) + direction;
    if (videoWidth < 3 || videoWidth > 9) {
        return;
    }

    var chatWidth = 12 - videoWidth;
    videoWrap.className = "col-md-" + videoWidth + " col-lg-" + videoWidth;
    rightControls.className = "col-md-" + videoWidth + " col-lg-" + videoWidth;
    rightPane.className = "col-md-" + videoWidth + " col-lg-" + videoWidth;
    chatWrap.className = "col-md-" + chatWidth + " col-lg-" + chatWidth;
    leftControls.className = "col-md-" + chatWidth + " col-lg-" + chatWidth;
    leftPane.className = "col-md-" + chatWidth + " col-lg-" + chatWidth;

    handleVideoResize();
};

CyTube._internal_do_not_use_or_you_will_be_banned.addUserToList = function (data, removePrev) {
    if (removePrev) {
        var user = findUserlistItem(data.name);
        // Remove previous instance of user, if there was one
        if(user !== null)
            user.remove();
    }
    var div = $("<div/>")
        .addClass("userlist_item");
    var icon = $("<span/>").appendTo(div);
    var nametag = $("<span/>").text(data.name).appendTo(div);
    div.data("name", data.name);
    div.data("rank", data.rank);
    div.data("leader", Boolean(data.leader));
    div.data("profile", data.profile);
    div.data("meta", data.meta);
    if (data.meta.muted || data.meta.smuted) {
        div.data("icon", "glyphicon-volume-off");
    } else {
        div.data("icon", false);
    }
    formatUserlistItem(div);
    addUserDropdown(div, data);
    div.appendTo($("#userlist"));
};
