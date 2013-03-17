/**
 * Copyright 2013 Calvin 'calzoneman' Montgomery
 *
 * Licensed under Creative Commons Attribution-NonCommercial 3.0
 * See http://creativecommons.org/licenses/by-nc/3.0/
 *
 */

// Wrapped in a function so I can ensure that the socket
// is defined before these statements are run
function initCallbacks() {
    socket.on('disconnect', function() {
        $('<div/>').addClass('alert').addClass('alert-error')
            .insertAfter($('.row')[0])[0]
            .innerHTML = "<h3>Disconnected from server</h3>";
    });

    socket.on('rank', function(data) {
        if(data.rank >= Rank.Moderator) {
            $('#playlist_controls').css("display", "block");
            $('#qlockbtn').css("display", "block");
            var poll = $('#pollcontainer .active');
            if(poll.length > 0) {
                $('<button/>').addClass('btn btn-danger pull-right').text('Close Poll')
                    .insertAfter(poll.find('.close'))
                    .click(function() {
                        socket.emit('closePoll')
                    });
            }
        }
        RANK = data.rank;
    });

    socket.on('login', function(data) {
        if(!data.success)
            alert(data.error);
        else {
            $('#welcome')[0].innerHTML = "Welcome, " + uname;
            $('#loginform').css("display", "none");
            $('#logoutform').css("display", "");
            $('#loggedin').css("display", "");
            if(pw != "") {
                createCookie('sync_uname', uname, 1);
                createCookie('sync_pw', pw, 1);
            }
        }
    });

    socket.on('register', function(data) {
        if(data.error) {
            alert(data.error);
        }
    });

    socket.on('usercount', function(data) {
        $('#usercount').text(data.count + " connected users");
    });

    socket.on('chatMsg', function(data) {
        var div = formatChatMessage(data);
        $('#messagebuffer')[0].appendChild(div);
        // Cap chatbox at most recent 100 messages
        if($('#messagebuffer').children().length > 100) {
            $($('#messagebufer').children()[0]).remove();
        }
        $('#messagebuffer').scrollTop($('#messagebuffer').prop("scrollHeight"));
    });

    socket.on('playlist', function(data) {
        var ul = $('#queue')[0];
        var n = ul.children.length;
        for(var i = 0; i < n; i++) {
            ul.removeChild(ul.children[0]);
        }
        for(var i = 0; i < data.pl.length; i++) {
            var li = makeQueueEntry(data.pl[i]);
            if(RANK >= Rank.Moderator || OPENQUEUE)
                addQueueButtons(li);
            $(li).appendTo(ul);
        }
    });

    socket.on('queue', function(data) {
        var li = makeQueueEntry(data.media);
        if(RANK >= Rank.Moderator || OPENQUEUE)
            addQueueButtons(li);
        $(li).css('display', 'none');
        var idx = data.pos;
        var ul = $('#queue')[0];
        $(li).appendTo(ul);
        if(idx < ul.children.length - 1)
            moveVideo(ul.children.length - 1, idx);
        $(li).show('blind');
    });

    socket.on('unqueue', function(data) {
        if(data.pos == POSITION && $('#queue').children().length > POSITION + 1) {
            $($('#queue').children()[POSITION+1]).addClass("alert alert-info");
        }
        var li = $('#queue').children()[data.pos];
        $(li).hide('blind', function() {
            $(li).remove();
        });
    });

    socket.on('moveVideo', function(data) {
        moveVideo(data.src, data.dest);
    });

    socket.on('queueLock', function(data) {
        OPENQUEUE = !data.locked;
        if(OPENQUEUE) {
            $('#playlist_controls').css('display', '');
            if(RANK < Rank.Moderator) {
                $('#qlockbtn').css('display', 'none');
            }
        }
        else if(RANK < Rank.Moderator) {
            $('#playlist_controls').css('display', 'none');
        }
        if(RANK >= Rank.Moderator) {
            if(OPENQUEUE) {
                $('#qlockbtn').removeClass('btn-danger')
                    .addClass('btn-success')
                    .text('Lock Queue');
            }
            else {
                $('#qlockbtn').removeClass('btn-success')
                    .addClass('btn-danger')
                    .text('Unlock Queue');
            }
        }
    });

    socket.on('updatePlaylistIdx', function(data) {
        var liold = $('#queue').children()[POSITION];
        $(liold).removeClass("alert alert-info");
        var linew = $('#queue').children()[data.idx];
        $(linew).addClass("alert alert-info");
        POSITION= data.idx;
    });

    socket.on('mediaUpdate', function(data) {
        $('#currenttitle').text("Currently Playing: " + data.title);
        if(data.type == "yt")
            updateYT(data);
        else if(data.type == "tw")
            loadTwitch(data.id);
        else if(data.type == "li")
            loadLivestream(data.id);
        else if(data.type == "sc")
            updateSC(data);
        else if(data.type == "vi")
            updateVI(data);
    });

    socket.on('userlist', function(data) {
        for(var i = 0; i < data.length; i++) {
            addUser(data[i].name, data[i].rank, data[i].leader);
        }
    });

    socket.on('addUser', function(data) {
        addUser(data.name, data.rank, data.leader);
    });

    socket.on('updateUser', function(data) {
        if(data.name == uname) {
            LEADER = data.leader;
            if(LEADER) {
                // I'm a leader!  Set up sync function
                sendVideoUpdate = function() {
                    if(MEDIATYPE == "yt") {
                        socket.emit('mediaUpdate', {
                            id: parseYTURL(PLAYER.getVideoUrl()),
                            seconds: PLAYER.getCurrentTime(),
                            paused: PLAYER.getPlayerState() == YT.PlayerState.PAUSED,
                            type: "yt"
                        });
                    }
                    else if(MEDIATYPE == "sc") {
                        PLAYER.getPosition(function(pos) {
                            socket.emit('mediaUpdate', {
                                id: PLAYER.mediaId,
                                seconds: pos / 1000,
                                paused: false,
                                type: "sc"
                            });
                        });
                    }
                    else if(MEDIATYPE == "vi") {
                        PLAYER.api('getCurrentTime', function(data) {
                            socket.emit('mediaUpdate', {
                                id: PLAYER.videoid,
                                seconds: data,
                                paused: false,
                                type: "vi"
                            });
                        });
                    }
                };
            }
            // I'm not a leader.  Don't send syncs to the server
            else {
                sendVideoUpdate = function() { }
            }

            RANK = data.rank;
            if(data.rank >= Rank.Moderator)
                $('#playlist_controls').css("display", "block");
        }
        var users = $('#userlist').children();
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerText;
            // Reformat user
            if(name == data.name) {
                fmtUserlistItem(users[i], data.rank, data.leader);
            }
        }
    });

    socket.on('userLeave', function(data) {
        var users = $('#userlist').children();
        for(var i = 0; i < users.length; i++) {
            var name = users[i].children[1].innerHTML;
            if(name == data.name) {
                $('#userlist')[0].removeChild(users[i]);
            }
        }
    });

    socket.on('librarySearchResults', function(data) {
        var n = $('#library').children().length;
        for(var i = 0; i < n; i++) {
            $('#library')[0].removeChild($('#library').children()[0]);
        }
        var ul = $('#library')[0];
        for(var i = 0; i < data.results.length; i++) {
            var li = makeQueueEntry(data.results[i]);
            if(RANK >= Rank.Moderator || OPENQUEUE)
                addLibraryButtons(li, data.results[i].id);
            $(li).appendTo(ul);
        }
    });

    socket.on('newPoll', function(data) {
        addPoll(data);
    });

    socket.on('updatePoll', function(data) {
        updatePoll(data);
    });

    socket.on('closePoll', function() {
        closePoll();
    });
}
