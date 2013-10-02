/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var CL_VERSION = "2.4.3";

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
var SUPERADMIN = false;

var CHANNEL = {
    opts: {},
    openqueue: false,
    perms: {},
    css: "",
    js: "",
    motd: "",
    motd_text: "",
    name: false,
    usercount: 0
};

var PLAYER = false;
var VIDEOQUALITY = false;
var FLUIDLAYOUT = false;
var VWIDTH;
var VHEIGHT;
if($("#videowidth").length > 0) {
    VWIDTH = $("#videowidth").css("width").replace("px", "");
    VHEIGHT = ""+parseInt(parseInt(VWIDTH) * 9 / 16);
}
var REBUILDING = false;
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
var CHATSOUND = new Audio("assets/sounds/boop.wav");
var KICKED = false;
var NAME = readCookie("cytube_uname");
var SESSION = readCookie("cytube_session");
var LEADTMR = false;
var PL_FROM = "";
var PL_AFTER = "";
var PL_CURRENT = -1;
var PL_WAIT_SCROLL = false;
var FILTER_FROM = 0;
var FILTER_TO = 0;
var NO_STORAGE = typeof localStorage == "undefined" || localStorage === null;

function getOpt(k) {
    return NO_STORAGE ? readCookie(k) : localStorage.getItem(k);
}

function setOpt(k, v) {
    NO_STORAGE ? createCookie(k, v, 1000) : localStorage.setItem(k, v);
}

function getOrDefault(k, def) {
    var v = getOpt(k);
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
    wmode_transparent    : getOrDefault("wmode_transparent", true),
    chatbtn              : getOrDefault("chatbtn", false),
    altsocket            : getOrDefault("altsocket", false),
    joinmessage          : getOrDefault("joinmessage", true),
    qbtn_hide            : getOrDefault("qbtn_hide", false),
    qbtn_idontlikechange : getOrDefault("qbtn_idontlikechange", false),
    first_visit          : getOrDefault("first_visit", true),
    ignore_channelcss    : getOrDefault("ignore_channelcss", false),
    ignore_channeljs     : getOrDefault("ignore_channeljs", false),
    sort_rank            : getOrDefault("sort_rank", false),
    sort_afk             : getOrDefault("sort_afk", false),
    default_quality      : getOrDefault("default_quality", "#quality_auto"),
    boop                 : getOrDefault("boop", false),
    secure_connection    : getOrDefault("secure_connection", false)
};

var NO_WEBSOCKETS = USEROPTS.altsocket;

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
