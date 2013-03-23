/**
 * Copyright 2013 Calvin 'calzoneman' Montgomery
 *
 * Licensed under Creative Commons Attribution-NonCommercial 3.0
 * See http://creativecommons.org/licenses/by-nc/3.0/
 *
 */

var RANK = 0;
var uname = readCookie('sync_uname');
var pw = readCookie('sync_pw');
var manageChannel = false;

var Rank = {
    Guest: 0,
    Member: 1,
    Moderator: 2,
    Owner: 3,
    Siteadmin: 255
};

var socket = io.connect(IO_URL);
initCallbacks();

function initCallbacks() {

    socket.on('adm', function(data) {
        console.log(data);
        if(data.cmd == "listchannels")
            handleChannelList(data);
    });

    socket.on('login', function(data) {
        if(data.success && $('#password').val()) {
            createCookie('sync_uname', uname, 1);
            createCookie('sync_pw', pw, 1);
        }
        if(data.success) {
            $('#loggedin').css('display', '');
            $('#logoutform').css('display', '');
            $('#loginform').css('display', 'none');
        }
        socket.emit('adm', {
            cmd: "listchannels"
        });
    });
}

function handleChannelList(data) {
    if($('#chanlist').children.length > 1)
        $($('#chanlist').children()[1]).remove();
    for(var i = 0; i < data.chans.length; i++) {
        var row = $('<tr/>').appendTo($('#chanlist'));
        var name = $('<td/>').appendTo(row).text(data.chans[i].name);
        var usercount = $('<td/>').appendTo(row).text(data.chans[i].usercount);
        var nowplaying = $('<td/>').appendTo(row).text(data.chans[i].nowplaying);
    }
}

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

if(uname != null && pw != null && pw != "false") {
    socket.emit('login', {
        name: uname,
        sha256: pw
    });
}

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
