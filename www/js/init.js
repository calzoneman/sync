/* Local client data */
var RANK = -1;
var LEADER = false;
var LEADTIMER = false;
var PL_DRAGFROM = false;
var PL_DRAGTO = false;
var PL_CURRENT
var NAME = false;
var LOGGEDIN = false;
var SUPERADMIN = false;
/* Channel data */
var CHANNEL = {
    opts: {},
    openqueue: false,
    perms: {},
    css: '',
    js: '',
    motd: '',
    motd_text: '',
    name: false,
    usercount: 0
};

/* Video player data */
var PLAYER = false;

/* Chat data */
var IGNORED = [];
var CHATHIST = [];
var CHATTHROTTLE = false;
var SCROLLCHAT = true;
var LASTCHATNAME = false;
var LASTCHATTIME = 0;
var CHATSOUND = new Audio('/sounds/boop.wav');

/* Page data */
var FOCUSED = true;
var PAGETITLE = 'CyTube';
var TITLE_BLINK = false;

/* Playlist data */
var PLAYLIST = {
    from: false,
    to: false,
    current: false,
    waitScroll: false
};

/* Check if localStorage is available */
var NOSTORAGE = typeof localStorage === 'undefined' || localStorage === null;

/**
 * Retrieve an option from localStorage, or from a cookie
 * if localStorage is not available
 */
 function getOpt(k) {
    return NOSTORAGE ? readCookie(k) : localStorage.getItem(k);
 }

/**
 * Save an option to localStorage, or to a cookie
 * if localStorage is not available
 */
function setOpt(k, v) {
    if (NOSTORAGE) {
        setCookie(k, v, 1000)
    } else {
        localStorage.setItem(k, v);
    }
}

/**
 * Retrieve a stored value, or return the default if the stored value
 * is null.  Also handles parsing of values stored as strings.
 */
function getOrDefault(k, def) {
    var v = getOpt(k);
    if (v == null) {
        return def;
    } else if (v === 'true') {
        return true;
    } else if (v === 'false') {
        return false;
    } else if (v.match(/^\d+$/)) {
        return parseInt(v);
    } else if (v.match(/^[\d\.]+$/)) {
        return parseFloat(v);
    } else {
        return v;
    }
}

/* User options */
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

/**
 * Set a cookie with the provided name, value, and expiration time
 */
function setCookie(name,value,days) {
    if (days) {
        var date = new Date();
        date.setTime(date.getTime()+(days*24*60*60*1000));
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    document.cookie = name+"="+value+expires+"; path=/";
}

/**
 * Read a cookie with the provided name
 */
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

/**
 * Erase a cookie
 */
function eraseCookie(name) {
    createCookie(name,"",-1);
}
