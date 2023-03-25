var path = require("path");
var net = require("net");
var YAML = require("yamljs");

import { loadFromToml } from './configuration/configloader';
import { CamoConfig } from './configuration/camoconfig';
import { PrometheusConfig } from './configuration/prometheusconfig';
import { EmailConfig } from './configuration/emailconfig';
import { CaptchaConfig } from './configuration/captchaconfig';

const LOGGER = require('@calzoneman/jsli')('config');

var defaults = {
    mysql: {
        server: "localhost",
        port: 3306,
        database: "cytube3",
        user: "cytube3",
        password: "",
        "pool-size": 10
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
        "default-port": 8080,
        "root-domain": "localhost",
        "alt-domains": ["127.0.0.1"],
        minify: false,
        "max-age": "7d",
        gzip: true,
        "gzip-threshold": 1024,
        "cookie-secret": "change-me",
        index: {
            "max-entries": 50
        },
        "trust-proxies": [
            "loopback"
        ]
    },
    https: {
        enabled: false,
        domain: "https://localhost",
        "default-port": 8443,
        keyfile: "localhost.key",
        passphrase: "",
        certfile: "localhost.cert",
        cafile: "",
        ciphers: "HIGH:!DSS:!aNULL@STRENGTH"
    },
    io: {
        domain: "http://localhost",
        "default-port": 1337,
        "ip-connection-limit": 10,
        cors: {
            "allowed-origins": []
        }
    },
    "youtube-v3-key": "",
    "channel-path": "r",
    "channel-save-interval": 5,
    "max-channels-per-user": 5,
    "max-accounts-per-ip": 5,
    "guest-login-delay": 60,
    "max-chat-message-length": 320,
    aliases: {
        "purge-interval": 3600000,
        "max-age": 2592000000
    },
    "vimeo-workaround": false,
    "html-template": {
        title: "CyTube Beta", description: "Free, open source synchtube"
    },
    "reserved-names": {
        usernames: ["^(.*?[-_])?admin(istrator)?([-_].*)?$", "^(.*?[-_])?owner([-_].*)?$"],
        channels: ["^(.*?[-_])?admin(istrator)?([-_].*)?$", "^(.*?[-_])?owner([-_].*)?$"],
        pagetitles: []
    },
    "contacts": [],
    "aggressive-gc": false,
    playlist: {
        "max-items": 4000,
        "update-interval": 5
    },
    ffmpeg: {
        enabled: false,
        "ffprobe-exec": "ffprobe"
    },
    "link-domain-blacklist": [],
    setuid: {
        enabled: false,
        "group": "users",
        "user": "nobody",
        "timeout": 15
    },
    "service-socket": {
        enabled: false,
        socket: "service.sock"
    },
    "twitch-client-id": null,
    poll: {
        "max-options": 50
    }
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
            LOGGER.warn("Missing config key " + (path + "." + key) +
                        "; using default: " + JSON.stringify(def[key]));
            obj[key] = def[key];
        }
    }
}

var cfg = defaults;
let camoConfig = new CamoConfig();
let prometheusConfig = new PrometheusConfig();
let emailConfig = new EmailConfig();
let captchaConfig = new CaptchaConfig();

/**
 * Initializes the configuration from the given YAML file
 */
exports.load = function (file) {
    let absPath = path.join(__dirname, "..", file);
    try {
        cfg = YAML.load(absPath);
    } catch (e) {
        if (e.code === "ENOENT") {
            throw new Error(`No such file: ${absPath}`);
        } else {
            throw new Error(`Invalid config file ${absPath}: ${e}`);
        }
    }

    if (cfg == null) {
        throw new Error("Configuration parser returned null");
    }

    if (cfg.mail) {
        LOGGER.error(
            'Old style mail configuration found in config.yaml.  ' +
            'Email will not be delivered unless you copy conf/example/email.toml ' +
            'to conf/email.toml and edit it to your liking.  ' +
            'To remove this warning, delete the "mail:" block in config.yaml.'
        );
    }

    merge(cfg, defaults, "config");

    preprocessConfig(cfg);
    LOGGER.info("Loaded configuration from " + file);

    loadCamoConfig();
    loadPrometheusConfig();
    loadEmailConfig();
    loadCaptchaConfig();
};

function checkLoadConfig(configClass, filename) {
    try {
        return loadFromToml(
            configClass,
            path.resolve(__dirname, '..', 'conf', filename)
        );
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }

        if (typeof error.line !== 'undefined') {
            LOGGER.error(`Error in conf/${filename}: ${error} (line ${error.line})`);
        } else {
            LOGGER.error(`Error loading conf/${filename}: ${error.stack}`);
        }
    }
}

function loadCamoConfig() {
    const conf = checkLoadConfig(CamoConfig, 'camo.toml');

    if (conf === null) {
        LOGGER.info('No camo configuration found, chat images will not be proxied.');
        camoConfig = new CamoConfig();
    } else {
        camoConfig = conf;
        const enabled = camoConfig.isEnabled() ? 'ENABLED' : 'DISABLED';
        LOGGER.info(`Loaded camo configuration from conf/camo.toml.  Camo is ${enabled}`);
    }
}

function loadPrometheusConfig() {
    const conf = checkLoadConfig(PrometheusConfig, 'prometheus.toml');

    if (conf === null) {
        LOGGER.info('No prometheus configuration found, defaulting to disabled');
        prometheusConfig = new PrometheusConfig();
    } else {
        prometheusConfig = conf;
        const enabled = prometheusConfig.isEnabled() ? 'ENABLED' : 'DISABLED';
        LOGGER.info(
            'Loaded prometheus configuration from conf/prometheus.toml.  ' +
            `Prometheus listener is ${enabled}`
        );
    }
}

function loadEmailConfig() {
    const conf = checkLoadConfig(EmailConfig, 'email.toml');

    if (conf === null) {
        LOGGER.info('No email configuration found, defaulting to disabled');
        emailConfig = new EmailConfig();
    } else {
        emailConfig = conf;
        LOGGER.info('Loaded email configuration from conf/email.toml.');
    }
}

function loadCaptchaConfig() {
    const conf = checkLoadConfig(Object, 'captcha.toml');

    if (conf === null) {
        LOGGER.info('No captcha configuration found, defaulting to disabled');
        captchaConfig.load();
    } else {
        captchaConfig.load(conf);
        LOGGER.info('Loaded captcha configuration from conf/captcha.toml.');
    }
}

// I'm sorry
function preprocessConfig(cfg) {
    // Root domain should start with a . for cookies
    var root = cfg.http["root-domain"];
    if (/127\.0\.0\.1|localhost/.test(root)) {
        LOGGER.warn(
            "Detected 127.0.0.1 or localhost in root-domain '%s'.  This server " +
            "will not work from other computers!  Set root-domain to the domain " +
            "the website will be accessed from (e.g. example.com)",
            root
        );
    }
    if (/^http/.test(root)) {
        LOGGER.warn(
            "root-domain '%s' should not contain http:// or https://, removing it",
            root
        );
        root = root.replace(/^https?:\/\//, "");
    }
    if (/:\d+$/.test(root)) {
        LOGGER.warn(
            "root-domain '%s' should not contain a trailing port, removing it",
            root
        );
        root = root.replace(/:\d+$/, "");
    }
    root = root.replace(/^\.*/, "");
    cfg.http["root-domain"] = root;
    if (root.indexOf(".") !== -1 && !net.isIP(root)) {
        root = "." + root;
    }
    cfg.http["root-domain-dotted"] = root;

    // Debug
    if (process.env.DEBUG === "1" || process.env.DEBUG === "true") {
        cfg.debug = true;
    } else {
        cfg.debug = false;
    }

    // Strip trailing slashes from domains
    cfg.https.domain = cfg.https.domain.replace(/\/*$/, "");

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
                    LOGGER.error("Config Error: no URL defined for IPv6 " +
                                      "Socket.IO listener!  Ignoring this listener " +
                                      "because the Socket.IO client cannot connect to " +
                                      "a raw IPv6 address.");
                    LOGGER.error("(Listener was: " + JSON.stringify(srv) + ")");
                } else {
                    cfg.io["ipv6-ssl"] = srv.url;
                }
            } else if (!cfg.io["ipv6-nossl"]) {
                if (!srv.url) {
                    LOGGER.error("Config Error: no URL defined for IPv6 " +
                                      "Socket.IO listener!  Ignoring this listener " +
                                      "because the Socket.IO client cannot connect to " +
                                      "a raw IPv6 address.");
                    LOGGER.error("(Listener was: " + JSON.stringify(srv) + ")");
                } else {
                    cfg.io["ipv6-nossl"] = srv.url;
                }
            }
        }
    }

    cfg.io["ipv4-default"] = cfg.io["ipv4-ssl"] || cfg.io["ipv4-nossl"];
    cfg.io["ipv6-default"] = cfg.io["ipv6-ssl"] || cfg.io["ipv6-nossl"];

    if (/127\.0\.0\.1|localhost/.test(cfg.io["ipv4-default"])) {
        LOGGER.warn(
            "socket.io is bound to localhost, this server will be inaccessible " +
            "from other computers!"
        );
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

    /* Check channel path */
    if(!/^[-\w]+$/.test(cfg["channel-path"])){
        LOGGER.error("Channel paths may only use the same characters as usernames and channel names.");
        process.exit(78); // sysexits.h for bad config
    }

    if (cfg["link-domain-blacklist"].length > 0) {
        cfg["link-domain-blacklist-regex"] = new RegExp(
                cfg["link-domain-blacklist"].join("|").replace(/\./g, "\\."), "gi");
    } else {
        // Match nothing
        cfg["link-domain-blacklist-regex"] = new RegExp("$x^", "gi");
    }

    if (cfg["youtube-v3-key"]) {
        require("@cytube/mediaquery/lib/provider/youtube").setApiKey(
                cfg["youtube-v3-key"]);
    } else {
        LOGGER.warn("No YouTube v3 API key set.  YouTube links will " +
            "not work.  See youtube-v3-key in config.template.yaml and " +
            "https://developers.google.com/youtube/registering_an_application for " +
            "information on registering an API key.");
    }

    if (cfg["twitch-client-id"]) {
        require("@cytube/mediaquery/lib/provider/twitch-vod").setClientID(
                cfg["twitch-client-id"]);
        require("@cytube/mediaquery/lib/provider/twitch-clip").setClientID(
                cfg["twitch-client-id"]);
    } else {
        LOGGER.warn("No Twitch Client ID set.  Twitch VOD links will " +
            "not work.  See twitch-client-id in config.template.yaml and " +
            "https://github.com/justintv/Twitch-API/blob/master/authentication.md#developer-setup" +
            "for more information on registering a client ID");
    }

    // Remove calzoneman from contact config (old default)
    cfg.contacts = cfg.contacts.filter(contact => {
        return contact.name !== 'calzoneman';
    });

    if (!cfg.io.throttle) {
        cfg.io.throttle = {};
    }

    cfg.io.throttle = Object.assign({
        'in-rate-limit': Infinity
    }, cfg.io.throttle);
    cfg.io.throttle = Object.assign({
        'bucket-capacity': cfg.io.throttle['in-rate-limit']
    }, cfg.io.throttle);

    if (!cfg['channel-storage']) {
        cfg['channel-storage'] = { type: undefined };
    }

    if (cfg["max-chat-message-length"] > 1000) {
        LOGGER.warn("Max chat message length was greater than 1000. Setting to 1000.");
        cfg["max-chat-message-length"] = 1000;
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

/**
 * Sets a configuration value with the given key
 *
 * Accepts a dot-separated key for nested values, e.g. "http.port"
 * Throws an error if a nonexistant key is requested
 */
exports.set = function (key, value) {
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

    obj[current] = value;
};

exports.getCamoConfig = function getCamoConfig() {
    return camoConfig;
};

exports.getPrometheusConfig = function getPrometheusConfig() {
    return prometheusConfig;
};

exports.getEmailConfig = function getEmailConfig() {
    return emailConfig;
};

exports.getCaptchaConfig = function getCaptchaConfig() {
    return captchaConfig;
};
