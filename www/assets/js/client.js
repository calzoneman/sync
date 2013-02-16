/**
 * Copyright 2013 Calvin 'calzoneman' Montgomery
 *
 * Licensed under Creative Commons Attribution-NonCommercial 3.0
 * See http://creativecommons.org/licenses/by-nc/3.0/
 *
 */

const IO_URL = "http://somewebsite:1337";
const SYNC_THRESHOLD = 2;
var LEADER = false;
var PLAYER = false;
var MEDIATYPE = "yt";
var POSITION = -1;
var RANK = 0;
var uname = readCookie('sync_uname');
var pw = readCookie('sync_pw');

var Rank = {
    Guest: 0,
    Member: 1,
    Moderator: 4,
    Owner: 8,
    Siteadmin: 255
};

var socket = io.connect(IO_URL);
initCallbacks();

var params = {};
if(window.location.search) {
    var parameters = window.location.search.substring(1).split('&');
    for(var i = 0; i < parameters.length; i++) {
        var s = parameters[i].split('=');
        if(s.length != 2)
            continue;
        params[s[0]] = s[1];
    }
}

if(params['channel'] == undefined) {
    var main = $($('.container')[1]);
    var container = $('<div/>').addClass('container').insertBefore(main);
    var row = $('<div/>').addClass('row').appendTo(container);
    var div = $('<div/>').addClass('span6').appendTo(row);
    main.css("display", "none");
    var label = $('<label/>').text('Enter Channel:').appendTo(div);
    var entry = $('<input/>').attr('type', 'text').appendTo(div);
    entry.keydown(function(ev) {
        if(ev.keyCode == 13) {
            document.location = document.location + "?channel=" + entry.val();
            socket.emit('joinChannel', {
                name: entry.val()
            });
            container.remove();
            main.css("display", "");
        }
    });
}
else {
    socket.emit('joinChannel', {
        name: params['channel']
    });
}


// Load the youtube iframe API
var tag = document.createElement('script');
tag.src = "http://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);



if(uname != null && pw != null && pw != "false") {
    socket.emit('login', {
        name: uname,
        sha256: pw
    });
}

var sendVideoUpdate = function() { }
setInterval(function() {
    sendVideoUpdate();
}, 5000);

$('#queue_end').click(function() {
    var parsed = parseVideoURL($('#mediaurl').val());
    var id = parsed[0];
    var type = parsed[1];
    if(id) {
        $('#mediaurl').val("");
    }
    socket.emit('queue', {
        id: id,
        pos: "end",
        type: type
    });
});

$('#queue_next').click(function() {
    var parsed = parseVideoURL($('#mediaurl').val());
    var id = parsed[0];
    var type = parsed[1];
    if(id) {
        $('#mediaurl').val("");
    }
    socket.emit('queue', {
        id: id,
        pos: "next",
        type: type
    });
});

$('#play_next').click(function() {
    socket.emit('playNext');
});

function loginClick() {
    uname = $('#username').val();
    if($('#password').val() == "")
        pw = "";
    else
        pw = SHA256($('#password').val());
    socket.emit('login', {
        name: uname,
        sha256: pw
    });
};

$('#login').click(loginClick);
$('#username').keydown(function(ev) {
    if(ev.key == 13)
        loginClick();
});
$('#password').keydown(function(ev) {
    if(ev.key == 13)
        loginClick();
});

$('#logout').click(function() {
    eraseCookie('sync_uname');
    eraseCookie('sync_pw');
    document.location.reload(true);
});

$('#register').click(function() {
    uname = $('#username').val();
    if($('#password').val() == "")
        pw = "";
    else
        pw = SHA256($('#password').val());
    socket.emit('register', {
        name: uname,
        sha256: pw
    });
});

$('#chatline').keydown(function(ev) {
    if(ev.keyCode == 13) {
        socket.emit('chatMsg', {
            msg: $('#chatline').val()
        });
        $('#chatline').val('');
    }
});


function searchLibrary() {
    socket.emit('searchLibrary', {
        query: $('#library_query').val()
    });
}
$('#library_search').click(searchLibrary);
$('#library_query').keydown(function(ev) {
    if(ev.key == 13)
        searchLibrary();
});

function onYouTubeIframeAPIReady() {
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

function onPlayerReady() {
    socket.emit('playerReady');
}

function onPlayerStateChange(state) {
    if(LEADER && state.data == YT.PlayerState.ENDED) {
        socket.emit('playNext');
    }
    else if(LEADER && state.data == YT.PlayerState.PAUSED) {
        socket.emit('mediaUpdate', {
            id: parseYTURL(PLAYER.getVideoUrl()),
            seconds: PLAYER.getCurrentTime(),
            type: "yt",
            paused: true
        });
    }
    if(LEADER && state.data == YT.PlayerState.PLAYING) {
        socket.emit('mediaUpdate', {
            id: parseYTURL(PLAYER.getVideoUrl()),
            seconds: PLAYER.getCurrentTime(),
            type: "yt",
            paused: false
        });
    }
}

function createCookie(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+value+expires+"; path=/";
}

function readCookie(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name,"",-1);
}
