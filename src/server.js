const VERSION = require("../package.json").version;
var singleton = null;
var Config = require("./config");
var Promise = require("bluebird");
import * as ChannelStore from './channel-storage/channelstore';
import { EventEmitter } from 'events';
import { LoggerFactory } from '@calzoneman/jsli';

const LOGGER = LoggerFactory.getLogger('server');

module.exports = {
    init: function () {
        LOGGER.info("Starting CyTube v%s", VERSION);
        var chanlogpath = path.join(__dirname, "../chanlogs");
        fs.exists(chanlogpath, function (exists) {
            exists || fs.mkdirSync(chanlogpath);
        });

        var chandumppath = path.join(__dirname, "../chandump");
        fs.exists(chandumppath, function (exists) {
            exists || fs.mkdirSync(chandumppath);
        });

        var gdvttpath = path.join(__dirname, "../google-drive-subtitles");
        fs.exists(gdvttpath, function (exists) {
            exists || fs.mkdirSync(gdvttpath);
        });
        singleton = new Server();
        return singleton;
    },

    getServer: function () {
        return singleton;
    }
};

var path = require("path");
var fs = require("fs");
var http = require("http");
var https = require("https");
var express = require("express");
var Channel = require("./channel/channel");
var db = require("./database");
var Flags = require("./flags");
var sio = require("socket.io");
import LocalChannelIndex from './web/localchannelindex';
import { PartitionChannelIndex } from './partition/partitionchannelindex';
import IOConfiguration from './configuration/ioconfig';
import WebConfiguration from './configuration/webconfig';
import NullClusterClient from './io/cluster/nullclusterclient';
import session from './session';
import { LegacyModule } from './legacymodule';
import { PartitionModule } from './partition/partitionmodule';
import * as Switches from './switches';

var Server = function () {
    var self = this;
    self.channels = [],
    self.express = null;
    self.db = null;
    self.api = null;
    self.announcement = null;
    self.infogetter = null;
    self.servers = {};
    self.chanPath = Config.get('channel-path');

    // backend init
    var initModule;
    if (Config.get("new-backend")) {
        if (Config.get("dual-backend")) {
            Switches.setActive(Switches.DUAL_BACKEND, true);
        }
        const BackendModule = require('./backend/backendmodule').BackendModule;
        initModule = this.initModule = new BackendModule();
    } else if (Config.get('enable-partition')) {
        initModule = this.initModule = new PartitionModule();
        self.partitionDecider = initModule.getPartitionDecider();
    } else {
        initModule = this.initModule = new LegacyModule();
    }

    // database init ------------------------------------------------------
    var Database = require("./database");
    self.db = Database;
    self.db.init();
    ChannelStore.init();

    // webserver init -----------------------------------------------------
    const ioConfig = IOConfiguration.fromOldConfig(Config);
    const webConfig = WebConfiguration.fromOldConfig(Config);
    const clusterClient = initModule.getClusterClient();
    var channelIndex;
    if (Config.get("enable-partition")) {
        channelIndex = new PartitionChannelIndex(
                initModule.getRedisClientProvider().get()
        );
    } else {
        channelIndex = new LocalChannelIndex();
    }
    self.express = express();
    require("./web/webserver").init(self.express,
            webConfig,
            ioConfig,
            clusterClient,
            channelIndex,
            session);

    // http/https/sio server init -----------------------------------------
    var key = "", cert = "", ca = undefined;
    if (Config.get("https.enabled")) {
        const certData = self.loadCertificateData();
        key = certData.key;
        cert = certData.cert;
        ca = certData.ca;
    }

    var opts = {
        key: key,
        cert: cert,
        passphrase: Config.get("https.passphrase"),
        ca: ca,
        ciphers: Config.get("https.ciphers"),
        honorCipherOrder: true
    };

    Config.get("listen").forEach(function (bind) {
        var id = bind.ip + ":" + bind.port;
        if (id in self.servers) {
            LOGGER.warn("Ignoring duplicate listen address %s", id);
            return;
        }

        if (bind.https && Config.get("https.enabled")) {
            self.servers[id] = https.createServer(opts, self.express)
                                    .listen(bind.port, bind.ip);
            self.servers[id].on("clientError", function (err, socket) {
                try {
                    socket.destroy();
                } catch (e) {
                }
            });
        } else if (bind.http) {
            self.servers[id] = self.express.listen(bind.port, bind.ip);
            self.servers[id].on("clientError", function (err, socket) {
                try {
                    socket.destroy();
                } catch (e) {
                }
            });
        }
    });

    require("./io/ioserver").init(self, webConfig);

    // background tasks init ----------------------------------------------
    require("./bgtask")(self);

    // setuid
    require("./setuid");

    initModule.onReady();
};

Server.prototype = Object.create(EventEmitter.prototype);

Server.prototype.loadCertificateData = function loadCertificateData() {
    const data = {
        key: fs.readFileSync(path.resolve(__dirname, "..",
                                          Config.get("https.keyfile"))),
        cert: fs.readFileSync(path.resolve(__dirname, "..",
                                           Config.get("https.certfile")))
    };

    if (Config.get("https.cafile")) {
        data.ca = fs.readFileSync(path.resolve(__dirname, "..",
                                               Config.get("https.cafile")));
    }

    return data;
};

Server.prototype.reloadCertificateData = function reloadCertificateData() {
    const certData = this.loadCertificateData();
    Object.keys(this.servers).forEach(key => {
        const server = this.servers[key];
        // TODO: Replace with actual node API
        // once https://github.com/nodejs/node/issues/4464 is implemented.
        if (server._sharedCreds) {
            try {
                server._sharedCreds.context.setCert(certData.cert);
                server._sharedCreds.context.setKey(certData.key, Config.get("https.passphrase"));
                LOGGER.info('Reloaded certificate data for %s', key);
            } catch (error) {
                LOGGER.error('Failed to reload certificate data for %s: %s', key, error.stack);
            }
        }
    });
};

Server.prototype.getHTTPIP = function (req) {
    var ip = req.ip;
    if (ip === "127.0.0.1" || ip === "::1") {
        var fwd = req.header("x-forwarded-for");
        if (fwd && typeof fwd === "string") {
            return fwd;
        }
    }
    return ip;
};

Server.prototype.getSocketIP = function (socket) {
    var raw = socket.handshake.address.address;
    if (raw === "127.0.0.1" || raw === "::1") {
        var fwd = socket.handshake.headers["x-forwarded-for"];
        if (fwd && typeof fwd === "string") {
            return fwd;
        }
    }
    return raw;
};

Server.prototype.isChannelLoaded = function (name) {
    name = name.toLowerCase();
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].uniqueName == name)
            return true;
    }
    return false;
};

Server.prototype.getChannel = function (name) {
    var cname = name.toLowerCase();
    if (this.partitionDecider &&
            !this.partitionDecider.isChannelOnThisPartition(cname)) {
        const error = new Error(`Channel '${cname}' is mapped to a different partition`);
        error.code = 'EWRONGPART';
        throw error;
    }

    var self = this;
    for (var i = 0; i < self.channels.length; i++) {
        if (self.channels[i].uniqueName === cname)
            return self.channels[i];
    }

    var c = new Channel(name);
    c.on("empty", function () {
        self.unloadChannel(c);
    });
    c.waitFlag(Flags.C_ERROR, () => {
        self.unloadChannel(c, { skipSave: true });
    });
    self.channels.push(c);
    return c;
};

Server.prototype.unloadChannel = function (chan, options) {
    if (chan.dead) {
        return;
    }

    if (!options) {
        options = {};
    }

    if (!options.skipSave) {
        chan.saveState().catch(error => {
            LOGGER.error(`Failed to save /${this.chanPath}/${chan.name} for unload: ${error.stack}`);
        });
    }

    chan.logger.log("[init] Channel shutting down");
    chan.logger.close();

    chan.notifyModules("unload", []);
    Object.keys(chan.modules).forEach(function (k) {
        chan.modules[k].dead = true;
        /*
         * Automatically clean up any timeouts/intervals assigned
         * to properties of channel modules.  Prevents a memory leak
         * in case of forgetting to clear the timer on the "unload"
         * module event.
         */
        Object.keys(chan.modules[k]).forEach(function (prop) {
            if (chan.modules[k][prop] && chan.modules[k][prop]._onTimeout) {
                LOGGER.warn("Detected non-null timer when unloading " +
                        "module " + k + ": " + prop);
                try {
                    clearTimeout(chan.modules[k][prop]);
                    clearInterval(chan.modules[k][prop]);
                } catch (error) {
                    LOGGER.error(error.stack);
                }
            }
        });
    });

    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].uniqueName === chan.uniqueName) {
            this.channels.splice(i, 1);
            i--;
        }
    }

    LOGGER.info("Unloaded channel " + chan.name);
    chan.broadcastUsercount.cancel();
    // Empty all outward references from the channel
    var keys = Object.keys(chan);
    for (var i in keys) {
        if (keys[i] !== "refCounter") {
            delete chan[keys[i]];
        }
    }
    chan.dead = true;
};

Server.prototype.packChannelList = function (publicOnly, isAdmin) {
    var channels = this.channels.filter(function (c) {
        if (!publicOnly) {
            return true;
        }

        return c.modules.options && c.modules.options.get("show_public");
    });

    var self = this;
    return channels.map(function (c) {
        return c.packInfo(isAdmin);
    });
};

Server.prototype.announce = function (data) {
    this.setAnnouncement(data);

    if (data == null) {
        db.clearAnnouncement();
    } else {
        db.setAnnouncement(data);
    }

    this.emit("announcement", data);
};

Server.prototype.setAnnouncement = function (data) {
    if (data == null) {
        this.announcement = null;
    } else {
        this.announcement = data;
        sio.instance.emit("announcement", data);
    }
};

Server.prototype.shutdown = function () {
    LOGGER.info("Unloading channels");
    Promise.map(this.channels, channel => {
        try {
            return channel.saveState().tap(() => {
                LOGGER.info(`Saved /${this.chanPath}/${channel.name}`);
            }).catch(err => {
                LOGGER.error(`Failed to save /${this.chanPath}/${channel.name}: ${err.stack}`);
            });
        } catch (error) {
            LOGGER.error(`Failed to save channel: ${error.stack}`);
        }
    }, { concurrency: 5 }).then(() => {
        LOGGER.info("Goodbye");
        process.exit(0);
    }).catch(err => {
        LOGGER.error(`Caught error while saving channels: ${err.stack}`);
        process.exit(1);
    });
};

Server.prototype.handlePartitionMapChange = function () {
    const channels = Array.prototype.slice.call(this.channels);
    Promise.map(channels, channel => {
        if (channel.dead) {
            return;
        }

        if (!this.partitionDecider.isChannelOnThisPartition(channel.uniqueName)) {
            LOGGER.info("Partition changed for " + channel.uniqueName);
            return channel.saveState().then(() => {
                channel.broadcastAll("partitionChange",
                        this.partitionDecider.getPartitionForChannel(channel.uniqueName));
                const users = Array.prototype.slice.call(channel.users);
                users.forEach(u => {
                    try {
                        u.socket.disconnect();
                    } catch (error) {
                    }
                });
                this.unloadChannel(channel, { skipSave: true });
            }).catch(error => {
                LOGGER.error(`Failed to unload /${this.chanPath}/${channel.name} for ` +
                                  `partition map flip: ${error.stack}`);
            });
        }
    }, { concurrency: 5 }).then(() => {
        LOGGER.info("Partition reload complete");
    });
};

Server.prototype.reloadPartitionMap = function () {
    if (!Config.get("enable-partition")) {
        return;
    }

    this.initModule.getPartitionMapReloader().reload();
};
