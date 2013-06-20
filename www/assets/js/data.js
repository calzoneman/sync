/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var CL_VERSION = "2.0.0";

var CLIENT = {
    rank: -1,
    leader: false,
    name: "",
    logged_in: false,
    profile: {
        image: "",
        text: ""
    }
};

var CHANNEL = {
    opts: {},
    openqueue: false,
    perms: {},
    css: "",
    js: "",
    motd: "",
    name: false
};

var PLAYER = false;
var FLUIDLAYOUT = false;
if($("ytapiplayer").length > 0) {
    var VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");
    var VHEIGHT = ""+parseInt(parseInt(VWIDTH) * 9 / 16);
}
var POSITION = -1;
var socket = {
    emit: function() {
        console.log("socket not initialized");
        console.log(arguments);
    }
};
var IGNORED = [];
var CHATHIST = [];
var CHATHISTIDX = 0;
var SCROLLCHAT = true;
var LASTCHATNAME = "";
var LASTCHATTIME = 0;
var FOCUSED = true;
var PAGETITLE = "CyTube";
var TITLE_BLINK;
var KICKED = false;
var NAME = readCookie("cytube_uname");
var SESSION = readCookie("cytube_session");
var LEADTMR = false;
var PL_FROM = 0;
var PL_TO = 0;
var FILTER_FROM = 0;
var FILTER_TO = 0;

function getOrDefault(k, def) {
    var v = localStorage.getItem(k);
    if(v === null)
        return def;
    if(v === "true")
        return true;
    if(v === "false")
        return false;
    if(v.match(/^[0-9]+$/))
        return parseInt(v);
    if(v.match(/^[0-9\.]+$/))
        return parseFloat(v);
    return v;
}

var USEROPTS = {
    theme                : getOrDefault("theme", "default"),
    css                  : getOrDefault("css", ""),
    layout               : getOrDefault("layout", "default"),
    synch                : getOrDefault("synch", true),
    hidevid              : getOrDefault("hidevid", false),
    show_timestamps      : getOrDefault("show_timestamps", true),
    modhat               : getOrDefault("modhat", false),
    blink_title          : getOrDefault("blink_title", false),
    sync_accuracy        : getOrDefault("sync_accuracy", 2),
    chatbtn              : getOrDefault("chatbtn", false),
    altsocket            : getOrDefault("altsocket", false),
    joinmessage          : getOrDefault("joinmessage", true),
    qbtn_hide            : getOrDefault("qbtn_hide", false),
    qbtn_idontlikechange : getOrDefault("qbtn_idontlikechange", false)
};

var Rank = {
    Guest: 0,
    Member: 1,
    Leader: 1.5,
    Moderator: 2,
    Admin: 3,
    Owner: 10,
    Siteadmin: 255
};

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

/* to be implemented in callbacks.js */
function setupCallbacks() { }
