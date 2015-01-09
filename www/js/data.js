var CL_VERSION = 3.0;

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
    name: false,
    usercount: 0,
    emotes: []
};

var PLAYER = false;
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
var CHATTHROTTLE = false;
var SCROLLCHAT = true;
var LASTCHAT = {
    name: ""
};
var FOCUSED = true;
var PAGETITLE = "CyTube";
var TITLE_BLINK;
var CHATSOUND = new Audio("/boop.wav");
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
    var v = NO_STORAGE ? readCookie(k) : localStorage.getItem(k);
    try {
        v = JSON.parse(v);
    } catch (e) { }
    return v;
}

function setOpt(k, v) {
    v = JSON.stringify(v);
    NO_STORAGE ? createCookie(k, v, 1000) : localStorage.setItem(k, v);
}

function getOrDefault(k, def) {
    var v = getOpt(k);
    if(v === null || v === "null")
        return def;
    if(v === "true")
        return true;
    if(v === "false")
        return false;
    if(v.match && v.match(/^[0-9]+$/))
        return parseInt(v);
    if(v.match && v.match(/^[0-9\.]+$/))
        return parseFloat(v);
    return v;
}

var USEROPTS = {
    theme                : getOrDefault("theme", "/css/themes/slate.css"),
    layout               : getOrDefault("layout", "fluid"),
    synch                : getOrDefault("synch", true),
    hidevid              : getOrDefault("hidevid", false),
    show_timestamps      : getOrDefault("show_timestamps", true),
    modhat               : getOrDefault("modhat", false),
    blink_title          : getOrDefault("blink_title", "onlyping"),
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
    sort_rank            : getOrDefault("sort_rank", true),
    sort_afk             : getOrDefault("sort_afk", false),
    default_quality      : getOrDefault("default_quality", ""),
    boop                 : getOrDefault("boop", "never"),
    secure_connection    : getOrDefault("secure_connection", false),
    show_shadowchat      : getOrDefault("show_shadowchat", false)
};

/* Backwards compatibility check */
if (USEROPTS.blink_title === true) {
    USEROPTS.blink_title = "always";
} else if (USEROPTS.blink_title === false) {
    USEROPTS.blink_title = "onlyping";
}
/* Last ditch */
if (["never", "onlyping", "always"].indexOf(USEROPTS.blink_title) === -1) {
    USEROPTS.blink_title = "onlyping";
}

if (USEROPTS.boop === true) {
    USEROPTS.boop = "onlyping";
} else if (USEROPTS.boop === false) {
    USEROPTS.boop = "never";
}
if (["never", "onlyping", "always"].indexOf(USEROPTS.boop) === -1) {
    USEROPTS.boop = "onlyping";
}

var VOLUME = parseFloat(getOrDefault("volume", 1));

var NO_WEBSOCKETS = USEROPTS.altsocket;
var NO_VIMEO = Boolean(location.host.match("cytu.be"));

var JSPREF = getOpt("channel_js_pref") || {};

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

(function () {
    var localVersion = parseFloat(getOpt("version"));
    if (isNaN(localVersion)) {
        USEROPTS.theme = "/css/themes/slate.css";
        USEROPTS.layout = "fluid";
        setOpt("theme", "/css/themes/slate.css");
        setOpt("layout", "fluid");
        setOpt("version", CL_VERSION);
    }
})();

/* to be implemented in callbacks.js */
function setupCallbacks() { }
