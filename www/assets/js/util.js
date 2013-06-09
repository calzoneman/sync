function makeAlert(title, text, klass) {
    if(!klass) {
        klass = "alert-info";
    }

    var al = $("<div/>").addClass("alert")
        .addClass(klass)
        .text(text);
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

function formatUserlistItem(div, data) {
    var name = $(div.children[1]);
    name.removeClass();
    name.css("font-style", "");
    name.addClass(getNameColor(data.rank));
    div.find(".profile-box").remove();

    // TODO might remove this
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

    var flair = div.children[0];
    flair.innerHTML = "";
    // denote current leader with a star
    if(data.leader) {
        $("<i/>").addClass("icon-star-empty").appendTo(flair);
    }
    if(data.meta && data.meta.afk) {
        name.css("font-style", "italic");
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

function addUserDropdown(entry, name) {
    // TODO change this
    entry.find(".dropdown").remove();
    entry.unbind();
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

    if(hasPermission("kick")) {
        var kick = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(kick);
        a.text("Kick");
        a.click(function() {
            socket.emit("chatMsg", {
                msg: "/kick " + name
            });
        });
    }

    if(CLIENT.rank >= Rank.Moderator) {
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

        var ban = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(ban);
        a.text("IP Ban");
        a.click(function() {
            socket.emit("chatMsg", {
                msg: "/ban " + name
            });
        });

        var nameban = $("<li />").appendTo(ul);
        var a = $("<a />").attr("tabindex", "-1").attr("href", "javascript:void(0);").appendTo(nameban);
        a.text("Name Ban");
        a.click(function() {
            socket.emit("banName", {
                name: name
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

    entry.click(function() {
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

/* queue stuff */

function makeQueueEntry(video) {
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
        .attr("href", "#")//formatURL(video))
        .attr("target", "_blank");
    var time = $("<span/>").addClass("qe_time").appendTo(li);
    time.text(video.duration);
    var clear = $("<div/>").addClass("qe_clear").appendTo(li);
    if(video.temp) {
        li.addClass("queue_temp");
    }

    // TODO Permissions
    var menu = $("<div/>").addClass("btn-group").appendTo(li);
    // Play
    $("<button/>").addClass("btn btn-mini qbtn-play")
        .html("<i class='icon-play'></i>Play")
        .click(function() {
            var i = $("#queue").children().index(li);
            socket.emit("jumpTo", i);
        })
        .appendTo(menu);
    // Queue next
    $("<button/>").addClass("btn btn-mini qbtn-next")
        .html("<i class='icon-share-alt'></i>Queue Next")
        .click(function() {
            var i = $("#queue").children().index(li);
            socket.emit("moveMedia", {
                src: i,
                dest: i < POSITION ? POSITION : POSITION + 1
            });
        })
        .appendTo(menu);
    // Temp/Untemp
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
    // Delete
    $("<button/>").addClass("btn btn-mini qbtn-delete")
        .html("<i class='icon-trash'></i>Delete")
        .click(function() {
            var i = $("#queue").children().index(li);
            socket.emit("delete", i);
        })
        .appendTo(menu);

    menu.hide();

    li.contextmenu(function(ev) {
        ev.preventDefault();
        if(menu.css("display") == "none")
            menu.show("blind");
        else
            menu.hide("blind");
        return false;
    });

    menu.blur(function() {
        menu.hide();
    });
    return li;
}

function addQueueButtons(li) {

}

function rebuildPlaylist() {
    $("#queue li").each(function() {
        $(this).find(".btn-group").remove();
        addQueueButtons(this);
    });
}

/* menus */
function showOptionsMenu() {
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
    $("<option/>").attr("value", "fluid").text("Fluid")
        .appendTo(layoutselect);
    layoutselect.val(USEROPTS.layout);
    addOption("Layout", layoutselect);
    var warn = $("<p/>").addClass("text-error")
        .text("Changing layouts may require a refresh")
    addOption("", warn);
    $("<hr>").appendTo(form);

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
        USEROPTS.theme           = themeselect.val();
        USEROPTS.css             = usercss.val();
        USEROPTS.layout          = layoutselect.val();
        USEROPTS.synch           = synch.prop("checked");
        USEROPTS.sync_accuracy   = parseFloat(syncacc.val()) || 2;
        USEROPTS.hidevid         = hidevid.prop("checked");
        USEROPTS.show_timestamps = showts.prop("checked");
        USEROPTS.blink_title     = blink.prop("checked");
        USEROPTS.chatbtn         = sendbtn.prop("checked");
        USEROPTS.altsocket       = altsocket.prop("checked");
        if(RANK >= Rank.Moderator) {
            USEROPTS.modhat = modhat.prop("checked");
        }
        saveOpts();
        modal.modal("hide");
    });

    modal.on("hidden", function() {
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
        if(socket)
            socket.disconnect();
        socket = new NotWebsocket();
        setupCallbacks();
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

function showLoginMenu() {
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
        });
}

function scrollChat() {
    // TODO add check
    $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollheight"));
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

function handlePermissionChange() {
    function setVisible(selector, bool) {
        var disp = bool ? "" : "none";
        $(selector).css("display", disp);
    }

    if(CLIENT.rank < 2) {
        $(".modonly").hide();
    }

    setVisible("#userpltoggle", CLIENT.rank >= 1);

    setVisible("#playlisttoggle", hasPermission("playlistadd"));
    $("#queue_next").attr("disabled", !hasPermission("playlistnext"));
    setVisible("#qlockbtn", CLIENT.rank >= 2);

    setVisible("#getplaylist", hasPermission("playlistgeturl"));
    setVisible("#clearplaylist", hasPermission("playlistclear"));
    setVisible("#shuffleplaylist", hasPermission("playlistshuffle"));

    setVisible("#modnav", CLIENT.rank >= 2);
    setVisible("#chanperms_tab", CLIENT.rank >= 3);
    setVisible("#banlist_tab", hasPermission("ban"));
    setVisible("#motdeditor_tab", hasPermission("motdedit"));
    setVisible("#csseditor_tab", CLIENT.rank >= 3);
    setVisible("#jseditor_tab", CLIENT.rank >= 3);
    setVisible("#filtereditor_tab", hasPermission("filteredit"));
    setVisible("#acl_tab", CLIENT.rank >= 3);
    setVisible("#dropchannel_tab", CLIENT.rank >= 10);

    setVisible("#newpollbtn", hasPermission("pollctl"));

    $("#pollcontainer .active").find(".btn-danger").remove();
    if(hasPermission("pollctl")) {
        var poll = $("#pollcontainer .active");
        if(poll.length > 0) {
            $("<button/>").addClass("btn btn-danger pull-right")
                .text("End Poll")
                .insertAfter(poll.find(".close"))
                .click(function() {
                    socket.emit("closePoll");
                });
        }
    }
    var poll = $("#pollcontainer .active");
    if(poll.length > 0) {
        poll.find(".btn").attr("disabled", !hasPermission("pollvote"));
    }
    var users = $("#userlist").children();
    for(var i = 0; i < users.length; i++) {
        addUserDropdown($(users[i]), users[i].children[1].innerHTML);
    }
    rebuildPlaylist();
}

/* search stuff */

function clearSearchResults() {
    $("#library").html("");
    $("#search_pagination").remove();
}

function loadSearchPage(page) {
    $("#library").html("");
    var results = $("#library").data("entries");
    var start = page * 100;
    for(var i = start; i < start + 100 && i < results.length; i++) {
        var li = makeQueueEntry(results[i]);
        if(hasPermission("playlistadd")) {
            if(results[i].thumb) {
                addLibraryButtons(li, results[i].id, true);
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
