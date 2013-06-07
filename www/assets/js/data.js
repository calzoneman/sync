var CLIENT = {
    rank: -1,
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
};

var PLAYER = false;
var VWIDTH = $("#ytapiplayer").parent().css("width").replace("px", "");
var VHEIGHT = ""+parseInt(parseInt(VWIDTH) * 9 / 16);
var POSITION = -1;
var socket;
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

function getOrDefault(k, def) {
    var v = localStorage.getItem(k);
    if(v === null)
        return def;
    if(v === "true")
        return true;
    if(v === "false")
        return false;
    if(v.match(/[0-9]+/))
        return parseInt(v);
    if(v.match(/[0-9\.]+/))
        return parseFloat(v);
    return v;
}

var USEROPTS = {
    theme           : getOrDefault("theme", "default"),
    css             : getOrDefault("css", ""),
    layout          : getOrDefault("layout", "default"),
    synch           : getOrDefault("synch", true),
    hidevid         : getOrDefault("hidevid", false),
    show_timestamps : getOrDefault("show_timestamps", true),
    modhat          : getOrDefault("modhat", false),
    blink_title     : getOrDefault("blink_title", false),
    sync_accuracy   : getOrDefault("sync_accuracy", 2),
    chatbtn         : getOrDefault("chatbtn", false),
    altsocket       : getOrDefault("altsocket", false)
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
