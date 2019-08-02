var Server = require("./server");
var util = require("./utilities");
var db = require("./database");
var Config = require("./config");
var ACP = require("./acp");
var Account = require("./account");
var Flags = require("./flags");
import { EventEmitter } from 'events';
import Logger from './logger';
import net from 'net';

const LOGGER = require('@calzoneman/jsli')('user');

function User(socket, ip, loginInfo) {
    this.flags = 0;
    this.socket = socket;
    // Expanding IPv6 addresses shouldn't really be necessary
    // At some point, the IPv6 related stuff should be revisited
    this.realip = net.isIPv6(ip) ? util.expandIPv6(ip) : ip;
    this.displayip = util.cloakIP(this.realip);
    this.channel = null;
    this.queueLimiter = util.newRateLimiter();
    this.chatLimiter = util.newRateLimiter();
    this.reqPlaylistLimiter = util.newRateLimiter();
    this.awaytimer = false;

    if (loginInfo) {
        this.account = new Account.Account(this.realip, loginInfo, socket.context.aliases);
        this.registrationTime = new Date(this.account.user.time);
        this.setFlag(Flags.U_REGISTERED | Flags.U_LOGGED_IN | Flags.U_READY);
        socket.emit("login", {
            success: true,
            name: this.getName(),
            guest: false
        });
        socket.emit("rank", this.account.effectiveRank);
        if (this.account.globalRank >= 255) {
            this.initAdminCallbacks();
        }
        this.emit("login", this.account);
        LOGGER.info(ip + " logged in as " + this.getName());
    } else {
        this.account = new Account.Account(this.realip, null, socket.context.aliases);
        socket.emit("rank", -1);
        this.setFlag(Flags.U_READY);
        this.once("login", account => {
            if (account.globalRank >= 255) {
                this.initAdminCallbacks();
            }
        });
    }

    socket.once("joinChannel", data => this.handleJoinChannel(data));
    socket.once("initACP", () => this.handleInitACP());
    socket.on("login", data => this.handleLogin(data));
}

User.prototype = Object.create(EventEmitter.prototype);

User.prototype.handleJoinChannel = function handleJoinChannel(data) {
    if (typeof data !== "object" || typeof data.name !== "string") {
        return;
    }

    if (this.inChannel()) {
        return;
    }

    if (!util.isValidChannelName(data.name)) {
        this.socket.emit("errorMsg", {
            msg: "Invalid channel name.  Channel names may consist of 1-30 " +
                 "characters in the set a-z, A-Z, 0-9, -, and _"
        });
        this.kick("Invalid channel name");
        return;
    }

    data.name = data.name.toLowerCase();
    if (data.name in Config.get("channel-blacklist")) {
        this.kick("This channel is blacklisted.");
        return;
    }

    this.waitFlag(Flags.U_READY, () => {
        var chan;
        try {
            chan = Server.getServer().getChannel(data.name);
        } catch (error) {
            if (error.code === 'EWRONGPART') {
                this.socket.emit("errorMsg", {
                    msg: "Channel '" + data.name + "' is hosted on another server.  " +
                         "Try refreshing the page to update the connection URL."
                });
            } else {
                LOGGER.error("Unexpected error from getChannel(): %s", error.stack);
                this.socket.emit("errorMsg", {
                    msg: "Unable to join channel due to an internal error"
                });
            }
            return;
        }

        if (!chan.is(Flags.C_READY)) {
            chan.once("loadFail", reason => {
                this.socket.emit("errorMsg", {
                    msg: reason,
                    alert: true
                });
                this.kick(`Channel could not be loaded: ${reason}`);
            });
        }
        chan.joinUser(this, data);
    });
};

User.prototype.handleInitACP = function handleInitACP() {
    this.waitFlag(Flags.U_LOGGED_IN, () => {
        if (this.account.globalRank >= 255) {
            ACP.init(this);
        } else {
            this.kick("Attempted initACP from non privileged user.  This incident " +
                      "will be reported.");
            Logger.eventlog.log("[acp] Attempted initACP from socket client " +
                                this.getName() + "@" + this.realip);
        }
    });
};

User.prototype.handleLogin = function handleLogin(data) {
    if (typeof data !== "object") {
        this.socket.emit("errorMsg", {
            msg: "Invalid login frame"
        });
        return;
    }

    var name = data.name;
    if (typeof name !== "string") {
        return;
    }

    var pw = data.pw || "";
    if (typeof pw !== "string") {
        pw = "";
    }

    if (this.is(Flags.U_LOGGING_IN) || this.is(Flags.U_LOGGED_IN)) {
        return;
    }

    if (!pw) {
        this.guestLogin(name);
    } else {
        this.login(name, pw);
    }
};

User.prototype.die = function () {
    for (const key in this.socket._events) {
        delete this.socket._events[key];
    }

    delete this.socket.typecheckedOn;
    delete this.socket.typecheckedOnce;

    for (const key in this.__evHandlers) {
        delete this.__evHandlers[key];
    }

    if (this.awaytimer) {
        clearTimeout(this.awaytimer);
    }

    this.dead = true;
};

User.prototype.is = function (flag) {
    return Boolean(this.flags & flag);
};

User.prototype.setFlag = function (flag) {
    this.flags |= flag;
    this.emit("setFlag", flag);
};

User.prototype.clearFlag = function (flag) {
    this.flags &= ~flag;
    this.emit("clearFlag", flag);
};

User.prototype.waitFlag = function (flag, cb) {
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

User.prototype.getName = function () {
    return this.account.name;
};

User.prototype.getLowerName = function () {
    return this.account.lowername;
};

User.prototype.inChannel = function () {
    return this.channel != null && !this.channel.dead;
};

User.prototype.inRegisteredChannel = function () {
    return this.inChannel() && this.channel.is(Flags.C_REGISTERED);
};

/* Called when a user's AFK status changes */
User.prototype.setAFK = function (afk) {
    if (!this.inChannel()) {
        return;
    }

    /* No change in AFK status, don't need to change anything */
    if (this.is(Flags.U_AFK) === afk) {
        this.autoAFK();
        return;
    }

    if (afk) {
        this.setFlag(Flags.U_AFK);
        if (this.channel.modules.voteskip) {
            this.channel.modules.voteskip.unvote(this.realip);
            this.socket.emit("clearVoteskipVote");
        }
    } else {
        this.clearFlag(Flags.U_AFK);
        this.autoAFK();
    }

    if (!this.inChannel()) {
        /*
         * In unusual circumstances, the above emit("clearVoteskipVote")
         * can cause the "disconnect" event to be fired synchronously,
         * which results in this user no longer being in the channel.
         */
        return;
    }

    /* Number of AFK users changed, voteskip state changes */
    if (this.channel.modules.voteskip) {
        this.channel.modules.voteskip.update();
    }

    this.emit('afk', afk);
};

/* Automatically tag a user as AFK after a period of inactivity */
User.prototype.autoAFK = function () {
    var self = this;
    if (self.awaytimer) {
        clearTimeout(self.awaytimer);
    }

    if (!self.inChannel() || !self.channel.modules.options) {
        return;
    }

    /* Don't set a timer if the duration is invalid */
    var timeout = parseFloat(self.channel.modules.options.get("afk_timeout"));
    if (isNaN(timeout) || timeout <= 0) {
        return;
    }

    self.awaytimer = setTimeout(function () {
        self.setAFK(true);
    }, timeout * 1000);
};

User.prototype.kick = function (reason) {
    LOGGER.info(
        '%s (%s) was kicked: "%s"',
        this.realip,
        this.getName(),
        reason
    );
    this.socket.emit("kick", { reason: reason });
    this.socket.disconnect();
};

User.prototype.isAnonymous = function(){
    var self = this;
    return !self.is(Flags.U_LOGGED_IN);
};

User.prototype.initAdminCallbacks = function () {
    var self = this;
    self.socket.on("borrow-rank", function (rank) {
        if (self.inChannel()) {
            if (typeof rank !== "number") {
                return;
            }

            if (rank > self.account.globalRank) {
                return;
            }

            if (rank === 255 && self.account.globalRank > 255) {
                rank = self.account.globalRank;
            }

            self.account.channelRank = rank;
            self.account.effectiveRank = rank;
            self.socket.emit("rank", rank);
            self.channel.broadcastAll("setUserRank", {
                name: self.getName(),
                rank: rank
            });
        }
    });
};

User.prototype.login = function (name, pw) {
    var self = this;
    self.setFlag(Flags.U_LOGGING_IN);

    db.users.verifyLogin(name, pw, function (err, user) {
        if (err) {
            if (err === "Invalid username/password combination") {
                Logger.eventlog.log("[loginfail] Login failed (bad password): " + name
                                  + "@" + self.realip);
            }

            self.socket.emit("login", {
                success: false,
                error: err
            });
            self.clearFlag(Flags.U_LOGGING_IN);
            return;
        }

        const oldRank = self.account.effectiveRank;
        self.account.user = user;
        self.account.update();
        self.socket.emit("rank", self.account.effectiveRank);
        self.emit("effectiveRankChange", self.account.effectiveRank, oldRank);
        self.registrationTime = new Date(user.time);
        self.setFlag(Flags.U_REGISTERED);
        self.socket.emit("login", {
            success: true,
            name: user.name
        });
        db.recordVisit(self.realip, self.getName());
        LOGGER.info(self.realip + " logged in as " + user.name);
        self.setFlag(Flags.U_LOGGED_IN);
        self.clearFlag(Flags.U_LOGGING_IN);
        self.emit("login", self.account);
    });
};

var lastguestlogin = {};
User.prototype.guestLogin = function (name) {
    var self = this;

    if (self.realip in lastguestlogin) {
        var diff = (Date.now() - lastguestlogin[self.realip]) / 1000;
        if (diff < Config.get("guest-login-delay")) {
            self.socket.emit("login", {
                success: false,
                error: "Guest logins are restricted to one per IP address per " +
                       Config.get("guest-login-delay") + " seconds."
            });
            return;
        }
    }

    if (!util.isValidUserName(name)) {
        self.socket.emit("login", {
            success: false,
            error: "Invalid username.  Usernames must be 1-20 characters long and " +
                   "consist only of characters a-z, A-Z, 0-9, -, or _."
        });
        return;
    }

    if (name.match(Config.get("reserved-names.usernames"))) {
        LOGGER.warn(
            'Rejecting attempt by %s to use reserved username "%s"',
            self.realip,
            name
        );
        self.socket.emit("login", {
            success: false,
            error: "That username is reserved."
        });
        return;
    }

    // Prevent duplicate logins
    self.setFlag(Flags.U_LOGGING_IN);
    db.users.isUsernameTaken(name, function (err, taken) {
        self.clearFlag(Flags.U_LOGGING_IN);
        if (err) {
            self.socket.emit("login", {
                success: false,
                error: err
            });
            return;
        }

        if (taken) {
            self.socket.emit("login", {
                success: false,
                error: "That username is registered."
            });
            return;
        }

        if (self.inChannel()) {
            var nameLower = name.toLowerCase();
            for (var i = 0; i < self.channel.users.length; i++) {
                if (self.channel.users[i].getLowerName() === nameLower) {
                    self.socket.emit("login", {
                        success: false,
                        error: "That name is already in use on this channel."
                    });
                    return;
                }
            }
        }

        // Login succeeded
        lastguestlogin[self.realip] = Date.now();

        const oldRank = self.account.effectiveRank;
        self.account.guestName = name;
        self.account.update();
        self.socket.emit("rank", self.account.effectiveRank);
        self.emit("effectiveRankChange", self.account.effectiveRank, oldRank);
        self.socket.emit("login", {
            success: true,
            name: name,
            guest: true
        });
        db.recordVisit(self.realip, self.getName());
        LOGGER.info(self.realip + " signed in as " + name);
        self.setFlag(Flags.U_LOGGED_IN);
        self.emit("login", self.account);
    });
};

/* Clean out old login throttlers to save memory */
setInterval(function () {
    var delay = Config.get("guest-login-delay");
    for (var ip in lastguestlogin) {
        var diff = (Date.now() - lastguestlogin[ip]) / 1000;
        if (diff > delay) {
            delete lastguestlogin[ip];
        }
    }

    if (Config.get("aggressive-gc") && global && global.gc) {
        global.gc();
    }
}, 5 * 60 * 1000);

User.prototype.getFirstSeenTime = function getFirstSeenTime() {
    if (this.registrationTime && this.socket.context.ipSessionFirstSeen) {
        return Math.min(
            this.registrationTime.getTime(),
            this.socket.context.ipSessionFirstSeen.getTime()
        );
    } else if (this.registrationTime) {
        return this.registrationTime.getTime();
    } else if (this.socket.context.ipSessionFirstSeen) {
        return this.socket.context.ipSessionFirstSeen.getTime();
    } else {
        LOGGER.error(`User "${this.getName()}" (IP: ${this.realip}) has neither ` +
                "an IP session first seen time nor a registered account.");
        return Date.now();
    }
};

User.prototype.setChannelRank = function setRank(rank) {
    const oldRank = this.account.effectiveRank;
    const changed = oldRank !== rank;
    this.account.channelRank = rank;
    this.account.update();
    this.socket.emit("rank", this.account.effectiveRank);
    if (changed) {
        this.emit("effectiveRankChange", this.account.effectiveRank, oldRank);
    }
};

module.exports = User;
