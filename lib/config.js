var fs = require("fs");
var path = require("path");
var Logger = require("./logger");
var nodemailer = require("nodemailer");
var net = require("net");
var YAML = require("yamljs");

var defaults = {
    mysql: {
        server: "localhost",
        port: 3306,
        database: "cytube3",
        user: "cytube3",
        password: "",
    },
    listen: [
        {
            ip: "0.0.0.0",
            port: 8080,
            http: true,
        },
        {
            ip: "0.0.0.0",
            port: 1337,
            io: true
        }
    ],
    http: {
        domain: "http://localhost",
        "default-port": 8080,
        "root-domain": "localhost",
        "alt-domains": ["127.0.0.1"],
        minify: false,
        "max-age": "7d",
        gzip: true,
        "gzip-threshold": 1024,
        "cookie-secret": "change-me"
    },
    https: {
        enabled: false,
        domain: "https://localhost",
        "default-port": 8443,
        keyfile: "localhost.key",
        passphrase: "",
        certfile: "localhost.cert",
        cafile: "",
        ciphers: "HIGH:!DSS:!aNULL@STRENGTH",
        redirect: true
    },
    io: {
        domain: "http://localhost",
        "default-port": 1337,
        "ip-connection-limit": 10
    },
    mail: {
        enabled: false,
        /* the key "config" is omitted because the format depends on the
           service the owner is configuring for nodemailer */
        "from-address": "some.user@gmail.com",
        "from-name": "CyTube Services"
    },
    "youtube-v3-key": "",
    "channel-save-interval": 5,
    "max-channels-per-user": 5,
    "max-accounts-per-ip": 5,
    "guest-login-delay": 60,
    stats: {
        interval: 3600000,
        "max-age": 86400000
    },
    aliases: {
        "purge-interval": 3600000,
        "max-age": 2592000000
    },
    "vimeo-workaround": false,
    "vimeo-oauth": {
        enabled: false,
        "consumer-key": "",
        secret: ""
    },
    "html-template": {
        title: "CyTube Beta", description: "Free, open source synchtube"
    },
    "reserved-names": {
        usernames: ["^(.*?[-_])?admin(istrator)?([-_].*)?$", "^(.*?[-_])?owner([-_].*)?$"],
        channels: ["^(.*?[-_])?admin(istrator)?([-_].*)?$", "^(.*?[-_])?owner([-_].*)?$"],
        pagetitles: []
    },
    "contacts": [
        {
            name: "calzoneman",
            title: "Developer",
            email: "cyzon@cytu.be"
        }
    ],
    "aggressive-gc": false,
    playlist: {
        "max-items": 4000,
        "update-interval": 5
    },
    "channel-blacklist": [],
    ffmpeg: {
        enabled: false
    },
    "link-domain-blacklist": [],
    setuid: {
        enabled: false,
        "group": "users",
        "user": "nobody",
        "timeout": 15
    },
};

/**
 * Merges a config object with the defaults, warning about missing keys
 */
function merge(obj, def, path) {
    for (var key in def) {
        if (key in obj) {
            if (typeof obj[key] === "object") {
                merge(obj[key], def[key], path + "." + key);
            }
        } else {
            Logger.syslog.log("[WARNING] Missing config key " + (path + "." + key) +
                        "; using default: " + JSON.stringify(def[key]));
            obj[key] = def[key];
        }
    }
}

var cfg = defaults;

/**
 * Initializes the configuration from the given YAML file
 */
exports.load = function (file) {
    try {
        cfg = YAML.load(path.join(__dirname, "..", file));
    } catch (e) {
        if (e.code === "ENOENT") {
            Logger.syslog.log(file + " does not exist, assuming default configuration");
            cfg = defaults;
            return;
        } else {
            Logger.errlog.log("Error loading config file " + file + ": ");
            Logger.errlog.log(e);
            if (e.stack) {
                Logger.errlog.log(e.stack);
            }
            cfg = defaults;
            return;
        }
    }

    if (cfg == null) {
        Logger.syslog.log(file + " is an Invalid configuration file, " +
                          "assuming default configuration");
        cfg = defaults;
        return;
    }

    var mailconfig = {};
    if (cfg.mail && cfg.mail.config) {
        mailconfig = cfg.mail.config;
        delete cfg.mail.config;
    }
    merge(cfg, defaults, "config");
    cfg.mail.config = mailconfig;

    preprocessConfig(cfg);
    Logger.syslog.log("Loaded configuration from " + file);
};

function preprocessConfig(cfg) {
    /* Detect 3.0.0-style config and warng the user about it */
    if ("host" in cfg.http || "port" in cfg.http || "port" in cfg.https) {
        Logger.syslog.log("[WARN] The method of specifying which IP/port to bind has "+
                          "changed.  The config loader will try to handle this "+
                          "automatically, but you should read config.template.yaml "+
                          "and change your config.yaml to the new format.");
        cfg.listen = [
            {
                ip: cfg.http.host || "0.0.0.0",
                port: cfg.http.port,
                http: true
            },
            {
                ip: cfg.http.host || "0.0.0.0",
                port: cfg.io.port,
                io: true
            }
        ];

        if (cfg.https.enabled) {
            cfg.listen.push(
                {
                    ip: cfg.http.host || "0.0.0.0",
                    port: cfg.https.port,
                    https: true,
                    io: true
                }
            );
        }

        cfg.http["default-port"] = cfg.http.port;
        cfg.https["default-port"] = cfg.https.port;
        cfg.io["default-port"] = cfg.io.port;
    }
    // Root domain should start with a . for cookies
    var root = cfg.http["root-domain"];
    root = root.replace(/^\.*/, "");
    cfg.http["root-domain"] = root;
    if (root.indexOf(".") !== -1 && !net.isIP(root)) {
        root = "." + root;
    }
    cfg.http["root-domain-dotted"] = root;

    // Setup nodemailer
    cfg.mail.nodemailer = nodemailer.createTransport(
        cfg.mail.config
    );

    // Debug
    if (process.env.DEBUG === "1" || process.env.DEBUG === "true") {
        cfg.debug = true;
    } else {
        cfg.debug = false;
    }

    // Strip trailing slashes from domains
    cfg.http.domain = cfg.http.domain.replace(/\/*$/, "");
    cfg.https.domain = cfg.https.domain.replace(/\/*$/, "");

    // HTTP/HTTPS domains with port numbers
    if (!cfg.http["full-address"]) {
        var httpfa = cfg.http.domain;
        if (cfg.http["default-port"] !== 80) {
            httpfa += ":" + cfg.http["default-port"];
        }
        cfg.http["full-address"] = httpfa;
    }

    if (!cfg.https["full-address"]) {
        var httpsfa = cfg.https.domain;
        if (cfg.https["default-port"] !== 443) {
            httpsfa += ":" + cfg.https["default-port"];
        }
        cfg.https["full-address"] = httpsfa;
    }


    // Socket.IO URLs
    cfg.io["ipv4-nossl"] = "";
    cfg.io["ipv4-ssl"] = "";
    cfg.io["ipv6-nossl"] = "";
    cfg.io["ipv6-ssl"] = "";
    for (var i = 0; i < cfg.listen.length; i++) {
        var srv = cfg.listen[i];
        if (!srv.ip) {
            srv.ip = "0.0.0.0";
        }
        if (!srv.io) {
            continue;
        }

        if (srv.ip === "") {
            if (srv.port === cfg.io["default-port"]) {
                cfg.io["ipv4-nossl"] = cfg.io["domain"] + ":" + cfg.io["default-port"];
            } else if (srv.port === cfg.https["default-port"]) {
                cfg.io["ipv4-ssl"] = cfg.https["domain"] + ":" + cfg.https["default-port"];
            }
            continue;
        }

        if (net.isIPv4(srv.ip) || srv.ip === "::") {
            if (srv.https && !cfg.io["ipv4-ssl"]) {
                if (srv.url) {
                    cfg.io["ipv4-ssl"] = srv.url;
                } else {
                    cfg.io["ipv4-ssl"] = cfg.https["domain"] + ":" + srv.port;
                }
            } else if (!cfg.io["ipv4-nossl"]) {
                if (srv.url) {
                    cfg.io["ipv4-nossl"] = srv.url;
                } else {
                    cfg.io["ipv4-nossl"] = cfg.io["domain"] + ":" + srv.port;
                }
            }
        }
        if (net.isIPv6(srv.ip) || srv.ip === "::") {
            if (srv.https && !cfg.io["ipv6-ssl"]) {
                if (!srv.url) {
                    Logger.errlog.log("Config Error: no URL defined for IPv6 " +
                                      "Socket.IO listener!  Ignoring this listener " +
                                      "because the Socket.IO client cannot connect to " +
                                      "a raw IPv6 address.");
                    Logger.errlog.log("(Listener was: " + JSON.stringify(srv) + ")");
                } else {
                    cfg.io["ipv6-ssl"] = srv.url;
                }
            } else if (!cfg.io["ipv6-nossl"]) {
                if (!srv.url) {
                    Logger.errlog.log("Config Error: no URL defined for IPv6 " +
                                      "Socket.IO listener!  Ignoring this listener " +
                                      "because the Socket.IO client cannot connect to " +
                                      "a raw IPv6 address.");
                    Logger.errlog.log("(Listener was: " + JSON.stringify(srv) + ")");
                } else {
                    cfg.io["ipv6-nossl"] = srv.url;
                }
            }
        }
    }

    cfg.io["ipv4-default"] = cfg.io["ipv4-ssl"] || cfg.io["ipv4-nossl"];
    cfg.io["ipv6-default"] = cfg.io["ipv6-ssl"] || cfg.io["ipv6-nossl"];

    // sioconfig
    var sioconfig = "var IO_URLS={'ipv4-nossl':'" + cfg.io["ipv4-nossl"] + "'," +
                                 "'ipv4-ssl':'" + cfg.io["ipv4-ssl"] + "'," +
                                 "'ipv6-nossl':'" + cfg.io["ipv6-nossl"] + "'," +
                                 "'ipv6-ssl':'" + cfg.io["ipv6-ssl"] + "'};";
    cfg.sioconfig = sioconfig;

    // Generate RegExps for reserved names
    var reserved = cfg["reserved-names"];
    for (var key in reserved) {
        if (reserved[key] && reserved[key].length > 0) {
            reserved[key] = new RegExp(reserved[key].join("|"), "i");
        } else {
            reserved[key] = false;
        }
    }

    /* Convert channel blacklist to a hashtable */
    var tbl = {};
    cfg["channel-blacklist"].forEach(function (c) {
        tbl[c.toLowerCase()] = true;
    });
    cfg["channel-blacklist"] = tbl;

    if (cfg["link-domain-blacklist"].length > 0) {
        cfg["link-domain-blacklist-regex"] = new RegExp(
                cfg["link-domain-blacklist"].join("|").replace(/\./g, "\\."), "gi");
    } else {
        // Match nothing
        cfg["link-domain-blacklist-regex"] = new RegExp("$^", "gi");
    }

    if (cfg["youtube-v3-key"]) {
        require("cytube-mediaquery/lib/provider/youtube").setApiKey(
                cfg["youtube-v3-key"]);
    } else {
        Logger.errlog.log("Warning: No YouTube v3 API key set.  YouTube lookups will " +
            "fall back to the v2 API, which is scheduled for closure soon after " +
            "April 20, 2015.  See " +
            "https://developers.google.com/youtube/registering_an_application for " +
            "information on registering an API key.");
    }

    return cfg;
}

/**
 * Retrieves a configuration value with the given key
 *
 * Accepts a dot-separated key for nested values, e.g. "http.port"
 * Throws an error if a nonexistant key is requested
 */
exports.get = function (key) {
    var obj = cfg;
    var keylist = key.split(".");
    var current = keylist.shift();
    var path = current;
    while (keylist.length > 0) {
        if (!(current in obj)) {
            throw new Error("Nonexistant config key '" + path + "." + current + "'");
        }
        obj = obj[current];
        current = keylist.shift();
        path += "." + current;
    }

    return obj[current];
};
