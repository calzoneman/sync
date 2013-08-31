/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

function makeAlert(title, text, klass) {
    if(!klass) {
        klass = "alert-info";
    }

    var al = $("<div/>").addClass("alert")
        .addClass(klass)
        .html(text);
    $("<br/>").prependTo(al);
    $("<strong/>").text(title).prependTo(al);
    $("<button/>").addClass("close pull-right").html("&times;")
        .click(function() {
            al.hide("blind", function() {
                al.remove();
            });
        })
        .prependTo(al);
    return al;
}

function formatURL(data) {
    switch(data.type) {
        case "yt":
            return "http://youtube.com/watch?v=" + data.id;
        case "vi":
            return "http://vimeo.com/" + data.id;
        case "dm":
            return "http://dailymotion.com/video/" + data.id;
        case "sc":
            return data.id;
        case "li":
            return "http://livestream.com/" + data.id;
        case "tw":
            return "http://twitch.tv/" + data.id;
        case "jt":
            return "http://justin.tv/" + data.id;
        case "rt":
            return data.id;
        case "jw":
            return data.id;
        case "im":
            return "http://imgur.com/a/" + data.id;
        case "us":
            return "http://ustream.tv/" + data.id;
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

function formatUserlistItem(div, data) {
    var name = $(div.children()[1]);
    name.removeClass();
    name.css("font-style", "");
    name.addClass(getNameColor(data.rank));
    div.find(".profile-box").remove();

    var profile = null;
    name.mouseenter(function(ev) {
        if (profile)
            profile.remove();

        profile = $("<div/>")
            .addClass("profile-box")
            .css("top", (ev.pageY + 5) + "px")
            .css("left", ev.pageX + "px")
            .appendTo(div);
        if(data.profile.image) {
            $("<img/>").addClass("profile-image")
                .attr("src", data.profile.image)
                .appendTo(profile);
        }
        $("<strong/>").text(data.name).appendTo(profile);
        $("<p/>").text(data.profile.text).appendTo(profile);
    });
    name.mousemove(function(ev) {
        profile.css("top", (ev.pageY + 5) + "px")
            .css("left", ev.pageX + "px")
    });
    name.mouseleave(function() {
        profile.remove();
    });

    var flair = div.children()[0];
    flair.innerHTML = "";
    // denote current leader with a star
    if(data.leader) {
        $("<i/>").addClass("icon-star-empty").appendTo(flair);
    }
    if(data.meta && data.meta.afk) {
        name.css("font-style", "italic");
        $("<i/>").addClass("icon-time").appendTo(flair);
    }
    if(data.meta && data.meta.icon) {
        $("<i/>").addClass(data.meta.icon).prependTo(flair);
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

function addUserDropdown(entry, data) {
    entry.data("dropdown-info", data);
    var name = data.name,
        rank = data.rank,
        leader = data.leader;
    entry.find(".user-dropdown").remove();
    var menu = $("<div/>")
        .addClass("user-dropdown")
        .appendTo(entry)
        .hide();

    $("<strong/>").text(name).appendTo(menu);
    $("<br/>").appendTo(menu);

    /* rank selector (admin+ only)
       to prevent odd behaviour, this selector is only visible
       when the selected user has a normal rank (e.g. not a guest
       or a non-moderator leader
    */
    if(CLIENT.rank >= 3 && CLIENT.rank > rank && rank > 0 && rank != 1.5) {
        var sel = $("<select/>")
            .addClass("input-block-level")
            .appendTo(menu);
        $("<option/>").attr("value", "1").text("Regular User")
            .appendTo(sel);
        $("<option/>").attr("value", "2").text("Moderator")
            .appendTo(sel);
        if(CLIENT.rank > 3) {
            $("<option/>").attr("value", "3").text("Channel Admin")
                .appendTo(sel);
            if(rank > 3) {
                $("<option/>").attr("value", ""+rank)
                    .text("Current Rank (" + rank + ")")
                    .appendTo(sel);
            }
        }
        sel.change(function () {
            socket.emit("setChannelRank", {
                user: name,
                rank: parseInt(sel.val())
            });
        });
        sel.val(""+rank);
    }

    /* ignore button */
    var ignore = $("<button/>").addClass("btn btn-mini btn-block")
        .appendTo(menu)
        .click(function () {
            if(IGNORED.indexOf(name) == -1) {
                ignore.text("Unignore User");
                IGNORED.push(name);
            } else {
                ignore.text("Ignore User");
                IGNORED.splice(IGNORED.indexOf(name), 1);
            }
        });
    if(IGNORED.indexOf(name) == -1) {
        ignore.text("Ignore User");
    } else {
        ignore.text("Unignore User");
    }

    /* gib/remove leader (moderator+ only) */
    if(CLIENT.rank >= 2) {
        var ldr = $("<button/>").addClass("btn btn-mini btn-block")
            .appendTo(menu);
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
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("Kick")
            .click(function () {
                socket.emit("chatMsg", {
                    msg: "/kick " + name
                });
            })
            .appendTo(menu);
    }

    /* ban buttons */
    if(hasPermission("ban")) {
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("Name Ban")
            .click(function () {
                socket.emit("chatMsg", {
                    msg: "/ban " + name
                });
            })
            .appendTo(menu);
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("IP Ban")
            .click(function () {
                socket.emit("chatMsg", {
                    msg: "/ipban " + name
                });
            })
            .appendTo(menu);
    }

    entry.contextmenu(function(ev) {
        ev.preventDefault();
        if(menu.css("display") == "none") {
            menu.show();
        } else {
            menu.hide();
        }
        return false;
    });
}

function calcUserBreakdown() {
    var breakdown = {
        "Site Admins": 0,
        "Channel Admins": 0,
        "Moderators": 0,
        "Regular Users": 0,
        "Guests": 0,
        "AFK": 0
    };
    $("#userlist .userlist_item").each(function (index, item) {
        var data = $(item).data("dropdown-info");
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

        if($(item).find(".icon-time").length > 0)
            breakdown["AFK"]++;
    });

    return breakdown;
}

function sortUserlist() {
    var slice = Array.prototype.slice;
    var list = slice.call($("#userlist .userlist_item"));
    list.sort(function (a, b) {
        var r1 = $(a).data("dropdown-info").rank;
        var r2 = $(b).data("dropdown-info").rank;
        var afk1 = $(a).find(".icon-time").length > 0;
        var afk2 = $(b).find(".icon-time").length > 0;
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
        $("<button/>").addClass("btn btn-mini qbtn-play")
            .html("<i class='icon-play'></i>Play")
            .click(function() {
                socket.emit("jumpTo", li.data("uid"));
            })
            .appendTo(menu);
    }
    // Queue next
    if(hasPermission("playlistmove")) {
        $("<button/>").addClass("btn btn-mini qbtn-next")
            .html("<i class='icon-share-alt'></i>Queue Next")
            .click(function() {
                socket.emit("moveMedia", {
                    from: li.data("uid"),
                    after: PL_CURRENT,
                    moveby: null
                });
            })
            .appendTo(menu);
    }
    // Temp/Untemp
    if(hasPermission("settemp")) {
        var tempstr = li.data("temp")?"Make Permanent":"Make Temporary";
        $("<button/>").addClass("btn btn-mini qbtn-tmp")
            .html("<i class='icon-flag'></i>" + tempstr)
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
        $("<button/>").addClass("btn btn-mini qbtn-delete")
            .html("<i class='icon-trash'></i>Delete")
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
            var icon = $(this).find("i");
            $(this).html("");
            icon.appendTo(this);
        });
        menu.find(".qbtn-play").addClass("btn-success");
        menu.find(".qbtn-delete").addClass("btn-danger");
    }
    else if(menu.find(".btn").length != 0) {
        li.unbind("contextmenu");
        li.contextmenu(function(ev) {
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
                    REBUILDING = false;
                }
            }, 10*i);
        })(i, r);
        i++;
    });
}

/* menus */
function showOpts() {
    hidePlayer();
    var modal = $("<div/>").addClass("modal hide fade")
        .appendTo($("body"));

    modal.load("useroptions.html", function () {
        if (CLIENT.rank < 2) {
            $("#uopt-btn-mod").remove();
        }

        var tabHandler = function (btnid, panelid) {
            $(btnid).click(function () {
                modal.find(".btn.btn-small").attr("disabled", false);
                modal.find(".uopt-panel").hide();
                $(btnid).attr("disabled", true);
                $(panelid).show();
            });
        };

        tabHandler("#uopt-btn-general", "#uopt-panel-general");
        tabHandler("#uopt-btn-playback", "#uopt-panel-playback");
        tabHandler("#uopt-btn-chat", "#uopt-panel-chat");
        tabHandler("#uopt-btn-mod", "#uopt-panel-mod");

        var initForm = function (id) {
            var f = $("<form/>").appendTo($(id))
                .addClass("form-horizontal")
                .attr("action", "javascript:void(0)");
            return $("<fieldset/>").appendTo(f);
        };

        var addOption = function (form, lbl, thing) {
            var g = $("<div/>").addClass("control-group").appendTo(form);
            $("<label/>").addClass("control-label").text(lbl).appendTo(g);
            var c = $("<div/>").addClass("controls").appendTo(g);
            thing.appendTo(c);
        };

        var addCheckbox = function (form, opt, lbl) {
            var c = $("<label/>").addClass("checkbox")
                .text(lbl);
            var box = $("<input/>").attr("type", "checkbox")
                .appendTo(c);
            addOption(form, opt, c);
            return box;
        };

        // general options
        var general = initForm("#uopt-panel-general");

        var gen_theme = $("<select/>");
        $("<option/>").attr("value", "default")
            .text("Default")
            .appendTo(gen_theme);
        $("<option/>").attr("value", "assets/css/darkstrap.css")
            .text("Dark")
            .appendTo(gen_theme);
        gen_theme.val(USEROPTS.theme);
        addOption(general, "Theme", gen_theme);

        var gen_layout = $("<select/>");
        $("<option/>").attr("value", "default")
            .text("Compact")
            .appendTo(gen_layout);
        $("<option/>").attr("value", "synchtube")
            .text("Synchtube")
            .appendTo(gen_layout);
        $("<option/>").attr("value", "fluid")
            .text("Fluid")
            .appendTo(gen_layout);
        gen_layout.val(USEROPTS.layout);
        addOption(general, "Layout", gen_layout);

        var gen_layoutwarn = $("<p/>").addClass("text-error")
            .text("Changing layouts may require a refresh");
        addOption(general, "", gen_layoutwarn);

        var gen_css = $("<input/>").attr("type", "text")
            .attr("placeholder", "Stylesheet URL");
        gen_css.val(USEROPTS.css);
        addOption(general, "User CSS", gen_css);

        var gen_nocss = addCheckbox(general, "Channel CSS",
                                    "Ignore channel CSS");
        gen_nocss.prop("checked", USEROPTS.ignore_channelcss);

        var gen_nojs = addCheckbox(general, "Channel JS",
                                    "Ignore channel JS");
        gen_nojs.prop("checked", USEROPTS.ignore_channeljs);

        // playback options
        var playback = initForm("#uopt-panel-playback");

        var pl_synch = addCheckbox(playback, "Synchronize",
                                   "Synchronize media playback");
        pl_synch.prop("checked", USEROPTS.synch);

        var pl_synchacc = $("<input/>").attr("type", "text")
            .attr("placeholder", "Accuracy in seconds");
        pl_synchacc.val(USEROPTS.sync_accuracy);
        addOption(playback, "Synch Accuracy (seconds)", pl_synchacc);

        var pl_wmode = addCheckbox(playback, "Transparent wmode",
                                   "Allow transparency over video player");
        pl_wmode.prop("checked", USEROPTS.wmode_transparent);

        var pl_wmodewarn = $("<p/>").addClass("text-error")
            .text("Enabling transparent wmode may cause performance "+
                  "issues on some systems");
        addOption(playback, "", pl_wmodewarn);

        var pl_hide = addCheckbox(playback, "Hide Video",
                                  "Remove the video player");
        pl_hide.prop("checked", USEROPTS.hidevid);

        // mod options
        var mod = initForm("#uopt-panel-mod");

        var mod_flair = addCheckbox(mod, "Modflair", "Show name color");
        mod_flair.prop("checked", USEROPTS.modhat);

        var mod_joinmsg = addCheckbox(mod, "Join Messages",
                                      "Show join messages");
        mod_joinmsg.prop("checked", USEROPTS.joinmessage);


        $("#uopt-btn-general").click();
        $("#uopt-btn-save").click(function () {
        });
    });

    modal.on("hidden", function () {
        unhidePlayer();
        modal.remove();
    });

    modal.modal();
}

function showOptionsMenu() {
    hidePlayer();
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
    $("<option/>").attr("value", "assets/css/semidark.css").text("Semidark").appendTo(themeselect);
    themeselect.val(USEROPTS.theme);
    addOption("Theme", themeselect);

    var usercss = $("<input/>").attr("type", "text")
        .attr("placeholder", "Stylesheet URL");
    usercss.val(USEROPTS.css);
    addOption("User CSS", usercss);

    var layoutselect = $("<select/>");
    $("<option/>").attr("value", "default").text("Compact")
        .appendTo(layoutselect);
    $("<option/>").attr("value", "synchtube").text("Synchtube")
        .appendTo(layoutselect);
    $("<option/>").attr("value", "fluid").text("Fluid")
        .appendTo(layoutselect);
    layoutselect.val(USEROPTS.layout);
    addOption("Layout", layoutselect);
    var warn = $("<p/>").addClass("text-error")
        .text("Changing layouts may require a refresh")
    addOption("", warn);
    $("<hr>").appendTo(form);
    var nocsscontainer = $("<label/>").addClass("checkbox")
        .text("Ignore channel CSS");
    var nocss = $("<input/>").attr("type", "checkbox").appendTo(nocsscontainer);
    nocss.prop("checked", USEROPTS.ignore_channelcss);
    addOption("Channel CSS", nocsscontainer);
    var nojscontainer = $("<label/>").addClass("checkbox")
        .text("Ignore channel JS");
    var nojs = $("<input/>").attr("type", "checkbox").appendTo(nojscontainer);
    nojs.prop("checked", USEROPTS.ignore_channeljs);
    addOption("Channel JS", nojscontainer);
    $("<hr>").appendTo(form);

    var hqbtncontainer = $("<label/>").addClass("checkbox")
        .text("Hide playlist buttons by default");
    var hqbtn = $("<input/>").attr("type", "checkbox").appendTo(hqbtncontainer);
    hqbtn.prop("checked", USEROPTS.qbtn_hide);
    addOption("Playlist Buttons", hqbtncontainer);

    var oqbtncontainer = $("<label/>").addClass("checkbox")
        .text("Old style playlist buttons");
    var oqbtn = $("<input/>").attr("type", "checkbox").appendTo(oqbtncontainer);
    oqbtn.prop("checked", USEROPTS.qbtn_idontlikechange);
    addOption("Playlist Buttons (Old)", oqbtncontainer);

    var synchcontainer = $("<label/>").addClass("checkbox")
        .text("Synchronize Media");
    var synch = $("<input/>").attr("type", "checkbox").appendTo(synchcontainer);
    synch.prop("checked", USEROPTS.synch);
    addOption("Synch", synchcontainer);

    var syncacc = $("<input/>").attr("type", "text")
        .attr("placeholder", "Seconds");
    syncacc.val(USEROPTS.sync_accuracy);
    addOption("Synch Accuracy", syncacc);

    var wmcontainer = $("<label/>").addClass("checkbox")
        .text("Allow transparency over video");
    var wmodetrans = $("<input/>").attr("type", "checkbox")
        .appendTo(wmcontainer);
    wmodetrans.prop("checked", USEROPTS.wmode_transparent);
    addOption("Transparent wmode", wmcontainer);

    var vidcontainer = $("<label/>").addClass("checkbox")
        .text("Hide Video");
    var hidevid = $("<input/>").attr("type", "checkbox").appendTo(vidcontainer);
    hidevid.prop("checked", USEROPTS.hidevid);
    addOption("Hide Video", vidcontainer);
    $("<hr>").appendTo(form);

    var tscontainer = $("<label/>").addClass("checkbox")
        .text("Show timestamps in chat");
    var showts = $("<input/>").attr("type", "checkbox").appendTo(tscontainer);
    showts.prop("checked", USEROPTS.show_timestamps);
    addOption("Show timestamps", tscontainer);

    var srcontainer = $("<label/>").addClass("checkbox")
        .text("Sort userlist by rank");
    var sr = $("<input/>").attr("type", "checkbox").appendTo(srcontainer);
    sr.prop("checked", USEROPTS.sort_rank);
    addOption("Userlist sort", srcontainer);

    var sacontainer = $("<label/>").addClass("checkbox")
        .text("AFKers at bottom of userlist");
    var sa = $("<input/>").attr("type", "checkbox").appendTo(sacontainer);
    sa.prop("checked", USEROPTS.sort_afk);
    addOption("Userlist sort", sacontainer);

    var blinkcontainer = $("<label/>").addClass("checkbox")
        .text("Flash title on every incoming message");
    var blink = $("<input/>").attr("type", "checkbox").appendTo(blinkcontainer);
    blink.prop("checked", USEROPTS.blink_title);
    addOption("Chat Notice", blinkcontainer);

    var boopcontainer = $("<label/>").addClass("checkbox")
        .text("Play a sound in addition to flashing the title");
    var boop = $("<input/>").attr("type", "checkbox").appendTo(boopcontainer);
    boop.prop("checked", USEROPTS.boop);
    addOption("Chat Sound", boopcontainer);

    var sendbtncontainer = $("<label/>").addClass("checkbox")
        .text("Add a send button to the chatbox");
    var sendbtn = $("<input/>").attr("type", "checkbox").appendTo(sendbtncontainer);
    sendbtn.prop("checked", USEROPTS.chatbtn);
    addOption("Send Button", sendbtncontainer);

    var altsocketcontainer = $("<label/>").addClass("checkbox")
        .text("Use alternative socket connection (requires refresh)");
    var altsocket = $("<input/>").attr("type", "checkbox")
        .appendTo(altsocketcontainer);
    altsocket.prop("checked", USEROPTS.altsocket);
    addOption("Alternate Socket", altsocketcontainer);

    if(CLIENT.rank >= Rank.Moderator) {
        $("<hr>").appendTo(form);
        var modhatcontainer = $("<label/>").addClass("checkbox")
            .text("Show name color");
        var modhat = $("<input/>").attr("type", "checkbox").appendTo(modhatcontainer);
        modhat.prop("checked", USEROPTS.modhat);
        addOption("Modflair", modhatcontainer);

        var joincontainer = $("<label/>").addClass("checkbox")
            .text("Show join messages");
        var join = $("<input/>").attr("type", "checkbox").appendTo(joincontainer);
        join.prop("checked", USEROPTS.joinmessage);
        addOption("Join Messages", joincontainer);
    }

    var footer = $("<div/>").addClass("modal-footer").appendTo(modal);
    var submit = $("<button/>").addClass("btn btn-primary pull-right")
        .text("Save")
        .appendTo(footer);

    submit.click(function() {
        USEROPTS.theme                = themeselect.val();
        USEROPTS.css                  = usercss.val();
        USEROPTS.layout               = layoutselect.val();
        USEROPTS.synch                = synch.prop("checked");
        USEROPTS.sync_accuracy        = parseFloat(syncacc.val()) || 2;
        USEROPTS.wmode_transparent    = wmodetrans.prop("checked");
        USEROPTS.hidevid              = hidevid.prop("checked");
        USEROPTS.show_timestamps      = showts.prop("checked");
        USEROPTS.blink_title          = blink.prop("checked");
        USEROPTS.chatbtn              = sendbtn.prop("checked");
        USEROPTS.altsocket            = altsocket.prop("checked");
        USEROPTS.qbtn_hide            = hqbtn.prop("checked");
        USEROPTS.qbtn_idontlikechange = oqbtn.prop("checked");
        USEROPTS.ignore_channelcss    = nocss.prop("checked");
        USEROPTS.ignore_channeljs     = nojs.prop("checked");
        USEROPTS.sort_rank            = sr.prop("checked");
        USEROPTS.sort_afk             = sa.prop("checked");
        USEROPTS.boop                 = boop.prop("checked");
        sortUserlist();
        if(CLIENT.rank >= Rank.Moderator) {
            USEROPTS.modhat = modhat.prop("checked");
            USEROPTS.joinmessage = join.prop("checked");
        }
        saveOpts();
        modal.modal("hide");
    });

    modal.on("hidden", function() {
        unhidePlayer();
        applyOpts();
        modal.remove();
    });
    modal.modal();
}

function saveOpts() {
    for(var key in USEROPTS) {
        setOpt(key, USEROPTS[key]);
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
            .attr("id", "usercss")
            .attr("href", USEROPTS.css)
            .appendTo($("head"));
    }

    switch(USEROPTS.layout) {
        case "synchtube":
            synchtubeLayout();
            break;
        case "fluid":
            fluidLayout();
            break;
        default:
            break;
    }

    if(USEROPTS.hidevid) {
        $("#qualitywrap").html("");
        $("#videowrap").remove();
        $("#chatwrap").removeClass("span5").addClass("span12");
        $("#chatline").removeClass().addClass("span12");
    }

    $("#chatbtn").remove();
    if(USEROPTS.chatbtn) {
        var btn = $("<button/>").addClass("btn btn-block")
            .text("Send")
            .attr("id", "chatbtn")
            .appendTo($("#chatwrap"));
        btn.click(function() {
            if($("#chatline").val().trim()) {
                socket.emit("chatMsg", {
                    msg: $("#chatline").val()
                });
                $("#chatline").val("");
            }
        });
    }
}

applyOpts();

function showLoginMenu() {
    hidePlayer();
    var modal = $("<div/>").addClass("modal hide fade")
        .appendTo($("body"));
    var head = $("<div/>").addClass("modal-header")
        .appendTo(modal);
    $("<button/>").addClass("close")
        .attr("data-dismiss", "modal")
        .attr("aria-hidden", "true")
        .appendTo(head)
        .html("&times;");
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
                // Since this is the login page, invalid session implies bad credentials
                if(data.error == "Invalid session") {
                    alert("Invalid username/password");
                }
                else {
                    alert(data.error);
                }
            }
            else if(data.success) {
                SESSION = data.session || "";
                CLIENT.name = data.uname || "";
                socket.emit("login", {
                    name: CLIENT.name,
                    session: SESSION
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
        unhidePlayer();
        modal.remove();
    });
    modal.modal();
}

function showPollMenu() {
    $("#pollwrap .poll-menu").remove();
    var menu = $("<div/>").addClass("well poll-menu")
        .insertAfter($("#newpollbtn"));

    $("<button/>").addClass("btn btn-danger pull-right")
        .text("Cancel")
        .appendTo(menu)
        .click(function() {
            menu.remove();
        });

    $("<strong/>").text("Title").appendTo(menu);
    $("<br/>").appendTo(menu);

    var title = $("<input/>").attr("type", "text")
        .appendTo(menu);
    $("<br/>").appendTo(menu);

    $("<strong/>").text("Options").appendTo(menu);
    $("<br/>").appendTo(menu);

    var addbtn = $("<button/>").addClass("btn")
        .text("Add Option")
        .appendTo(menu);
    $("<br/>").appendTo(menu);

    function addOption() {
        $("<input/>").attr("type", "text")
            .addClass("poll-menu-option")
            .insertBefore(addbtn);
        $("<br/>").insertBefore(addbtn);
    }

    addbtn.click(addOption);
    addOption();
    addOption();

    $("<br/>").appendTo(menu);
    $("<button/>").addClass("btn")
        .text("Open Poll")
        .addClass("btn-block")
        .appendTo(menu)
        .click(function() {
            var opts = []
            menu.find(".poll-menu-option").each(function() {
                if($(this).val() != "")
                    opts.push($(this).val());
            });
            socket.emit("newPoll", {
                title: title.val(),
                opts: opts
            });
            menu.remove();
        });
}

function scrollChat() {
    $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
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

function handleModPermissions() {
    /* update channel controls */
    $("#opt_pagetitle").val(CHANNEL.opts.pagetitle);
    $("#opt_pagetitle").attr("disabled", CLIENT.rank < 3);
    $("#opt_externalcss").val(CHANNEL.opts.externalcss);
    $("#opt_externalcss").attr("disabled", CLIENT.rank < 3);
    $("#opt_externaljs").val(CHANNEL.opts.externaljs);
    $("#opt_externaljs").attr("disabled", CLIENT.rank < 3);
    $("#opt_chat_antiflood").prop("checked", CHANNEL.opts.chat_antiflood);
    $("#opt_show_public").prop("checked", CHANNEL.opts.show_public);
    $("#opt_show_public").attr("disabled", CLIENT.rank < 3);
    $("#opt_enable_link_regex").prop("checked", CHANNEL.opts.enable_link_regex);
    $("#opt_afktimeout").val(CHANNEL.opts.afk_timeout);
    $("#opt_allow_voteskip").prop("checked", CHANNEL.opts.allow_voteskip);
    $("#opt_voteskip_ratio").val(CHANNEL.opts.voteskip_ratio);
    (function() {
        if(typeof CHANNEL.opts.maxlength != "number") {
            $("#opt_maxlength").val("");
            return;
        }
        var h = parseInt(CHANNEL.opts.maxlength / 3600);
        h = ""+h;
        if(h.length < 2) h = "0" + h;
        var m = parseInt((CHANNEL.opts.maxlength % 3600) / 60);
        m = ""+m;
        if(m.length < 2) m = "0" + m;
        var s = parseInt(CHANNEL.opts.maxlength % 60);
        s = ""+s;
        if(s.length < 2) s = "0" + s;
        $("#opt_maxlength").val(h + ":" + m + ":" + s);
    })();
    $("#csstext").val(CHANNEL.css);
    $("#jstext").val(CHANNEL.js);
    $("#motdtext").val(CHANNEL.motd_text);
    setVisible("#permedit_tab", CLIENT.rank >= 3);
    setVisible("#banlist_tab", hasPermission("ban"));
    setVisible("#motdedit_tab", hasPermission("motdedit"));
    setVisible("#cssedit_tab", CLIENT.rank >= 3);
    setVisible("#jsedit_tab", CLIENT.rank >= 3);
    setVisible("#filteredit_tab", hasPermission("filteredit"));
    setVisible("#channelranks_tab", CLIENT.rank >= 3);
    setVisible("#chanlog_tab", CLIENT.rank >= 3);
    setVisible("#chanopts_unregister_wrap", CLIENT.rank >= 10);
}

function handlePermissionChange() {
    if(CLIENT.rank >= 2) {
        $("#channelsettingswrap3").show();
        if($("#channelsettingswrap").html().trim() == "") {
            $("#channelsettingswrap").load("channeloptions.html", handleModPermissions);
        }
        else {
            handleModPermissions();
        }
    }
    else {
        $("#channelsettingswrap").html("");
        $("#channelsettingswrap3").hide();
    }

    setVisible("#userpltogglewrap", CLIENT.rank >= 1);

    setVisible("#playlisttogglewrap", hasPermission("playlistadd"));
    $("#queue_next").attr("disabled", !hasPermission("playlistnext"));
    $("#qlockbtn").attr("disabled", CLIENT.rank < 2);

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
                .addClass("span12")
                .attr("id", "plonotification")
                .insertBefore($("#queue"));

            al.find(".close").remove();

            $("<button/>").addClass("btn btn-primary")
                .text("Dismiss")
                .appendTo(al)
                .click(function() {
                    USEROPTS.first_visit = false;
                    saveOpts();
                    al.hide("blind", function() {
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
    setVisible("#customembed_btn", hasPermission("playlistaddcustom"));
    if(!hasPermission("playlistaddcustom")) {
        $("#customembed_entry").hide();
        $("#customembed_code").val("");
    }


    setVisible("#newpollbtn", hasPermission("pollctl"));

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
        addUserDropdown($(users[i]), $(users[i]).data("dropdown-info"));
    }

    $("#chatline").attr("disabled", !hasPermission("chat"));
    rebuildPlaylist();
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

function addLibraryButtons(li, id, type) {
    var btns = $("<div/>").addClass("btn-group")
        .addClass("pull-left")
        .prependTo(li);

    if(hasPermission("playlistadd")) {
        if(hasPermission("playlistnext")) {
            $("<button/>").addClass("btn btn-mini")
                .text("Next")
                .click(function() {
                    socket.emit("queue", {
                        id: id,
                        pos: "next",
                        type: type
                    });
                })
                .appendTo(btns);
        }
        $("<button/>").addClass("btn btn-mini")
            .text("End")
            .click(function() {
                socket.emit("queue", {
                    id: id,
                    pos: "end",
                    type: type
                });
            })
            .appendTo(btns);
    }
    if(CLIENT.rank >= 2) {
        $("<button/>").addClass("btn btn-mini btn-danger")
            .html("<i class='icon-trash'></i>")
            .click(function() {
                socket.emit("uncache", {
                    id: id
                });
                li.hide("blind", function() {
                    li.remove();
                });
            })
            .appendTo(btns);
    }
}

/* queue stuff */

var PL_QUEUED_ACTIONS = [];
var PL_ACTION_INTERVAL = false;

function queueAction(data) {
    PL_QUEUED_ACTIONS.push(data);
    if(PL_ACTION_INTERVAL)
        return;
    PL_ACTION_INTERVAL = setInterval(function () {
        var data = PL_QUEUED_ACTIONS.shift();
        if(!("expire" in data))
            data.expire = Date.now() + 5000;
        if(!data.fn()) {
            if(data.can_wait && Date.now() < data.expire)
                PL_QUEUED_ACTIONS.push(data);
            else if(Date.now() < data.expire)
                PL_QUEUED_ACTIONS.unshift(data);
        }
        if(PL_QUEUED_ACTIONS.length == 0) {
            clearInterval(PL_ACTION_INTERVAL);
            PL_ACTION_INTERVAL = false;
        }
    }, 100);
}

// Because jQuery UI does weird things
function playlistFind(uid) {
    var children = document.getElementById("queue").children;
    for(var i in children) {
        if(typeof children[i].getAttribute != "function")
            continue;
        if(children[i].getAttribute("class").indexOf("pluid-" + uid) != -1)
            return children[i];
    }
    return false;
}

function playlistMove(from, after) {
    var lifrom = $(".pluid-" + from);
    if(lifrom.length == 0)
        return false;

    var q = $("#queue");

    if(after === "prepend") {
        lifrom.hide("blind", function() {
            lifrom.detach();
            lifrom.prependTo(q);
            lifrom.show("blind");
        });
    }
    else if(after === "append") {
        lifrom.hide("blind", function() {
            lifrom.detach();
            lifrom.appendTo(q);
            lifrom.show("blind");
        });
    }
    else {
        var liafter = $(".pluid-" + after);
        if(liafter.length == 0)
            return false;
        lifrom.hide("blind", function() {
            lifrom.detach();
            lifrom.insertAfter(liafter);
            lifrom.show("blind");
        });
    }
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

    if(url.indexOf("jw:") == 0) {
        return {
            id: url.substring(3),
            type: "jw"
        };
    }

    if(url.indexOf("rtmp://") == 0) {
        return {
            id: url,
            type: "rt"
        };
    }

    var m;
    if((m = url.match(/youtube\.com\/watch\?v=([^&#]+)/))) {
        return {
            id: m[1],
            type: "yt"
        };
    }

    if((m = url.match(/youtu\.be\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "yt"
        };
    }

    if((m = url.match(/youtube\.com\/playlist\?list=([^&#]+)/))) {
        return {
            id: m[1],
            type: "yp"
        };
    }

    if((m = url.match(/twitch\.tv\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "tw"
        };
    }

    if((m = url.match(/justin\.tv\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "jt"
        };
    }

    if((m = url.match(/livestream\.com\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "li"
        };
    }

    if((m = url.match(/ustream\.tv\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "us"
        };
    }

    if((m = url.match(/vimeo\.com\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "vi"
        };
    }

    if((m = url.match(/dailymotion\.com\/video\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "dm"
        };
    }

    if((m = url.match(/imgur\.com\/a\/([^&#]+)/))) {
        return {
            id: m[1],
            type: "im"
        };
    }

    if((m = url.match(/soundcloud\.com\/([^&#]+)/))) {
        return {
            id: url,
            type: "sc"
        };
    }

    return {
        id: null,
        type: null
    };
}

function sendVideoUpdate() {
    PLAYER.getTime(function (seconds) {
        socket.emit("mediaUpdate", {
            id: PLAYER.videoId,
            currentTime: seconds,
            paused: PLAYER.paused,
            type: PLAYER.type
        });
    });
}

/* chat */

function formatChatMessage(data) {
    var skip = data.username == LASTCHATNAME;
    if(data.msgclass == "drink" || data.msgclass == "shout") {
        skip = false;
    }
    if(data.superadminflair)
        skip = false;
    if(data.msgclass == "server-whisper")
        skip = true;
    // Prevent impersonation by abuse of the bold filter
    if(data.msg.match(/^\s*<strong>\w+\s*:\s*<\/strong>\s*/))
        skip = false;
    LASTCHATNAME = data.username;
    LASTCHATTIME = data.time;
    var div = $("<div/>");
    if(USEROPTS.show_timestamps) {
        var time = $("<span/>").addClass("timestamp").appendTo(div);
        var timestamp = new Date(data.time).toTimeString().split(" ")[0];
        time.text("["+timestamp+"] ");
        if(data.msgclass == "shout" || data.msgclass == "server-whisper")
            time.addClass(data.msgclass);
    }
    var name = $("<span/>");
    if(!skip) {
        name.appendTo(div);
    }
    $("<strong/>").addClass("username").text(data.username + ": ").appendTo(name);
    var message = $("<span/>").appendTo(div);
    message[0].innerHTML = data.msg;
    if(data.modflair) {
        name.addClass(getNameColor(data.modflair));
    }
    if(data.superadminflair) {
        name.addClass("label")
            .addClass(data.superadminflair.labelclass);
        $("<i/>").addClass(data.superadminflair.icon)
            .addClass("icon-white")
            .prependTo(name);
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

function addChatMessage(data) {
    if(IGNORED.indexOf(data.username) != -1) {
        return;
    }
    var div = formatChatMessage(data);
    div.data("sender", data.username);
    div.appendTo($("#messagebuffer"));
    div.mouseover(function() {
        $("#messagebuffer").children().each(function() {
            var name = $(this).data("sender");
            if(name == data.username) {
                $(this).addClass("nick-hover");
            }
        });
    });
    div.mouseleave(function() {
        $("#messagebuffer").children().each(function() {
            $(this).removeClass("nick-hover");
        });
    });
    // Cap chatbox at most recent 100 messages
    if($("#messagebuffer").children().length > 100) {
        $($("#messagebuffer").children()[0]).remove();
    }
    if(SCROLLCHAT)
        scrollChat();
    if(USEROPTS.blink_title && !FOCUSED && !TITLE_BLINK) {
        USEROPTS.boop && CHATSOUND.play();
        TITLE_BLINK = setInterval(function() {
            if(document.title == "*Chat*")
                document.title = PAGETITLE;
            else
                document.title = "*Chat*";
        }, 1000);
    }
    if(CLIENT.name && data.username != CLIENT.name) {
        if(data.msg.toUpperCase().indexOf(CLIENT.name.toUpperCase()) != -1) {
            div.addClass("nick-highlight");
            if(!FOCUSED && !TITLE_BLINK) {
                USEROPTS.boop && CHATSOUND.play();
                TITLE_BLINK = setInterval(function() {
                    if(document.title == "*Chat*")
                        document.title = PAGETITLE;
                    else
                        document.title = "*Chat*";
                }, 1000);
            }
        }
    }
}

/* layouts */

function fluidLayout() {
    $(".row").each(function() {
        $(this).removeClass("row").addClass("row-fluid");
    });
    $(".container").each(function() {
        $(this).removeClass("container").addClass("container-fluid");
    });
    // Video might not be there, but the playlist is
    VWIDTH = $("#videowidth").css("width").replace("px", "");
    VHEIGHT = ""+parseInt(parseInt(VWIDTH) * 9 / 16);
    if($("#ytapiplayer").length > 0) {
        $("#ytapiplayer").attr("width", VWIDTH);
        $("#ytapiplayer").attr("height", VHEIGHT);
    }
    $("#messagebuffer").css("height", (VHEIGHT - 31) + "px");
    $("#userlist").css("height", (VHEIGHT - 31) + "px");
    $("#chatline").removeClass().addClass("span12");
    $("#channelsettingswrap3").css("margin-left", "0");
}

function synchtubeLayout() {
    $("#videowrap").detach().insertBefore($("#chatwrap"));
    $("#rightpane-outer").detach().insertBefore($("#leftpane-outer"));
    $("#userlist").css("float", "right");
}

function chatOnly() {
    fluidLayout();
    $("#toprow").remove()
    $("#announcements").remove();
    $("#playlistrow").remove();
    $("#videowrap").remove();
    $("#chatwrap").removeClass("span5").addClass("span12");
}

/* channel administration stuff */

function genPermissionsEditor() {
    $("#permedit").html("");
    var form = $("<form/>").addClass("form-horizontal")
        .attr("action", "javascript:void(0)")
        .appendTo($("#permedit"));
    var fs = $("<fieldset/>").appendTo(form);

    function makeOption(text, key, permset, defval) {
        var group = $("<div/>").addClass("control-group")
            .appendTo(fs);
        $("<label/>").addClass("control-label")
            .text(text)
            .appendTo(group);
        var controls = $("<div/>").addClass("controls")
            .appendTo(group);
        var select = $("<select/>").appendTo(controls);
        select.data("key", key);
        for(var i = 0; i < permset.length; i++) {
            $("<option/>").attr("value", permset[i][1])
                .text(permset[i][0])
                .attr("selected", defval == permset[i][1])
                .appendTo(select);
        }
    }

    function addDivider(text) {
        $("<hr/>").appendTo(fs);
        $("<h3/>").text(text).appendTo(fs);
    }

    var standard = [
        ["Anonymous"    , "-1"],
        ["Guest"        , "0"],
        ["Registered"   , "1"],
        ["Leader"       , "1.5"],
        ["Moderator"    , "2"],
        ["Channel Admin", "3"]
    ];

    var noanon = [
        ["Guest"        , "0"],
        ["Registered"   , "1"],
        ["Leader"       , "1.5"],
        ["Moderator"    , "2"],
        ["Channel Admin", "3"]
    ];

    var modleader = [
        ["Leader"       , "1.5"],
        ["Moderator"    , "2"],
        ["Channel Admin", "3"]
    ];

    var modplus = [
        ["Moderator"    , "2"],
        ["Channel Admin", "3"]
    ];

    $("<h3/>").text("Open playlist permissions").appendTo(fs);
    makeOption("Add to playlist", "oplaylistadd", standard, CHANNEL.perms.oplaylistadd+"");
    makeOption("Add/move to next", "oplaylistnext", standard, CHANNEL.perms.oplaylistnext+"");
    makeOption("Move playlist items", "oplaylistmove", standard, CHANNEL.perms.oplaylistmove+"");
    makeOption("Delete playlist items", "oplaylistdelete", standard, CHANNEL.perms.oplaylistdelete+"");
    makeOption("Jump to video", "oplaylistjump", standard, CHANNEL.perms.oplaylistjump+"");
    makeOption("Queue playlist", "oplaylistaddlist", standard, CHANNEL.perms.oplaylistaddlist+"");

    addDivider("General playlist permissions");
    makeOption("Add to playlist", "playlistadd", standard, CHANNEL.perms.playlistadd+"");
    makeOption("Add/move to next", "playlistnext", standard, CHANNEL.perms.playlistnext+"");
    makeOption("Move playlist items", "playlistmove", standard, CHANNEL.perms.playlistmove+"");
    makeOption("Delete playlist items", "playlistdelete", standard, CHANNEL.perms.playlistdelete+"");
    makeOption("Jump to video", "playlistjump", standard, CHANNEL.perms.playlistjump+"");
    makeOption("Queue playlist", "playlistaddlist", standard, CHANNEL.perms.playlistaddlist+"");
    makeOption("Queue livestream", "playlistaddlive", standard, CHANNEL.perms.playlistaddlive+"");
    makeOption("Embed custom media", "playlistaddcustom", standard, CHANNEL.perms.playlistaddcustom + "");
    makeOption("Exceed maximum media length", "exceedmaxlength", standard, CHANNEL.perms.exceedmaxlength+"");
    makeOption("Add nontemporary media", "addnontemp", standard, CHANNEL.perms.addnontemp+"");
    makeOption("Temp/untemp playlist item", "settemp", standard, CHANNEL.perms.settemp+"");
    makeOption("Shuffle playlist", "playlistshuffle", standard, CHANNEL.perms.playlistshuffle+"");
    makeOption("Clear playlist", "playlistclear", standard, CHANNEL.perms.playlistclear+"");

    addDivider("Polls");
    makeOption("Open/Close poll", "pollctl", modleader, CHANNEL.perms.pollctl+"");
    makeOption("Vote", "pollvote", standard, CHANNEL.perms.pollvote+"");

    addDivider("Moderation");
    makeOption("Mute users", "mute", modleader, CHANNEL.perms.mute+"");
    makeOption("Kick users", "kick", modleader, CHANNEL.perms.kick+"");
    makeOption("Ban users", "ban", modplus, CHANNEL.perms.ban+"");
    makeOption("Edit MOTD", "motdedit", modplus, CHANNEL.perms.motdedit+"");
    makeOption("Edit chat filters", "filteredit", modplus, CHANNEL.perms.filteredit+"");

    addDivider("Misc");
    makeOption("Drink calls", "drink", modleader, CHANNEL.perms.drink+"");
    makeOption("Chat", "chat", noanon, CHANNEL.perms.chat+"");

    var submit = $("<button/>").addClass("btn btn-primary").appendTo(fs);
    submit.text("Save");
    submit.click(function() {
        var perms = {};
        fs.find("select").each(function() {
            perms[$(this).data("key")] = parseFloat($(this).val());
        });
        socket.emit("setPermissions", perms);
    });
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

function hidePlayer() {
    if(!PLAYER)
        return;

    if(!/(chrome|MSIE)/ig.test(navigator.userAgent))
        return;

    PLAYER.size = {
        width: $("#ytapiplayer").attr("width"),
        height: $("#ytapiplayer").attr("height")
    };
    $("#ytapiplayer").attr("width", 1)
        .attr("height", 1);
}

function unhidePlayer() {
    if(!PLAYER)
        return;

    if(!/(chrome|MSIE)/ig.test(navigator.userAgent))
        return;

    $("#ytapiplayer").attr("width", PLAYER.size.width)
        .attr("height", PLAYER.size.height);
}
