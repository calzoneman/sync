var CL_VERSION = 3.0;
var GS_VERSION = 1.7; // Google Drive Userscript

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
    name: CHANNELNAME,
    usercount: 0,
    emotes: []
};

var PLAYER = false;
var LIVESTREAM_CHROMELESS = false;
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
var CHATHIST = [];
var CHATHISTIDX = 0;
var CHATTHROTTLE = false;
var CHATMAXSIZE = 100;
var SCROLLCHAT = true;
var IGNORE_SCROLL_EVENT = false;
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
var SOCKETIO_CONNECT_ERROR_COUNT = 0;
var HAS_CONNECTED_BEFORE = false;
var IMAGE_MATCH = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/gi;
var CyTube = {};
CyTube.ui = {
    suppressedAnnouncementId: getOpt("suppressed_announcement_id")
};
CyTube.featureFlag = {
    efficientEmotes: true
};
CyTube.channelCustomizations = {
    cssHash: null,
    jsHash: null
};
CyTube._internal_do_not_use_or_you_will_be_banned = {};

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

var IGNORED = getOrDefault("ignorelist", []);

var USEROPTS = {
    theme                : getOrDefault("theme", DEFAULT_THEME), // Set in head template
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
    qbtn_hide            : getOrDefault("qbtn_hide", false),
    qbtn_idontlikechange : getOrDefault("qbtn_idontlikechange", false),
    first_visit          : getOrDefault("first_visit", true),
    ignore_channelcss    : getOrDefault("ignore_channelcss", false),
    ignore_channeljs     : getOrDefault("ignore_channeljs", false),
    sort_rank            : getOrDefault("sort_rank", true),
    sort_afk             : getOrDefault("sort_afk", false),
    default_quality      : getOrDefault("default_quality", "auto"),
    boop                 : getOrDefault("boop", "never"),
    show_shadowchat      : getOrDefault("show_shadowchat", false),
    emotelist_sort       : getOrDefault("emotelist_sort", true),
    no_emotes            : getOrDefault("no_emotes", false),
    strip_image          : getOrDefault("strip_image", false),
    chat_tab_method      : getOrDefault("chat_tab_method", "Cycle options"),
    notifications        : getOrDefault("notifications", "never"),
    show_ip_in_tooltip   : getOrDefault("show_ip_in_tooltip", true)
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

// As of 3.8, preferred quality names are different
(function () {
    var fix = {
        small: "240",
        medium: "360",
        large: "480",
        hd720: "720",
        hd1080: "1080",
        highres: "best"
    };

    if (fix.hasOwnProperty(USEROPTS.default_quality)) {
        USEROPTS.default_quality = fix[USEROPTS.default_quality];
    }
})();

var VOLUME = parseFloat(getOrDefault("volume", 1));

var NO_WEBSOCKETS = USEROPTS.altsocket;
var NO_VIMEO = Boolean(location.host.match("cytu.be"));

var JSPREF = getOpt("channel_js_pref") || {};
// Dunno why this happens
if (typeof JSPREF !== "object" || JSPREF === null) {
    try {
        JSPREF = JSON.parse(JSPREF);
    } catch (e) {
        console.error("JSPREF is bugged: " + e + " (" + JSPREF + ")");
        JSPREF = {};
        setOpt("channel_js_pref", JSPREF);
    }
}

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
        USEROPTS.theme = DEFAULT_THEME;
        USEROPTS.layout = "fluid";
        setOpt("theme", DEFAULT_THEME);
        setOpt("layout", "fluid");
        setOpt("version", CL_VERSION);
    }
})();

/* to be implemented in callbacks.js */
function setupCallbacks() { }
