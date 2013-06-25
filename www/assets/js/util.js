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

function formatUserlistItem(div, data) {
    var name = $(div.children()[1]);
    name.removeClass();
    name.css("font-style", "");
    name.addClass(getNameColor(data.rank));
    div.find(".profile-box").remove();

    var profile;
    name.mouseenter(function(ev) {
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

function addUserDropdown(entry, name) {
    entry.find(".user-dropdown").remove();
    var menu = $("<div/>").addClass("user-dropdown")
        .appendTo(entry);
    menu.hide();

    $("<strong/>").text(name).appendTo(menu);
    $("<br/>").appendTo(menu);
    var ignore = $("<button/>").addClass("btn btn-mini btn-block")
        .appendTo(menu);
    ignore.click(function() {
        if(IGNORED.indexOf(name) == -1) {
            ignore.text("Unignore User");
            IGNORED.push(name);
        }
        else {
            ignore.text("Ignore User");
            IGNORED.splice(IGNORED.indexOf(name), 1);
        }
    });
    if(IGNORED.indexOf(name) == -1) {
        ignore.text("Ignore User");
    }
    else {
        ignore.text("Unignore User");
    }
    if(hasPermission("kick")) {
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("Kick")
            .click(function() {
                socket.emit("chatMsg", {
                    msg: "/kick " + name
                });
            })
            .appendTo(menu);
    }
    if(CLIENT.rank >= 2) {
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("Give Leader")
            .click(function() {
                socket.emit("assignLeader", {
                    name: name
                });
            })
            .appendTo(menu);
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("Take Leader")
            .click(function() {
                socket.emit("assignLeader", {
                    name: ""
                });
            })
            .appendTo(menu);
    }
    if(hasPermission("ban")) {
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("Name Ban")
            .click(function() {
                socket.emit("chatMsg", {
                    msg: "/ban " + name
                });
            })
            .appendTo(menu);
        $("<button/>").addClass("btn btn-mini btn-block")
            .text("IP Ban")
            .click(function() {
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
        }
        else {
            menu.hide();
        }
        return false;
    });
}

/* queue stuff */

function makeQueueEntry(video, addbtns) {
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
    if(video.temp) {
        li.addClass("queue_temp");
    }

    if(addbtns)
        addQueueButtons(li);
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
                var i = $("#queue").children().index(li);
                socket.emit("jumpTo", i);
            })
            .appendTo(menu);
    }
    // Queue next
    if(hasPermission("playlistnext")) {
        $("<button/>").addClass("btn btn-mini qbtn-next")
            .html("<i class='icon-share-alt'></i>Queue Next")
            .click(function() {
                var i = $("#queue").children().index(li);
                socket.emit("moveMedia", {
                    from: i,
                    to: i < POSITION ? POSITION : POSITION + 1,
                    moveby: null
                });
            })
            .appendTo(menu);
    }
    // Temp/Untemp
    if(hasPermission("settemp")) {
        $("<button/>").addClass("btn btn-mini qbtn-tmp")
            .html("<i class='icon-flag'></i>Make Temporary")
            .click(function() {
                var i = $("#queue").children().index(li);
                var temp = li.find(".qbtn-tmp").data("temp");
                socket.emit("setTemp", {
                    position: i,
                    temp: !temp
                });
            })
            .appendTo(menu);
    }
    // Delete
    if(hasPermission("playlistdelete")) {
        $("<button/>").addClass("btn btn-mini qbtn-delete")
            .html("<i class='icon-trash'></i>Delete")
            .click(function() {
                var i = $("#queue").children().index(li);
                socket.emit("delete", i);
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
    if(REBUILDING)
        return;

    var qli = $("#queue li");
    if(qli.length == 0)
        return;
    REBUILDING = true;
    var i = 0;
    qli.each(function() {
        var li = $(this);
        setTimeout(function() {
            addQueueButtons(li);
            if(i == qli.length - 1) {
                REBUILDING = false;
            }
        }, 10*i);
        i++;
    });
}

/* menus */
function showOptionsMenu() {
    if(PLAYER)
        PLAYER.hide();
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

    var blinkcontainer = $("<label/>").addClass("checkbox")
        .text("Flash title on every incoming message");
    var blink = $("<input/>").attr("type", "checkbox").appendTo(blinkcontainer);
    blink.prop("checked", USEROPTS.blink_title);
    addOption("Chat Notice", blinkcontainer);

    var sendbtncontainer = $("<label/>").addClass("checkbox")
        .text("Add a send button to the chatbox");
    var sendbtn = $("<input/>").attr("type", "checkbox").appendTo(sendbtncontainer);
    sendbtn.prop("checked", USEROPTS.chatbtn);
    addOption("Send Button", sendbtncontainer);

    var altsocketcontainer = $("<label/>").addClass("checkbox")
        .text("Use alternative socket connection");
    var altsocket = $("<input/>").attr("type", "checkbox")
        .appendTo(altsocketcontainer);
    altsocket.prop("checked", USEROPTS.altsocket);
    addOption("Alternate Socket", altsocketcontainer);

    var profile = $("<a/>").attr("target", "_blank")
        .addClass("btn")
        .attr("href", "./account.html")
        .text("Profile has moved to the account page");
    addOption("Profile", profile);

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
        USEROPTS.hidevid              = hidevid.prop("checked");
        USEROPTS.show_timestamps      = showts.prop("checked");
        USEROPTS.blink_title          = blink.prop("checked");
        USEROPTS.chatbtn              = sendbtn.prop("checked");
        USEROPTS.altsocket            = altsocket.prop("checked");
        USEROPTS.qbtn_hide            = hqbtn.prop("checked");
        USEROPTS.qbtn_idontlikechange = oqbtn.prop("checked");
        if(CLIENT.rank >= Rank.Moderator) {
            USEROPTS.modhat = modhat.prop("checked");
            USEROPTS.joinmessage = join.prop("checked");
        }
        saveOpts();
        modal.modal("hide");
    });

    modal.on("hidden", function() {
        if(PLAYER)
            PLAYER.unhide();
        applyOpts();
        modal.remove();
    });
    modal.modal();
}

function saveOpts() {
    for(var key in USEROPTS) {
        localStorage.setItem(key, USEROPTS[key]);
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
        $("#videowrap").remove();
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

    if(USEROPTS.altsocket) {
        if(!socket.nws) {
            if(socket && socket.disconnect)
                socket.disconnect();
            socket = new NotWebsocket();
            setupCallbacks();
        }
    }
    // Switch from NotWebsocket => Socket.io
    else if(socket && typeof socket.poll !== "undefined") {
        try {
            socket = io.connect(IO_URL);
            setupCallbacks();
        }
        catch(e) {
        }
    }
}

applyOpts();

function showLoginMenu() {
    if(PLAYER)
        PLAYER.hide();
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
        if(PLAYER)
            PLAYER.unhide();
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
    $("#opt_allow_voteskip").prop("checked", CHANNEL.opts.allow_voteskip);
    $("#opt_voteskip_ratio").val(CHANNEL.opts.voteskip_ratio);
    $("#csstext").val(CHANNEL.css);
    $("#jstext").val(CHANNEL.js);
    $("#motdtext").val(CHANNEL.motd);
    setVisible("#permedit_tab", CLIENT.rank >= 3);
    setVisible("#banlist_tab", hasPermission("ban"));
    setVisible("#motdedit_tab", hasPermission("motdedit"));
    setVisible("#cssedit_tab", CLIENT.rank >= 3);
    setVisible("#jsedit_tab", CLIENT.rank >= 3);
    setVisible("#filteredit_tab", hasPermission("filteredit"));
    setVisible("#channelranks_tab", CLIENT.rank >= 3);
    setVisible("#chanopts_unregister_wrap", CLIENT.rank >= 10);
}

function handlePermissionChange() {
    if(CLIENT.rank >= 2) {
        $("#channelsettingswrap3").show();
        if($("#channelsettingswrap").html() == "") {
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
    setVisible("#qlockbtn", CLIENT.rank >= 2);

    if(hasPermission("playlistadd") ||
        hasPermission("playlistmove") ||
        hasPermission("playlistjump") ||
        hasPermission("playlistdelete") ||
        hasPermission("settemp")) {
        if(USEROPTS.first_visit) {
            var al = makeAlert("Playlist Options", [
                "From the Options menu, you can choose to automatically",
                " hide the buttons on each entry (and show them when",
                " you right click).  You can also choose to use the old",
                " style of playlist buttons.",
                "<br>"].join(""))
                .addClass("span12")
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
        addUserDropdown($(users[i]), users[i].children[1].innerHTML);
    }

    $("#chatline").attr("disabled", !hasPermission("chat"));
    rebuildPlaylist();
}

/* search stuff */

function clearSearchResults() {
    $("#library").html("");
    $("#search_clear").remove();
    $("#search_pagination").remove();
}

function loadSearchPage(page) {
    $("#library").html("");
    var results = $("#library").data("entries");
    var start = page * 100;
    for(var i = start; i < start + 100 && i < results.length; i++) {
        var li = makeQueueEntry(results[i], false);
        if(hasPermission("playlistadd")) {
            if(results[i].thumb) {
                addLibraryButtons(li, results[i].id, "yt");
            }
            else {
                addLibraryButtons(li, results[i].id);
            }
        }
        $(li).appendTo($("#library"));
    }
    if($("#search_pagination").length > 0) {
        $("#search_pagination").find("li").each(function() {
            $(this).removeClass("active");
        });
        $($("#search_pagination").find("li")[page]).addClass("active");
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

function playlistMove(from, to) {
    if(from < 0 || to < 0)
        return false;
    var q = $("#queue");
    if(from >= q.children().length)
        return false;

    var old = $(q.children()[from]);
    old.hide("blind", function() {
        old.detach();
        if(to >= q.children().length)
            old.appendTo(q);
        else
            old.insertBefore(q.children()[to]);
        old.show("blind");
    });
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
    PLAYER.getTime(function(seconds) {
        socket.emit("mediaUpdate", {
            id: PLAYER.id,
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
    if(data.msgclass == "server-whisper") {
        skip = true;
    }
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
    VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");
    VHEIGHT = ""+parseInt(parseInt(VWIDTH) * 9 / 16);
    $("#messagebuffer").css("height", (VHEIGHT - 31) + "px");
    $("#userlist").css("height", (VHEIGHT - 31) + "px");
    $("#ytapiplayer").attr("width", VWIDTH);
    $("#ytapiplayer").attr("height", VHEIGHT);
    $("#chatline").removeClass().addClass("span12");
    $("#channelsettingswrap3").css("margin-left", "0");
}

function synchtubeLayout() {
    $("#videowrap").detach().insertBefore($("#chatwrap"));
    $("#rightpane-outer").detach().insertBefore($("#leftpane-outer"));
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

function loadChannelRanksPage(page) {
    var entries = $("#channelranks").data("entries");
    $("#channelranks").data("page", page);
    var start = page * 20;
    var tbl = $("#channelranks table");
    if(tbl.children().length > 1) {
        $(tbl.children()[1]).remove();
    }
    for(var i = start; i < start + 20 && i < entries.length; i++) {
        var tr = $("<tr/>").appendTo(tbl);
        var name = $("<td/>").text(entries[i].name).appendTo(tr);
        name.addClass(getNameColor(entries[i].rank));
        var rank = $("<td/>").text(entries[i].rank)
            .css("min-width", "220px")
            .appendTo(tr);
        (function(name) {
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
                    user: name,
                    rank: parseInt(r)
                });
            }
            edit.blur(save.bind(edit));
            edit.keydown(function(ev) {
                if(ev.keyCode == 13)
                    save.bind(edit)();
            });
        }.bind(rank));
        })(entries[i].name);
    }
    if($("#channelranks_pagination").length > 0) {
        $("#channelranks_pagination").find("li").each(function() {
            $(this).removeClass("active");
        });
        $($("#channelranks_pagination").find("li")[page]).addClass("active");
    }
}
