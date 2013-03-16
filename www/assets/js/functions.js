/**
 * Copyright 2013 Calvin 'calzoneman' Montgomery
 *
 * Licensed under Creative Commons Attribution-NonCommercial 3.0
 * See http://creativecommons.org/licenses/by-nc/3.0/
 *
 */

// Adds a user to the chatbox userlist
function addUser(name, rank, leader) {
    var div = document.createElement('div');
    $(div).attr("class", "userlist_item");
    var span = document.createElement('span');
    var flair = document.createElement('span');
    span.innerHTML = name;
    div.appendChild(flair);
    div.appendChild(span);
    fmtUserlistItem(div, rank, leader);
    if(RANK >= Rank.Moderator)
        addUserDropdown(div, name);
    $('#userlist')[0].appendChild(div);
}

// Format a userlist entry based on a person's rank
function fmtUserlistItem(div, rank, leader) {
    var span = div.children[1];
    if(rank >= Rank.Siteadmin)
        $(span).attr("class", "userlist_siteadmin");
    else if(rank >= Rank.Owner)
        $(span).attr("class", "userlist_owner");
    else if(rank >= Rank.Moderator)
        $(span).attr("class", "userlist_op");

    var flair = div.children[0];
    // denote current leader with [L]
    if(leader) {
        flair.innerHTML = "[L]";
    }
    else {
        flair.innerHTML = "";
    }
}

// Adds a dropdown with user actions (promote/demote/leader)
function addUserDropdown(entry, name) {
    var div = $('<div />').addClass("dropdown").appendTo(entry);
    var ul = $('<ul />').addClass("dropdown-menu").appendTo(div);
    ul.attr("role", "menu");
    ul.attr("aria-labelledby", "dropdownMenu");

    var makeLeader = $('<li />').appendTo(ul);
    var a = $('<a />').attr("tabindex", "-1").attr("href", "#").appendTo(makeLeader);
    a.text("Make Leader");
    a.click(function() {
        socket.emit('assignLeader', {
            name: name
        });
    });

    var takeLeader = $('<li />').appendTo(ul);
    var a = $('<a />').attr("tabindex", "-1").attr("href", "#").appendTo(takeLeader);
    a.text("Take Leader");
    a.click(function() {
        socket.emit('assignLeader', {
            name: ""
        });
    });

    var kick = $('<li />').appendTo(ul);
    var a = $('<a />').attr("tabindex", "-1").attr("href", "#").appendTo(kick);
    a.text("Kick");
    a.click(function() {
        socket.emit('chatMsg', {
            msg: "/kick " + name
        });
    });

    $('<li />').addClass("divider").appendTo(ul);

    var promote = $('<li />').appendTo(ul);
    var a = $('<a />').attr("tabindex", "-1").attr("href", "#").appendTo(promote);
    a.text("Promote");
    a.click(function() {
        socket.emit('promote', {
            name: name
        });
    });

    var demote = $('<li />').appendTo(ul);
    var a = $('<a />').attr("tabindex", "-1").attr("href", "#").appendTo(demote);
    a.text("Demote");
    a.click(function() {
        socket.emit('demote', {
            name: name
        });
    });

    $(entry).click(function() {
        if(ul.css("display") == "none") {
            ul.css("display", "block");
        }
        else {
            ul.css("display", "none");
        }
    });
    return ul;
}

function formatChatMessage(data) {
    var div = document.createElement('div');
    if(data.msgclass == "action") {
        var message = document.createElement('span');
        $(message).addClass('action');
        message.innerHTML = data.username + " " + data.msg;
        div.appendChild(message);
    }
    else {
        var name = document.createElement('span');
        var message = document.createElement('span');
        name.innerHTML = "<strong>&lt;" + data.username + "&gt;</strong> ";
        $(message).addClass(data.msgclass);
        message.innerHTML = data.msg;
        div.appendChild(name);
        div.appendChild(message);
    }
    return div;
}

// Creates and formats a queue entry
function makeQueueEntry(video) {
    var li = $('<li />');
    li.attr("class", "well");
    var title = $('<span />').attr("class", "qe_title").appendTo(li);
    title.text(video.title);
    var time = $('<span />').attr("class", "qe_time").appendTo(li);
    time.text(video.duration);
    var clear = $('<div />').attr("class", "qe_clear").appendTo(li);
    return li;
}

// Add buttons to a queue list entry
function addQueueButtons(li) {
    var btnstrip = $('<div />').attr("class", "btn-group qe_buttons").prependTo(li);

    var btnRemove =  $('<button />').attr("class", "btn btn-danger qe_btn").appendTo(btnstrip);
    $('<i />').attr("class", "icon-remove").appendTo(btnRemove);

    var btnUp =  $('<button />').attr("class", "btn qe_btn").appendTo(btnstrip);
    $('<i />').attr("class", "icon-arrow-up").appendTo(btnUp);

    var btnDown =  $('<button />').attr("class", "btn qe_btn").appendTo(btnstrip);
    $('<i />').attr("class", "icon-arrow-down").appendTo(btnDown);

    var btnNext =  $('<button />').attr("class", "btn qe_btn").appendTo(btnstrip);
    //$('<i />').attr("class", "icon-play").appendTo(btnNext);
    btnNext.text('Next');

    // Callback time
    $(btnRemove).click(function() {
        btnstrip.remove();
        var idx = $('#queue').children().index(li);
        socket.emit('unqueue', { pos: idx });
    });

    $(btnUp).click(function() {
        var idx = $('#queue').children().index(li);
        socket.emit('moveMedia', {
            src: idx,
            dest: idx-1
        });
    });

    $(btnDown).click(function() {
        var idx = $('#queue').children().index(li);
        socket.emit('moveMedia', {
            src: idx,
            dest: idx+1
        });
    });

    $(btnNext).click(function() {
        var idx = $('#queue').children().index(li);
        var dest = idx < POSITION ? POSITION : POSITION + 1;
        socket.emit('moveMedia', {
            src: idx,
            dest: dest
        });
    });
}

// Add buttons to a list entry for the library search results
function addLibraryButtons(li, id) {
    var btnstrip = $('<div />').attr("class", "btn-group qe_buttons").prependTo(li);


    var btnNext =  $('<button />').attr("class", "btn qe_btn").appendTo(btnstrip);
    //$('<i />').attr("class", "icon-play").appendTo(btnNext);
    btnNext.text('Next');

    var btnEnd =  $('<button />').attr("class", "btn qe_btn").appendTo(btnstrip);
    //$('<i />').attr("class", "icon-fast-forward").appendTo(btnEnd);
    btnEnd.text('End');

    // Callback time
    $(btnNext).click(function() {
        socket.emit('queue', {
            id: id,
            pos: "next"
        });
    });

    $(btnEnd).click(function() {
        socket.emit('queue', {
            id: id,
            pos: "end"
        });
    });
}

// Rearranges the queue
function moveVideo(src, dest) {
    var li = $('#queue').children()[src];
    var ul = $('#queue')[0];
    $(li).hide('blind', function() {
        ul.removeChild(li);
        if(dest == ul.children.length) {
            ul.appendChild(li);
        }
        else {
            ul.insertBefore(li, ul.getElementsByTagName('li')[dest]);
        }
        $(li).show('blind');
    });
    if(src < POSITION && dest >= POSITION)
        POSITION--;
    if(src > POSITION && dest < POSITION)
        POSITION++;
}

// YouTube Synchronization
function updateYT(data) {
    if(MEDIATYPE != "yt") {
        removeCurrentPlayer();
        MEDIATYPE = "yt";
        // Note to Soundcloud/Vimeo API designers:
        // YouTube's API is actually nice to use
        PLAYER = new YT.Player('ytapiplayer', {
            height: '390',
            width: '640',
            videoId: '',
            playerVars: {
                'autoplay': 0,
                'controls': 1,
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }
    // Load new video
    if(PLAYER.getVideoUrl && data.id != parseYTURL(PLAYER.getVideoUrl())) {
        PLAYER.loadVideoById(data.id, data.currentTime, $('#quality').val());
        if(data.paused)
            PLAYER.pauseVideo();
    }
    // Sync playback time
    else if(PLAYER.seekTo) {
        if(Math.abs(PLAYER.getCurrentTime() - data.currentTime) > SYNC_THRESHOLD)
        PLAYER.seekTo(data.currentTime, true);
        if(!data.paused)
            PLAYER.playVideo();
    }
}

// Soundcloud synchronization
function updateSC(data) {
    if(MEDIATYPE != "sc") {
        var currentEmbed = $("#ytapiplayer");
        var iframe = $("<iframe/>").insertBefore(currentEmbed);
        currentEmbed.remove();
        iframe.attr("id","ytapiplayer");
        iframe.attr("src", "https://w.soundcloud.com/player/?url=");
        iframe.css("width", "100%").attr("height", "166")
              .attr("frameborder", "no");

        PLAYER = SC.Widget('ytapiplayer');
        MEDIATYPE = "sc";
    }
    // Server is on a different soundcloud track than client
    if(PLAYER.mediaId != data.id) {
        PLAYER.load(data.id, {
            auto_play: true
        });
        // Keep track of current ID
        PLAYER.mediaId = data.id;
    }
    // Soundcloud's API is async
    // Query the playback position and compare that with the sync packet
    PLAYER.getPosition(function(pos) {
        if(Math.abs(pos / 1000 - data.currentTime) > SYNC_THRESHOLD) {
            PLAYER.seekTo(data.currentTime * 1000);
        }
    });
}

// Vimeo synchronization
// URGH building a synchronizing tool is so frustrating when
// these APIs are designed to be async
function updateVI(data) {
    if(MEDIATYPE != "vi") {
        initVI(data);
    }
    // Either vimeo's API doesn't support loading a new video
    // or their terrible documentation doesn't document it
    else if(data.id != PLAYER.videoid) {
        initVI(data);
    }

    PLAYER.api('getCurrentTime', function(time) {
        if(Math.abs(time - data.currentTime) > SYNC_THRESHOLD) {
            PLAYER.api('seekTo', data.currentTime);
        }
    });
}

// Loads up a Vimeo player
function initVI(data) {
    var currentEmbed = $("#ytapiplayer");
    var div = currentEmbed.parent();
    currentEmbed.remove();
    // Ugly but it's the only way I managed to get the API calls to work
    div[0].innerHTML = '<iframe id="ytapiplayer" src="http://player.vimeo.com/video/' + data.id + '?api=1&player_id=ytapiplayer" width="640" height="390" frameborder="0" webkitAllowFullScreen mozallowfullscreen allowFullScreen></iframe>';
    // $f() is defined by froogaloop, Vimeo's API wrapper
    PLAYER = $f($('iframe')[0]);
    // So we can retrieve the ID synchronously instead of waiting for
    // getVideoId with a callback
    PLAYER.videoid = data.id;
    PLAYER.addEvent('ready', function()  {
        // Autoplay
        PLAYER.api('play');
    });
    MEDIATYPE = "vi";
}

function loadTwitch(channel) {
    MEDIATYPE = "tw";

    removeCurrentPlayer();
    var url = "http://www.twitch.tv/widgets/live_embed_player.swf?channel="+channel;
    var params = {
        allowFullScreen:"true",
        allowScriptAccess:"always",
        allowNetworking:"all",
        movie:"http://www.twitch.tv/widgets/live_embed_player.swf",
        id: "live_embed_player_flash",
        flashvars:"hostname=www.twitch.tv&channel="+channel+"&auto_play=true&start_volume=100"
    };
    swfobject.embedSWF( url, "ytapiplayer", '640', '390', "8", null, null, params, {} );
}

function removeCurrentPlayer(){
    var currentEmbed = $("#ytapiplayer");
    var placeholder = $("<div/>").insertBefore(currentEmbed);
    currentEmbed.remove();
    placeholder.attr("id","ytapiplayer");
}

function parseVideoURL(url){
    if(typeof(url) != "string")
        return null;
    if(url.indexOf("youtu") != -1)
        return [parseYTURL(url), "yt"];
    else if(url.indexOf("twitch") != -1)
        return [parseTwitch(url), "tw"];
    else if(url.indexOf("soundcloud") != -1)
        return [url, "sc"];
    else if(url.indexOf("vimeo") != -1)
        return [parseVimeo(url), "vi"];
}

function parseYTURL(url) {
    url = url.replace("feature=player_embedded&", "");
    if(url.indexOf("&list=") != -1)
        url = url.substring(0, url.indexOf("&list="));
    var m = url.match(/youtube\.com\/watch\\?v=([^&]*)/);
    if(m) {
        // Extract ID
        return m[1];
    }
    var m = url.match(/youtu\.be\/([^&]*)/);
    if(m) {
        // Extract ID
        return m[1];
    }
    // Final try
    var m = url.match(/v=([^&]*)/);
    if(m) {
        // Extract ID
        return m[1];
    }
    return null;
}

function parseTwitch(url) {
    var m = url.match(/twitch\.tv\/([a-zA-Z0-9]*)/);
    if(m) {
        // Extract channel name
        return m[1];
    }
    return null;
}

function parseVimeo(url) {
    var m = url.match(/vimeo\.com\/([0-9]+)/);
    if(m) {
        // Extract video ID
        return m[1];
    }
    return null;
}



