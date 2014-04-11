/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");
var path = require("path");
var Logger = require("./logger");
var nodemailer = require("nodemailer");
var YAML = require("yamljs");

var defaults = {
    mysql: {
        server: "localhost",
        database: "cytube3",
        user: "cytube3",
        password: ""
    },
    listen: [
        {
            ip: "",
            port: 8080,
            http: true,
        },
        {
            ip: "",
            port: 1337,
            io: true
        }
    ],
    http: {
        domain: "http://localhost",
        "root-domain": "localhost",
        "alt-domains": ["127.0.0.1"],
        minify: false,
        "cache-ttl": 0
    },
    https: {
        domain: "https://localhost",
        keyfile: "localhost.key",
        passphrase: "",
        certfile: "localhost.cert",
        cafile: ""
    },
    io: {
        domain: "http://localhost",
        "ip-connection-limit": 10
    },
    mail: {
        enabled: false,
        transport: "SMTP",
        /* the key "config" is omitted because the format depends on the
           service the owner is configuring for nodemailer */
        "from-address": "some.user@gmail.com"
    },
    "youtube-v2-key": "",
    "channel-save-interval": 5,
    "max-channels-per-user": 5,
    "max-accounts-per-ip": 5,
    "guest-login-delay": 60,
    "enable-tor-blocker": true,
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
    "aggressive-gc": false
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
    // Root domain should start with a . for cookies
    var root = cfg.http["root-domain"];
    root = root.replace(/^\.*/, "");
    cfg.http["root-domain"] = root;
    if (root.indexOf(".") !== -1) {
        root = "." + root;
    }
    cfg.http["root-domain-dotted"] = root;

    // Setup nodemailer
    cfg.mail.nodemailer = nodemailer.createTransport(
        cfg.mail.transport,
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
        if (cfg.http.port !== 80) {
            httpfa += ":" + cfg.http.port;
        }
        cfg.http["full-address"] = httpfa;
    }

    if (!cfg.https["full-address"]) {
        var httpsfa = cfg.https.domain;
        if (cfg.https.port !== 443) {
            httpsfa += ":" + cfg.https.port;
        }
        cfg.https["full-address"] = httpsfa;
    }

    // Generate RegExps for reserved names
    var reserved = cfg["reserved-names"];
    for (var key in reserved) {
        if (reserved[key] && reserved[key].length > 0) {
            reserved[key] = new RegExp(reserved[key].join("|"), "i");
        } else {
            reserved[key] = false;
        }
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
