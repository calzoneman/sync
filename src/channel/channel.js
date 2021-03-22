var ChannelModule = require("./module");
var Flags = require("../flags");
var fs = require("fs");
var path = require("path");
var sio = require("socket.io");
var db = require("../database");
import * as ChannelStore from '../channel-storage/channelstore';
import { ChannelStateSizeError } from '../errors';
import { EventEmitter } from 'events';
import { throttle } from '../util/throttle';
import Logger from '../logger';

const LOGGER = require('@calzoneman/jsli')('channel');

const USERCOUNT_THROTTLE = 10000;

class ReferenceCounter {
    constructor(channel) {
        this.channel = channel;
        this.channelName = channel.name;
        this.refCount = 0;
        this.references = {};
    }

    ref(caller) {
        if (caller) {
            if (this.references.hasOwnProperty(caller)) {
                this.references[caller]++;
            } else {
                this.references[caller] = 1;
            }
        }

        this.refCount++;
    }

    unref(caller) {
        if (caller) {
            if (this.references.hasOwnProperty(caller)) {
                this.references[caller]--;
                if (this.references[caller] === 0) {
                    delete this.references[caller];
                }
            } else {
                LOGGER.error("ReferenceCounter::unref() called by caller [" +
                        caller + "] but this caller had no active references! " +
                        `(channel: ${this.channelName})`);
                return;
            }
        }

        this.refCount--;
        this.checkRefCount();
    }

    checkRefCount() {
        if (this.refCount === 0) {
            if (Object.keys(this.references).length > 0) {
                LOGGER.error("ReferenceCounter::refCount reached 0 but still had " +
                        "active references: " +
                        JSON.stringify(Object.keys(this.references)) +
                        ` (channel: ${this.channelName})`);
                for (var caller in this.references) {
                    this.refCount += this.references[caller];
                }
            } else if (this.channel.users && this.channel.users.length > 0) {
                LOGGER.error("ReferenceCounter::refCount reached 0 but still had " +
                        this.channel.users.length + " active users" +
                        ` (channel: ${this.channelName})`);
                this.refCount = this.channel.users.length;
            } else {
                this.channel.emit("empty");
            }
        }
    }
}

function Channel(name) {
    this.name = name;
    this.uniqueName = name.toLowerCase();
    this.modules = {};
    this.logger = new Logger.Logger(
        path.join(
            __dirname, "..", "..", "chanlogs", this.uniqueName + ".log"
        )
    );
    this.users = [];
    this.refCounter = new ReferenceCounter(this);
    this.flags = 0;
    this.id = 0;
    this.ownerName = null;
    this.broadcastUsercount = throttle(() => {
        this.broadcastAll("usercount", this.users.length);
    }, USERCOUNT_THROTTLE);
    const self = this;
    db.channels.load(this, function (err) {
        if (err && err !== "Channel is not registered") {
            self.emit("loadFail", "Failed to load channel data from the database.  Please try again later.");
            self.setFlag(Flags.C_ERROR);
        } else {
            self.initModules();
            self.loadState();
            db.channels.updateLastLoaded(self.id);
        }
    });
}

Channel.prototype = Object.create(EventEmitter.prototype);

Channel.prototype.is = function (flag) {
    return Boolean(this.flags & flag);
};

Channel.prototype.setFlag = function (flag) {
    this.flags |= flag;
    this.emit("setFlag", flag);
};

Channel.prototype.clearFlag = function (flag) {
    this.flags &= ~flag;
    this.emit("clearFlag", flag);
};

Channel.prototype.waitFlag = function (flag, cb) {
    var self = this;
    if (self.is(flag)) {
        cb();
    } else {
        var wait = function (f) {
            if (f === flag) {
                self.removeListener("setFlag", wait);
                cb();
            }
        };
        self.on("setFlag", wait);
    }
};

Channel.prototype.moderators = function () {
    return this.users.filter(function (u) {
        return u.account.effectiveRank >= 2;
    });
};

Channel.prototype.initModules = function () {
    const modules = {
        "./permissions"   : "permissions",
        "./emotes"        : "emotes",
        "./chat"          : "chat",
        "./drink"         : "drink",
        "./filters"       : "filters",
        "./customization" : "customization",
        "./opts"          : "options",
        "./library"       : "library",
        "./playlist"      : "playlist",
        "./mediarefresher": "mediarefresher",
        "./voteskip"      : "voteskip",
        "./poll"          : "poll",
        "./kickban"       : "kickban",
        "./ranks"         : "rank",
        "./accesscontrol" : "password",
        "./anonymouscheck": "anoncheck"
    };

    var self = this;
    var inited = [];
    Object.keys(modules).forEach(function (m) {
        var ctor = require(m);
        var module = new ctor(self);
        self.modules[modules[m]] = module;
        inited.push(modules[m]);
    });

    self.logger.log("[init] Loaded modules: " + inited.join(", "));
};

Channel.prototype.loadState = function () {
    /* Don't load from disk if not registered */
    if (!this.is(Flags.C_REGISTERED)) {
        this.modules.permissions.loadUnregistered();
        this.setFlag(Flags.C_READY);
        return;
    }

    const self = this;
    function errorLoad(msg, suggestTryAgain = true) {
        const extra = suggestTryAgain ? "  Please try again later." : "";
        self.emit("loadFail", "Failed to load channel data from the database: " +
                msg + extra);
        self.setFlag(Flags.C_ERROR);
    }

    ChannelStore.load(this.id, this.uniqueName).then(data => {
        Object.keys(this.modules).forEach(m => {
            try {
                this.modules[m].load(data);
            } catch (e) {
                LOGGER.error("Failed to load module " + m + " for channel " +
                        this.uniqueName);
            }
        });

        this.setFlag(Flags.C_READY);
    }).catch(ChannelStateSizeError, err => {
        const message = "This channel's state size has exceeded the memory limit " +
                "enforced by this server.  Please contact an administrator " +
                "for assistance.";

        LOGGER.error(err.stack);
        errorLoad(message, false);
    }).catch(err => {
        if (err.code === 'ENOENT') {
            Object.keys(this.modules).forEach(m => {
                this.modules[m].load({});
            });
            this.setFlag(Flags.C_READY);
            return;
        } else {
            const message = "An error occurred when loading this channel's data from " +
                    "disk.  Please contact an administrator for assistance.  " +
                    `The error was: ${err}.`;

            LOGGER.error(err.stack);
            errorLoad(message);
        }
    });
};

Channel.prototype.saveState = async function () {
    if (!this.is(Flags.C_REGISTERED)) {
        return;
    } else if (!this.is(Flags.C_READY)) {
        throw new Error(
            `Attempted to save channel ${this.name} ` +
            `but it wasn't finished loading yet!`
        );
    }

    if (this.is(Flags.C_ERROR)) {
        throw new Error(`Channel is in error state`);
    }

    this.logger.log("[init] Saving channel state to disk");

    const data = {};
    Object.keys(this.modules).forEach(m => {
        if (
            this.modules[m].dirty ||
            !this.modules[m].supportsDirtyCheck
        ) {
            this.modules[m].save(data);
        } else {
            LOGGER.debug(
                "Skipping save for %s[%s]: not dirty",
                this.uniqueName,
                m
            );
        }
    });

    try {
        await ChannelStore.save(this.id, this.uniqueName, data);

        Object.keys(this.modules).forEach(m => {
            this.modules[m].dirty = false;
        });
    } catch (error) {
        if (error instanceof ChannelStateSizeError) {
            this.users.forEach(u => {
                if (u.account.effectiveRank >= 2) {
                    u.socket.emit("warnLargeChandump", {
                        limit: error.limit,
                        actual: error.actual
                    });
                }
            });
        }

        throw error;
    }
};

Channel.prototype.checkModules = function (fn, args, cb) {
    const self = this;
    const refCaller = `Channel::checkModules/${fn}`;
    this.waitFlag(Flags.C_READY, function () {
        if (self.dead) return;

        self.refCounter.ref(refCaller);
        var keys = Object.keys(self.modules);
        var next = function (err, result) {
            if (result !== ChannelModule.PASSTHROUGH) {
                /* Either an error occured, or the module denied the user access */
                cb(err, result);
                self.refCounter.unref(refCaller);
                return;
            }

            var m = keys.shift();
            if (m === undefined) {
                /* No more modules to check */
                cb(null, ChannelModule.PASSTHROUGH);
                self.refCounter.unref(refCaller);
                return;
            }

            if (!self.modules) {
                LOGGER.warn(
                    'checkModules(%s): self.modules is undefined; dead=%s,' +
                    ' current=%s, remaining=%s',
                    fn,
                    self.dead,
                    m,
                    keys
                );
                return;
            }

            var module = self.modules[m];
            module[fn].apply(module, args);
        };

        args.push(next);
        process.nextTick(next, null, ChannelModule.PASSTHROUGH);
    });
};

Channel.prototype.notifyModules = function (fn, args) {
    var self = this;
    this.waitFlag(Flags.C_READY, function () {
        if (self.dead) return;
        var keys = Object.keys(self.modules);
        keys.forEach(function (k) {
            self.modules[k][fn].apply(self.modules[k], args);
        });
    });
};

Channel.prototype.joinUser = function (user, data) {
    const self = this;

    self.refCounter.ref("Channel::user");
    self.waitFlag(Flags.C_READY, function () {

        /* User closed the connection before the channel finished loading */
        if (user.socket.disconnected) {
            self.refCounter.unref("Channel::user");
            return;
        }

        user.channel = self;
        user.waitFlag(Flags.U_LOGGED_IN, () => {
            if (self.dead) {
                LOGGER.warn(
                    'Got U_LOGGED_IN for %s after channel already unloaded',
                    user.getName()
                );
                return;
            }

            if (user.is(Flags.U_REGISTERED)) {
                db.channels.getRank(self.name, user.getName(), (error, rank) => {
                    if (!error) {
                        user.setChannelRank(rank);
                        user.setFlag(Flags.U_HAS_CHANNEL_RANK);
                        if (user.inChannel()) {
                            self.broadcastAll("setUserRank", {
                                name: user.getName(),
                                rank: user.account.effectiveRank
                            });
                        }
                    }
                });
            }
        });

        if (user.socket.disconnected) {
            self.refCounter.unref("Channel::user");
            return;
        } else if (self.dead) {
            return;
        }

        self.checkModules("onUserPreJoin", [user, data], function (err, result) {
            if (result === ChannelModule.PASSTHROUGH) {
                user.channel = self;
                self.acceptUser(user);
            } else {
                user.channel = null;
                user.account.channelRank = 0;
                user.account.effectiveRank = user.account.globalRank;
                self.refCounter.unref("Channel::user");
            }
        });
    });
};

Channel.prototype.acceptUser = function (user) {
    user.setFlag(Flags.U_IN_CHANNEL);
    user.socket.join(this.name);
    user.autoAFK();
    user.socket.on("readChanLog", this.handleReadLog.bind(this, user));

    LOGGER.info(user.realip + " joined " + this.name);
    if (user.socket.context.torConnection) {
        if (this.modules.options && this.modules.options.get("torbanned")) {
            user.kick("This channel has banned connections from Tor.");
            this.logger.log("[login] Blocked connection from Tor exit at " +
                            user.displayip);
            return;
        }

        this.logger.log("[login] Accepted connection from Tor exit at " +
                        user.displayip);
    } else {
        this.logger.log("[login] Accepted connection from " + user.displayip);
    }

    var self = this;
    user.waitFlag(Flags.U_LOGGED_IN, function () {
        for (var i = 0; i < self.users.length; i++) {
            if (self.users[i] !== user &&
                self.users[i].getLowerName() === user.getLowerName()) {
                self.users[i].kick("Duplicate login");
            }
        }

        var loginStr = "[login] " + user.displayip + " logged in as " + user.getName();
        if (user.account.globalRank === 0) loginStr += " (guest)";
        loginStr += " (aliases: " + user.account.aliases.join(",") + ")";
        self.logger.log(loginStr);
        self.sendUserJoin(self.users, user);
        if (user.getName().toLowerCase() === self.ownerName) {
            db.channels.updateOwnerLastSeen(self.id);
        }
    });

    this.users.push(user);

    user.socket.on("disconnect", this.partUser.bind(this, user));
    Object.keys(this.modules).forEach(function (m) {
        if (user.dead) return;
        self.modules[m].onUserPostJoin(user);
    });

    this.sendUserlist([user]);

    // Managing this from here is not great, but due to the sequencing involved
    // and the limitations of the existing design, it'll have to do.
    if (this.modules.playlist.leader !== null) {
        user.socket.emit("setLeader", this.modules.playlist.leader.getName());
    }

    this.broadcastUsercount();
    if (!this.is(Flags.C_REGISTERED)) {
        user.socket.emit("channelNotRegistered");
    }

    user.on('afk', function(afk){
        self.sendUserMeta(self.users, user);
        // TODO: Drop legacy setAFK frame after a few months
        self.broadcastAll("setAFK", { name: user.getName(), afk: afk });
    });
    user.on("effectiveRankChange", (newRank, oldRank) => {
        this.maybeResendUserlist(user, newRank, oldRank);
    });
};

Channel.prototype.partUser = function (user) {
    if (!this.logger) {
        LOGGER.error("partUser called on dead channel");
        return;
    }

    this.logger.log("[login] " + user.displayip + " (" + user.getName() + ") " +
                    "disconnected.");
    user.channel = null;
    /* Should be unnecessary because partUser only occurs if the socket dies */
    user.clearFlag(Flags.U_IN_CHANNEL);

    if (user.is(Flags.U_LOGGED_IN)) {
        this.broadcastAll("userLeave", { name: user.getName() });
    }

    var idx = this.users.indexOf(user);
    if (idx >= 0) {
        this.users.splice(idx, 1);
    }

    var self = this;
    Object.keys(this.modules).forEach(function (m) {
        self.modules[m].onUserPart(user);
    });
    this.broadcastUsercount();

    this.refCounter.unref("Channel::user");
    user.die();
};

Channel.prototype.maybeResendUserlist = function maybeResendUserlist(user, newRank, oldRank) {
    if ((newRank >= 2 && oldRank < 2)
            || (newRank < 2 && oldRank >= 2)
            || (newRank >= 255 && oldRank < 255)
            || (newRank < 255 && oldRank >= 255)) {
        this.sendUserlist([user]);
    }
};

Channel.prototype.packUserData = function (user) {
    var base = {
        name: user.getName(),
        rank: user.account.effectiveRank,
        profile: user.account.profile,
        meta: {
            afk: user.is(Flags.U_AFK),
            muted: user.is(Flags.U_MUTED) && !user.is(Flags.U_SMUTED)
        }
    };

    var mod = {
        name: user.getName(),
        rank: user.account.effectiveRank,
        profile: user.account.profile,
        meta: {
            afk: user.is(Flags.U_AFK),
            muted: user.is(Flags.U_MUTED),
            smuted: user.is(Flags.U_SMUTED),
            aliases: user.account.aliases,
            ip: user.displayip
        }
    };

    var sadmin = {
        name: user.getName(),
        rank: user.account.effectiveRank,
        profile: user.account.profile,
        meta: {
            afk: user.is(Flags.U_AFK),
            muted: user.is(Flags.U_MUTED),
            smuted: user.is(Flags.U_SMUTED),
            aliases: user.account.aliases,
            ip: user.realip
        }
    };

    return {
        base: base,
        mod: mod,
        sadmin: sadmin
    };
};

Channel.prototype.sendUserMeta = function (users, user, minrank) {
    var self = this;
    var userdata = self.packUserData(user);
    users.filter(function (u) {
        return typeof minrank !== "number" || u.account.effectiveRank >= minrank;
    }).forEach(function (u) {
        if (u.account.globalRank >= 255)  {
            u.socket.emit("setUserMeta", {
                name: user.getName(),
                meta: userdata.sadmin.meta
            });
        } else if (u.account.effectiveRank >= 2) {
            u.socket.emit("setUserMeta", {
                name: user.getName(),
                meta: userdata.mod.meta
            });
        } else {
            u.socket.emit("setUserMeta", {
                name: user.getName(),
                meta: userdata.base.meta
            });
        }
    });
};

Channel.prototype.sendUserProfile = function (users, user) {
    var packet = {
        name: user.getName(),
        profile: user.account.profile
    };

    users.forEach(function (u) {
        u.socket.emit("setUserProfile", packet);
    });
};

Channel.prototype.sendUserlist = function (toUsers) {
    var self = this;
    var base = [];
    var mod = [];
    var sadmin = [];

    for (var i = 0; i < self.users.length; i++) {
        var u = self.users[i];
        if (u.getName() === "") {
            continue;
        }

        var data = self.packUserData(self.users[i]);
        base.push(data.base);
        mod.push(data.mod);
        sadmin.push(data.sadmin);
    }

    toUsers.forEach(function (u) {
        if (u.account.globalRank >= 255) {
            u.socket.emit("userlist", sadmin);
        } else if (u.account.effectiveRank >= 2) {
            u.socket.emit("userlist", mod);
        } else {
            u.socket.emit("userlist", base);
        }

        if (self.leader != null) {
            u.socket.emit("setLeader", self.leader.name);
        }
    });
};

Channel.prototype.sendUsercount = function (users) {
    var self = this;
    if (users === self.users) {
        self.broadcastAll("usercount", self.users.length);
    } else {
        users.forEach(function (u) {
            u.socket.emit("usercount", self.users.length);
        });
    }
};

Channel.prototype.sendUserJoin = function (users, user) {
    var self = this;
    if (user.account.aliases.length === 0) {
        user.account.aliases.push(user.getName());
    }

    var data = self.packUserData(user);

    users.forEach(function (u) {
        if (u.account.globalRank >= 255) {
            u.socket.emit("addUser", data.sadmin);
        } else if (u.account.effectiveRank >= 2) {
            u.socket.emit("addUser", data.mod);
        } else {
            u.socket.emit("addUser", data.base);
        }
    });

    self.modules.chat.sendModMessage(user.getName() + " joined (aliases: " +
                                     user.account.aliases.join(",") + ")", 2);
};

Channel.prototype.readLog = function (cb) {
    const maxLen = 102400;
    const file = this.logger.filename;
    this.refCounter.ref("Channel::readLog");
    const self = this;
    fs.stat(file, function (err, data) {
        if (err) {
            self.refCounter.unref("Channel::readLog");
            return cb(err, null);
        }

        const start = Math.max(data.size - maxLen, 0);
        const end = data.size - 1;

        const read = fs.createReadStream(file, {
            start: start,
            end: end
        });

        var buffer = "";
        read.on("data", function (data) {
            buffer += data;
        });
        read.on("end", function () {
            cb(null, buffer);
            self.refCounter.unref("Channel::readLog");
        });
    });
};

Channel.prototype.handleReadLog = function (user) {
    if (user.account.effectiveRank < 3) {
        user.kick("Attempted readChanLog with insufficient permission");
        return;
    }

    if (!this.is(Flags.C_REGISTERED)) {
        user.socket.emit("readChanLog", {
            success: false,
            data: "Channel log is only available to registered channels."
        });
        return;
    }

    this.readLog(function (err, data) {
        if (err) {
            user.socket.emit("readChanLog", {
                success: false,
                data: "Error reading channel log"
            });
        } else {
            user.socket.emit("readChanLog", {
                success: true,
                data: data
            });
        }
    });
};

Channel.prototype.broadcastToRoom = function (msg, data, ns) {
    sio.instance.in(ns).emit(msg, data);
};

Channel.prototype.broadcastAll = function (msg, data) {
    this.broadcastToRoom(msg, data, this.name);
};

Channel.prototype.packInfo = function (isAdmin) {
    var data = {
        name: this.name,
        usercount: this.users.length,
        users: [],
        registered: this.is(Flags.C_REGISTERED)
    };

    for (var i = 0; i < this.users.length; i++) {
        if (this.users[i].name !== "") {
            var name = this.users[i].getName();
            var rank = this.users[i].account.effectiveRank;
            if (rank >= 255) {
                name = "!" + name;
            } else if (rank >= 4) {
                name = "~" + name;
            } else if (rank >= 3) {
                name = "&" + name;
            } else if (rank >= 2) {
                name = "@" + name;
            }
            data.users.push(name);
        }
    }

    if (isAdmin) {
        data.activeLockCount = this.refCounter.refCount;
    }

    var self = this;
    var keys = Object.keys(this.modules);
    keys.forEach(function (k) {
        self.modules[k].packInfo(data, isAdmin);
    });

    return data;
};

module.exports = Channel;
