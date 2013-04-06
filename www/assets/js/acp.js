/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var RANK = 0;
var uname = readCookie("sync_uname");
var pw = readCookie("sync_pw");
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

    socket.on("adm", function(data) {
        console.log(data);
        if(data.cmd == "listchannels")
            handleChannelList(data);
    });

    socket.on("login", function(data) {
        if(data.success && $("#password").val()) {
            createCookie("sync_uname", uname, 1);
            createCookie("sync_pw", pw, 1);
        }
        if(data.success) {
            $("#loggedin").css("display", "");
            $("#logoutform").css("display", "");
            $("#loginform").css("display", "none");
        }
        setInterval(function() {
            socket.emit("adm", {
                cmd: "listchannels"
            });
        }, 10000);
        socket.emit("adm", {
            cmd: "listchannels"
        });
    });
}

function handleChannelList(data) {
    if($("#chanlist").children.length > 1)
        $($("#chanlist").children()[1]).remove();
    for(var i = 0; i < data.chans.length; i++) {
        var row = $("<tr/>").appendTo($("#chanlist"));
        var name = $("<td/>").appendTo(row).text(data.chans[i].name);
        var usercount = $("<td/>").appendTo(row).text(data.chans[i].usercount);
        var nowplaying = $("<td/>").appendTo(row).text(data.chans[i].nowplaying);
    }
}

var params = {};
if(window.location.search) {
    var parameters = window.location.search.substring(1).split("&");
    for(var i = 0; i < parameters.length; i++) {
        var s = parameters[i].split("=");
        if(s.length != 2)
            continue;
        params[s[0]] = s[1];
    }
}

if(uname != null && pw != null && pw != "false") {
    socket.emit("login", {
        name: uname,
        pw: pw
    });
}

function loginClick() {
    uname = $("#username").val();
    pw = $("#password").val();
    socket.emit("login", {
        name: uname,
        pw: pw
    });
};

$("#login").click(loginClick);
$("#username").keydown(function(ev) {
    if(ev.key == 13)
        loginClick();
});
$("#password").keydown(function(ev) {
    if(ev.key == 13)
        loginClick();
});

$("#logout").click(function() {
    eraseCookie("sync_uname");
    eraseCookie("sync_pw");
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
    var ca = document.cookie.split(";");
    for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==" ") c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name,"",-1);
}
