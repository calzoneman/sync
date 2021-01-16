const VERSION = require("../package.json").version;
var singleton = null;
var Config = require("./config");
var Promise = require("bluebird");
import * as ChannelStore from './channel-storage/channelstore';
import { EventEmitter } from 'events';

const LOGGER = require('@calzoneman/jsli')('server');

module.exports = {
    init: function () {
        LOGGER.info("Starting CyTube v%s", VERSION);
        var chanlogpath = path.join(__dirname, "../chanlogs");
        fs.exists(chanlogpath, function (exists) {
            exists || fs.mkdirSync(chanlogpath);
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

const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const express = require("express");
const Channel = require("./channel/channel");
const db = require("./database");
const Flags = require("./flags");
const sio = require("socket.io");
import LocalChannelIndex from './web/localchannelindex';
import { PartitionChannelIndex } from './partition/partitionchannelindex';
import IOConfiguration from './configuration/ioconfig';
import WebConfiguration from './configuration/webconfig';
import session from './session';
import { LegacyModule } from './legacymodule';
import { PartitionModule } from './partition/partitionmodule';
import { Gauge } from 'prom-client';
import { EmailController } from './controller/email';
import { CaptchaController } from './controller/captcha';

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

    var initModule;
    if (Config.get('enable-partition')) {
        initModule = this.initModule = new PartitionModule();
        self.partitionDecider = initModule.getPartitionDecider();
    } else {
        initModule = this.initModule = new LegacyModule();
    }

    const globalMessageBus = this.initModule.getGlobalMessageBus();
    globalMessageBus.on('UserProfileChanged', this.handleUserProfileChange.bind(this));
    globalMessageBus.on('ChannelDeleted', this.handleChannelDelete.bind(this));
    globalMessageBus.on('ChannelRegistered', this.handleChannelRegister.bind(this));

    // database init ------------------------------------------------------
    var Database = require("./database");
    self.db = Database;
    self.db.init();
    ChannelStore.init();

    let emailTransport;
    if (Config.getEmailConfig().getPasswordReset().isEnabled()) {
        const smtpConfig = Config.getEmailConfig().getSmtp();
        emailTransport = require("nodemailer").createTransport({
            host: smtpConfig.getHost(),
            port: smtpConfig.getPort(),
            secure: smtpConfig.isSecure(),
            auth: {
                user: smtpConfig.getUser(),
                pass: smtpConfig.getPassword()
            }
        });
    } else {
        emailTransport = {
            sendMail() {
                throw new Error('Email is not enabled on this server');
            }
        };
    }

    const emailController = new EmailController(
        emailTransport,
        Config.getEmailConfig()
    );

    const captchaController = new CaptchaController(
        Config.getCaptchaConfig()
    );

    // webserver init -----------------------------------------------------
    const ioConfig = IOConfiguration.fromOldConfig(Config);
    const webConfig = WebConfiguration.fromOldConfig(Config);
    const clusterClient = initModule.getClusterClient();
    var channelIndex;
    if (Config.get("enable-partition")) {
        channelIndex = new PartitionChannelIndex(
                initModule.getRedisClientProvider().get(),
                initModule.getRedisClientProvider().get(),
                initModule.partitionConfig.getChannelIndexChannel()
        );
    } else {
        channelIndex = new LocalChannelIndex();
    }
    self.express = express();
    require("./web/webserver").init(
            self.express,
            webConfig,
            ioConfig,
            clusterClient,
            channelIndex,
            session,
            globalMessageBus,
            Config.getEmailConfig(),
            emailController,
            Config.getCaptchaConfig(),
            captchaController
    );

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
            self.servers[id] = https.createServer(opts, self.express);
            // 2 minute default copied from node <= 12.x
            self.servers[id].timeout = 120000;
            self.servers[id].listen(bind.port, bind.ip);
            self.servers[id].on("error", error => {
                if (error.code === "EADDRINUSE") {
                    LOGGER.fatal(
                        "Could not bind %s: address already in use.  Check " +
                        "whether another application has already bound this " +
                        "port, or whether another instance of this server " +
                        "is running.",
                        id
                    );
                    process.exit(1);
                }
            });
        } else if (bind.http) {
            self.servers[id] = http.createServer(self.express);
            // 2 minute default copied from node <= 12.x
            self.servers[id].timeout = 120000;
            self.servers[id].listen(bind.port, bind.ip);
            self.servers[id].on("error", error => {
                if (error.code === "EADDRINUSE") {
                    LOGGER.fatal(
                        "Could not bind %s: address already in use.  Check " +
                        "whether another application has already bound this " +
                        "port, or whether another instance of this server " +
                        "is running.",
                        id
                    );
                    process.exit(1);
                }
            });
        }
    });

    require("./io/ioserver").init(self, webConfig);

    // background tasks init ----------------------------------------------
    require("./bgtask")(self);

    // prometheus server
    const prometheusConfig = Config.getPrometheusConfig();
    if (prometheusConfig.isEnabled()) {
        require("./prometheus-server").init(prometheusConfig);
    }

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

Server.prototype.isChannelLoaded = function (name) {
    name = name.toLowerCase();
    for (var i = 0; i < this.channels.length; i++) {
        if (this.channels[i].uniqueName == name)
            return true;
    }
    return false;
};

const promActiveChannels = new Gauge({
    name: 'cytube_channels_num_active',
    help: 'Number of channels currently active'
});
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
    promActiveChannels.inc();
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
    var self = this;

    if (chan.dead || chan.dying) {
        return;
    }

    chan.dying = true;

    if (!options) {
        options = {};
    }

    if (!options.skipSave) {
        chan.saveState().catch(error => {
            LOGGER.error(`Failed to save /${this.chanPath}/${chan.name} for unload: ${error.stack}`);
        }).then(finishUnloading);
    } else {
        finishUnloading();
    }

    function finishUnloading() {
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

        for (var i = 0; i < self.channels.length; i++) {
            if (self.channels[i].uniqueName === chan.uniqueName) {
                self.channels.splice(i, 1);
                i--;
            }
        }

        LOGGER.info("Unloaded channel " + chan.name);
        chan.broadcastUsercount.cancel();
        // Empty all outward references from the channel
        Object.keys(chan).forEach(key => {
            if (key !== "refCounter") {
                delete chan[key];
            }
        });
        chan.dead = true;
        promActiveChannels.dec();
    }
};

Server.prototype.packChannelList = function (publicOnly, isAdmin) {
    var channels = this.channels.filter(function (c) {
        if (!publicOnly) {
            return true;
        }

        return c.modules.options && c.modules.options.get("show_public");
    });

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

Server.prototype.forceSave = function () {
    Promise.map(this.channels, async channel => {
        try {
            await channel.saveState();
            LOGGER.info(`Saved /${this.chanPath}/${channel.name}`);
        } catch (error) {
            LOGGER.error(
                'Failed to save /%s/%s: %s',
                this.chanPath,
                channel ? channel.name : '<undefined>',
                error.stack
            );
        }
    }, { concurrency: 5 }).then(() => {
        LOGGER.info('Finished save');
    });
};

Server.prototype.shutdown = function () {
    LOGGER.info("Unloading channels");
    Promise.map(this.channels, async channel => {
        try {
            await channel.saveState();
            LOGGER.info(`Saved /${this.chanPath}/${channel.name}`);
        } catch (error) {
            LOGGER.error(
                'Failed to save /%s/%s: %s',
                this.chanPath,
                channel ? channel.name : '<undefined>',
                error.stack
            );
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
    Promise.map(channels, async channel => {
        if (channel.dead) {
            return;
        }

        if (!this.partitionDecider.isChannelOnThisPartition(channel.uniqueName)) {
            LOGGER.info("Partition changed for " + channel.uniqueName);
            try {
                await channel.saveState();

                channel.broadcastAll(
                    "partitionChange",
                    this.partitionDecider.getPartitionForChannel(
                        channel.uniqueName
                    )
                );

                const users = Array.prototype.slice.call(channel.users);
                users.forEach(u => {
                    try {
                        u.socket.disconnect();
                    } catch (error) {
                        // Ignore
                    }
                });

                this.unloadChannel(channel, { skipSave: true });
            } catch (error) {
                LOGGER.error(
                    'Failed to unload /%s/%s for partition map flip: %s',
                    this.chanPath,
                    channel ? channel.name : '<undefined>',
                    error.stack
                );
            }
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

Server.prototype.handleUserProfileChange = function (event) {
    try {
        const lname = event.user.toLowerCase();

        // Probably not the most efficient thing in the world, but w/e
        // profile changes are not high volume
        this.channels.forEach(channel => {
            if (channel.dead) return;

            channel.users.forEach(user => {
                if (user.getLowerName() === lname && user.account.user) {
                    user.account.user.profile = {
                        image: event.profile.image,
                        text: event.profile.text
                    };

                    user.account.update();

                    channel.sendUserProfile(channel.users, user);

                    LOGGER.info(
                            'Updated profile for user %s in channel %s',
                            lname,
                            channel.name
                    );
                }
            });
        });
    } catch (error) {
        LOGGER.error('handleUserProfileChange failed: %s', error);
    }
};

Server.prototype.handleChannelDelete = function (event) {
    try {
        const lname = event.channel.toLowerCase();

        this.channels.forEach(channel => {
            if (channel.dead) return;

            if (channel.uniqueName === lname) {
                channel.clearFlag(Flags.C_REGISTERED);

                const users = Array.prototype.slice.call(channel.users);
                users.forEach(u => {
                    u.kick('Channel deleted');
                });

                if (!channel.dead && !channel.dying) {
                    channel.emit('empty');
                }

                LOGGER.info('Processed deleted channel %s', lname);
            }
        });
    } catch (error) {
        LOGGER.error('handleChannelDelete failed: %s', error);
    }
};

Server.prototype.handleChannelRegister = function (event) {
    try {
        const lname = event.channel.toLowerCase();

        this.channels.forEach(channel => {
            if (channel.dead) return;

            if (channel.uniqueName === lname) {
                channel.clearFlag(Flags.C_REGISTERED);

                const users = Array.prototype.slice.call(channel.users);
                users.forEach(u => {
                    u.kick('Channel reloading');
                });

                if (!channel.dead && !channel.dying) {
                    channel.emit('empty');
                }

                LOGGER.info('Processed registered channel %s', lname);
            }
        });
    } catch (error) {
        LOGGER.error('handleChannelRegister failed: %s', error);
    }
};
