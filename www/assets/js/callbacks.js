/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Wrapped in a function so I can ensure that the socket
// is defined before these statements are run
function initCallbacks() {
    /* REGION Globals */

    socket.on("disconnect", function() {
        handleDisconnect();
    });

    socket.on("announcement", function(data) {
        showAnnouncement(data.title, data.text);
    });

    /* REGION Channel Meta */
    socket.on("kick", function(data) {
        KICKED = true;
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text("Kicked: " + data.reason)
            .appendTo($("#messagebuffer"));
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
    });

    socket.on("noflood", function(data) {
        $("<div/>")
            .addClass("server-msg-disconnect")
            .text(data.action + ": " + data.msg)
            .appendTo($("#messagebuffer"));
        $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
    });

    socket.on("channelNotRegistered", function() {
        showChannelRegistration();
    });

    socket.on("registerChannel", function(data) {
        if(data.success) {
            $("#chregnotice").remove();
        }
        else {
            alert(data.error);
        }
    });

    socket.on("updateMotd", function(data) {
        $("#motdtext").val(data.motd);
        if(data.motd != "")
            $("#motd").parent().css("display", "");
        else
            $("#motd").parent().css("display", "none");
        $("#motd")[0].innerHTML = data.html;
    });

    socket.on("chatFilters", function(data) {
        updateChatFilters(data.filters);
    });

    socket.on("channelOpts", function(opts) {
        $("#opt_qopen_allow_qnext").prop("checked", opts.qopen_allow_qnext);
        $("#opt_qopen_allow_move").prop("checked", opts.qopen_allow_move);
        $("#opt_qopen_allow_delete").prop("checked", opts.qopen_allow_delete);
        $("#opt_qopen_allow_playnext").prop("checked", opts.qopen_allow_playnext);
        $("#opt_pagetitle").attr("placeholder", opts.pagetitle);
        document.title = opts.pagetitle;
        PAGETITLE = opts.pagetitle;
        $("#opt_customcss").val(opts.customcss);
        $("#opt_customjs").val(opts.customjs);
        $("#opt_chat_antiflood").prop("checked", opts.chat_antiflood);
        $("#customCss").remove();
        if(opts.customcss.trim() != "") {
            $("<link/>").attr("rel", "stylesheet")
                       .attr("href", opts.customcss)
                       .attr("id", "customCss")
                       .insertAfter($("link[href='./assets/css/ytsync.css']"));
        }
        $("#opt_allow_voteskip").prop("checked", opts.allow_voteskip);
        $("#opt_voteskip_ratio").val(opts.voteskip_ratio);
        if(opts.customjs.trim() != "") {
            $.getScript(opts.customjs);
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
        rebuildPlaylist();
    });

    socket.on("banlist", function(data) {
        updateBanlist(data.entries);
    });

    socket.on("acl", updateACL);

    socket.on("voteskip", function(data) {
        if(data.count > 0) {
            $("#voteskip").text("Voteskip ("+data.count+"/"+data.need+")");
        }
        else {
            $("#voteskip").text("Voteskip");
        }
    });

    /* REGION Rank Stuff */

    socket.on("rank", function(data) {
        RANK = data.rank;
        handleRankChange();
    });

    socket.on("register", function(data) {
        if(data.error) {
            alert(data.error);
        }
    });

    socket.on("login", function(data) {
        if(!data.success)
            alert(data.error);
        else {
            $("#welcome")[0].innerHTML = "Welcome, " + uname;
            $("#loginform").css("display", "none");
            $("#logoutform").css("display", "");
            $("#loggedin").css("display", "");
            if(pw != "") {
                createCookie("sync_uname", uname, 1);
                createCookie("sync_pw", pw, 1);
            }
        }
    });


    /* REGION Chat */

    socket.on("usercount", function(data) {
        var text = data.count + " connected user";
        if(data.count != 1) {
            text += "s";
        }
        $("#usercount").text(text);
    });

    socket.on("chatMsg", function(data) {
        addChatMessage(data);
    });

    socket.on("userlist", function(data) {
        $(".userlist_item").each(function() { $(this).remove(); });
        for(var i = 0; i < data.length; i++) {
            addUser(data[i]);
        }
    });

    socket.on("addUser", function(data) {
        addUser(data);
    });

    socket.on("updateUser", function(data) {
        if(data.name == uname) {
            LEADER = data.leader;
            handleRankChange();
            if(LEADER) {
                // I'm a leader!  Set up sync function
                sendVideoUpdate = function() {
                    PLAYER.getTime(function(seconds) {
                        socket.emit("mediaUpdate", {
                            id: PLAYER.id,
                            currentTime: seconds,
                            paused: false,
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
    });

    socket.on("userLeave", function(data) {
        var users = $("#userlist").children();
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerHTML;
            if(name == data.name) {
                $("#userlist")[0].removeChild(users[i]);
            }
        }
    });

    socket.on("drinkCount", function(data) {
        if(data.count != 0) {
            var text = data.count + " drink";
            if(data.count != 1) {
                text += "s";
            }
            $("#drinkcount").text(text);
            $(".drinkbar").show();
        }
        else {
            $(".drinkbar").hide();
        }
    });

    /* REGION Playlist Stuff */

    socket.on("playlist", function(data) {
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
            $(li).appendTo(ul);
        }
    });

    socket.on("queue", function(data) {
        var li = makeQueueEntry(data.media);
        if(RANK >= Rank.Moderator || OPENQUEUE || LEADER)
            addQueueButtons(li);
        $(li).css("display", "none");
        var idx = data.pos;
        var ul = $("#queue")[0];
        $(li).appendTo(ul);
        if(idx < ul.children.length - 1)
            moveVideo(ul.children.length - 1, idx);
        $(li).show("blind");
    });

    socket.on("unqueue", function(data) {
        var li = $("#queue").children()[data.pos];
        $(li).remove();
    });

    socket.on("moveVideo", function(data) {
        moveVideo(data.src, data.dest);
    });

    socket.on("updatePlaylistIdx", function(data) {
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
    });

    socket.on("mediaUpdate", function(data) {
        $("#currenttitle").text("Currently Playing: " + data.title);
        if(data.type != "sc" && MEDIATYPE == "sc")
            // [](/goddamnitmango)
            fixSoundcloudShit();
        if(data.type != MEDIATYPE) {
            MEDIATYPE = data.type;
            PLAYER = new Media(data);
        }
        else if(PLAYER.update) {
            PLAYER.update(data);
        }
    });

    socket.on("queueLock", function(data) {
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
    });

    socket.on("librarySearchResults", function(data) {
        var n = $("#library").children().length;
        for(var i = 0; i < n; i++) {
            $("#library")[0].removeChild($("#library").children()[0]);
        }
        var ul = $("#library")[0];
        for(var i = 0; i < data.results.length; i++) {
            var li = makeQueueEntry(data.results[i]);
            if(RANK >= Rank.Moderator || OPENQUEUE || LEADER) {
                if(data.results[i].thumb)
                    addLibraryButtons(li, data.results[i].id, true);
                else
                    addLibraryButtons(li, data.results[i].id);
            }
            $(li).appendTo(ul);
        }
    });

    /* REGION Poll */

    socket.on("newPoll", function(data) {
        addPoll(data);
        if(SCROLLCHAT) {
            $("#messagebuffer").scrollTop($("#messagebuffer").prop("scrollHeight"));
        }
    });

    socket.on("updatePoll", function(data) {
        updatePoll(data);
    });

    socket.on("closePoll", function() {
        closePoll();
    });
}
