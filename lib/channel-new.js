var util = require("./utilities");
var db = require("./database");
var Playlist = require("./playlist");
var Filter = require("./filter").Filter;
var Logger = require("./logger");
var AsyncQueue = require("./asyncqueue");
var MakeEmitter = require("./emitter");

var fs = require("fs");
var path = require("path");

var DEFAULT_FILTERS = [
    new Filter("monospace", "`(.+?)`", "g", "<code>$1</code>"),
    new Filter("bold", "\\*(.+?)\\*", "g", "<strong>$1</strong>"),
    new Filter("italic", "_(.+?)_", "g", "<em>$1</em>"),
    new Filter("strike", "~~(.+?)~~", "g", "<s>$1</s>"),
    new Filter("inline spoiler", "\\[sp\\](.*?)\\[\\/sp\\]", "ig", "<span class=\"spoiler\">$1</span>")
];

function Channel(name) {
    MakeEmitter(this);
    var self = this; // Alias `this` to prevent scoping issues
    Logger.syslog.log("Loading channel " + name);

    // Defaults
    self.ready = false;
    self.name = name;
    self.uniqueName = name.toLowerCase(); // To prevent casing issues
    self.registered = false; // set to true if the channel exists in the database
    self.users = [];
    self.mutedUsers = new util.Set();
    self.playlist = new Playlist(self);
    self.plqueue = new AsyncQueue(); // For synchronizing playlist actions
    self.drinks = 0;
    self.leader = null;
    self.chatbuffer = [];
    self.playlistLock = true;
    self.poll = null;
    self.voteskip = null;
    self.permissions = {
        playlistadd: 1.5, // Add video to the playlist
        playlistnext: 1.5,
        playlistmove: 1.5, // Move a video on the playlist
        playlistdelete: 2, // Delete a video from the playlist
        playlistjump: 1.5, // Start a different video on the playlist
        playlistaddlist: 1.5, // Add a list of videos to the playlist
        oplaylistadd: -1, // Same as above, but for open (unlocked) playlist
        oplaylistnext: 1.5,
        oplaylistmove: 1.5,
        oplaylistdelete: 2,
        oplaylistjump: 1.5,
        oplaylistaddlist: 1.5,
        playlistaddcustom: 3, // Add custom embed to the playlist
        playlistaddlive: 1.5, // Add a livestream to the playlist
        exceedmaxlength: 2, // Add a video longer than the maximum length set
        addnontemp: 2, // Add a permanent video to the playlist
        settemp: 2, // Toggle temporary status of a playlist item
        playlistgeturl: 1.5, // TODO is this even used?
        playlistshuffle: 2, // Shuffle the playlist
        playlistclear: 2, // Clear the playlist
        pollctl: 1.5, // Open/close polls
        pollvote: -1, // Vote in polls
        viewhiddenpoll: 1.5, // View results of hidden polls
        voteskip: -1, // Vote to skip the current video
        mute: 1.5, // Mute other users
        kick: 1.5, // Kick other users
        ban: 2, // Ban other users
        motdedit: 3, // Edit the MOTD
        filteredit: 3, // Control chat filters
        drink: 1.5, // Use the /d command
        chat: 0 // Send chat messages
    };
    self.opts = {
        allow_voteskip: true, // Allow users to voteskip
        voteskip_ratio: 0.5, // Ratio of skip votes:non-afk users needed to skip the video
        afk_timeout: 600, // Number of seconds before a user is automatically marked afk
        pagetitle: self.name, // Title of the browser tab
        maxlength: 0, // Maximum length (in seconds) of a video queued
        externalcss: "", // Link to external stylesheet
        externaljs: "", // Link to external script
        chat_antiflood: false, // Throttle chat messages
        chat_antiflood_params: {
            burst: 4, // Number of messages to allow with no throttling
            sustained: 1, // Throttle rate (messages/second)
            cooldown: 4 // Number of seconds with no messages before burst is reset
        },
        show_public: false, // List the channel on the index page
        enable_link_regex: true, // Use the built-in link filter
        password: false // Channel password (false -> no password required for entry)
    };
    self.motd = {
        motd: "", // Raw MOTD text
        html: "" // Filtered MOTD text (XSS removed; \n replaced by <br>)
    };
    self.filters = DEFAULT_FILTERS;
    self.ipbans = {};
    self.namebans = {};
    self.logger = new Logger.Logger(path.join(__dirname, "../chanlogs",
                                    self.uniqueName + ".log"));
    self.css = ""; // Up to 20KB of inline CSS
    self.js = ""; // Up to 20KB of inline Javascript

    self.error = false; // Set to true if something bad happens => don't save state

    self.on("ready", function () {
        self.ready = true;
    });

    // Load from database
    db.channels.load(self, function (err) {
        if (err && err !== "Channel is not registered") {
            return;
        } else {
            // Load state from JSON blob
            self.tryLoadState();
        }
    });
};

Channel.prototype.mutedUsers = function () {
    var self = this;
    return self.users.filter(function (u) {
        return self.mutedUsers.contains(u.name);
    });
};

Channel.prototype.shadowMutedUsers = function () {
    var self = this;
    return self.users.filter(function (u) {
        return self.mutedUsers.contains("[shadow]" + u.name);
    });
};

Channel.prototype.channelModerators = function () {
    return this.users.filter(function (u) {
        return u.rank >= 2;
    });
};

Channel.prototype.channelAdmins = function () {
    return this.users.filter(function (u) {
        return u.rank >= 3;
    });
};

Channel.prototype.tryLoadState = function () {
    var self = this;
    if (self.name === "") {
        return;
    }

    // Don't load state if the channel isn't registered
    if (!self.registered) {
        self.emit("ready");
        return;
    }

    var file = path.join(__dirname, "../chandump", self.uniqueName);
    fs.stat(file, function (err, stats) {
        if (!err) {
            var mb = stats.size / 1048576;
            mb = Math.floor(mb * 100) / 100;
            if (mb > 1) {
                Logger.errlog.log("Large chandump detected: " + self.uniqueName +
                                  " (" + mb + " MiB)");
                self.setMOTD("Your channel file has exceeded the maximum size of 1MB " +
                             "and cannot be loaded.  Please ask an administrator for " +
                             "assistance in restoring it.");
                self.error = true;
                self.emit("ready");
                return;
            }
        }

        self.loadState();
    });
};

/**
 * Load the channel state from disk.
 *
 * SHOULD ONLY BE CALLED FROM tryLoadState
 */
Channel.prototype.loadState = function () {
    var self = this;
    if (self.error) {
        return;
    }

    fs.readFile(path.join(__dirname, "../chandump", self.uniqueName),
    function (err, data) {
        if (err) {
            // File didn't exist => start fresh
            if (err.code === "ENOENT") {
                self.emit("ready");
                self.saveState();
            } else {
                Logger.errlog.log("Failed to open channel dump " + self.uniqueName);
                Logger.errlog.log(err);
                self.setMOTD("Channel state load failed.  Contact an administrator.");
                self.error = true;
                self.emit("ready");
            }
            return;
        }

        try {
            self.logger.log("*** Loading channel state");
            data = JSON.parse(data);

            // Load the playlist
            if ("playlist" in data) {
                self.playlist.load(data.playlist, function () {
                    self.sendPlaylist(self.users);
                    self.sendPlaylistMeta(self.users);
                    self.playlist.startPlayback(data.playlist.time);
                });
            }

            // Playlist lock
            self.setLock(data.playlistLock || false);

            // Configurables
            if ("opts" in data) {
                for (var key in data.opts) {
                    self.opts[key] = data.opts;
                }
            }

            // Permissions
            if ("permissions" in data) {
                for (var key in data.permissions) {
                    self.permissions[key] = data.permissions[key];
                }
            }

            // Chat filters
            if ("filters" in data) {
                for (var i = 0; i < data.filters.length; i++) {
                    var f = data.filters[i];
                    var filt = new Filter(f.name, f.source, f.flags, f.replace);
                    filt.active = f.active;
                    filt.filterlinks = f.filterlinks;
                    self.updateFilter(filt, false);
                }
            }

            // MOTD
            if ("motd" in data) {
                self.motd = {
                    motd: data.motd.motd,
                    html: data.motd.html
                };
            }

            // Chat history
            if ("chatbuffer" in data) {
                data.chatbuffer.forEach(function (msg) {
                    self.chatbuffer.push(msg);
                });
            }

            // Inline CSS/JS
            self.css = data.css || "";
            self.js = data.js || "";
            self.emit("ready");

        } catch (e) {
            self.error = true;
            Logger.errlog.log("Channel dump load failed (" + self.uniqueName + "): " + e);
            self.setMOTD("Channel state load failed.  Contact an administrator.");
            self.emit("ready");
        }
    });
};

Channel.prototype.saveState = function () {
    var self = this;

    if (self.error) {
        return;
    }

    if (!self.registered || self.uniqueName === "") {
        return;
    }

    var filters = self.filters.map(function (f) {
        return f.pack();
    });

    var data = {
        playlist: self.playlist.dump(),
        opts: self.opts,
        permissions: self.permissions,
        filters: filters,
        motd: self.motd,
        playlistLock: self.playlistLock,
        chatbuffer: self.chatbuffer,
        css: self.css,
        js: self.js
    };

    var text = JSON.stringify(data);
    fs.writeFileSync(path.join(__dirname, "../chandump", self.uniqueName), text);
};

/**
 * Checks whether a user has the given permission node
 */
Channel.prototype.hasPermission = function (user, key) {
    // Special case: you can have separate permissions for when playlist is unlocked
    if (key.indexOf("playlist") === 0 && !this.playlistLock) {
        var key2 = "o" + key;
        var v = this.permissions[key2];
        if (typeof v === "number" && user.rank >= v) {
            return true;
        }
    }

    var v = this.permissions[key];
    if (typeof v !== "number") {
        return false;
    }

    return user.rank >= v;
};

/**
 * Defer a callback to complete when the channel is ready to accept users.
 * Called immediately if the ready flag is already set
 */
Channel.prototype.whenReady = function (fn) {
    if (this.ready) {
        setImmediate(fn);
    } else {
        this.on("ready", fn);
    }
};

/**
 * Looks up a user's rank in the channel.  Computed as max(global_rank, channel rank)
 */
Channel.prototype.getRank = function (name, callback) {
    var self = this;
    db.users.getGlobalRank(name, function (err, global) {
        if (self.dead) {
            return;
        }

        if (err) {
            callback(err, null);
            return;
        }

        if (!self.registered) {
            callback(null, global);
            return;
        }

        db.channels.getRank(self.name, name, function (err, rank) {
            if (self.dead) {
                return;
            }

            if (err) {
                callback(err, null);
                return;
            }

            callback(null, Math.max(rank, global));
        });
    });
};

/**
 * Looks up the highest rank of any alias of an IP address
 */
Channel.prototype.getIPRank = function (ip, callback) {
    var self = this;
    db.getAliases(ip, function (err, names) {
        if (self.dead) {
            return;
        }

        db.users.getGlobalRanks(names, function (err, res) {
            if (self.dead) {
                return;
            }

            if (err) {
                callback(err, null);
                return;
            }

            var rank = res.reduce(function (a, b) {
                return Math.max(a, b);
            }, 0);

            if (!self.registered) {
                callback(null, rank);
                return;
            }

            db.channels.getRanks(self.name, names,
                                 function (err, res) {
                if (self.dead) {
                    return;
                }

                if (err) {
                    callback(err, null);
                    return;
                }

                var rank = res.reduce(function (a, b) {
                    return Math.max(a, b);
                }, rank);

                callback(null, rank);
            });
        });
    });
};

/**
 * Called when a user joins a channel
 */
Channel.prototype.join = function (user, password) {
    var self = this;
    self.whenReady(function () {
        if (self.opts.password !== false && user.rank < 2) {
            if (password !== self.opts.password) {
                user.socket.emit("needPassword", typeof password === "undefined");
                return;
            }
        }

        user.socket.emit("cancelNeedPassword");
        var range = user.ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, "$1.$2.$3");
        if (user.ip in self.ipbans || range in self.ipbans ||
            user.name.toLowerCase() in self.namebans) {
            user.kick("You're banned!");
            return;
        }

        user.autoAFK();
        user.socket.join(self.uniqueName);
        user.channel = self;

        self.users.push(user);
        self.sendVoteskipUpdate(self.users);
        self.sendUsercount(self.users);

        user.whenLoggedIn(function () {
            var lname = user.name.toLowerCase();
            for (var i = 0; i < self.users.length; i++) {
                if (self.users[i] === user) {
                    Logger.errlog.log("Wat: join() called on user already in channel");
                    break;
                }
                self.users[i].kick("Duplicate login");
            }

            self.getRank(user.name, function (err, rank) {
                if (self.dead) {
                    return;
                }

                if (err) {
                    user.rank = user.global_rank;
                } else {
                    user.rank = Math.max(rank, user.global_rank);
                }

                user.socket.emit("rank", user.rank);
                self.sendUserJoin(self.users);
            });
        });

        self.sendPlaylist([user]);
        self.sendMediaUpdate([user]);
        self.sendPlaylistLock([user]);
        self.sendUserlist([user]);
        self.sendRecentchat([user]);
        self.sendCSSJS([user]);
        self.sendPoll([user]);
        self.sendOpts([user]);
        self.sendPermissions([user]);
        self.sendMotd([user]);
        self.sendDrinkCount([user]);

        self.logger.log("+++ " + user.ip + " joined");
        Logger.syslog.log(user.ip + " joined channel " + self.name);
    });
};

/**
 * Called when a user leaves the channel.
 * Cleans up and sends appropriate updates to other users
 */
Channel.prototype.part = function (user) {
    user.channel = null;

    // Clear poll vote
    if (self.poll) {
        self.poll.unvote(user.ip);
        self.sendPoll(self.users);
    }

    // Clear voteskip vote
    if (self.voteskip) {
        self.voteskip.unvote(user.ip);
        self.sendVoteskipUpdate(self.users);
    }

    // Return video lead to server if necessary
    if (self.leader === user) {
        self.changeLeader("");
    }

    // Remove from users array
    var idx = self.users.indexOf(user);
    if (idx >= 0 && idx < self.users.length) {
        self.users.splice(idx, 1);
    }

    // A change in usercount might cause a voteskip result to change
    self.checkVoteskipPass();
    self.sendUsercount(self.users);

    if (user.loggedIn) {
        self.sendUserLeave(self.users, user);
    }

    self.logger.log("--- " + user.ip + " (" + user.name + ") left");
    if (self.users.length === 0) {
        self.emit("empty");
        return;
    }
};

/**
 * Set the MOTD and broadcast it to connected users
 */
Channel.prototype.setMOTD = function (message) {
    this.motd.motd = message;
    // TODO XSS filter
    this.motd.html = message.replace(/\n/g, "<br>");
    this.sendMOTD(this.users);
};

/**
 * Send the MOTD to the given users
 */
Channel.prototype.sendMOTD = function (users) {
    var motd = this.motd;
    users.forEach(function (u) {
        u.socket.emit("setMotd", motd);
    });
};

/**
 * Sends a message to channel moderators
 */
Channel.prototype.sendModMessage = function (msg, minrank) {
    if (isNaN(minrank)) {
        minrank = 2;
    }

    var notice = {
        username: "[server]",
        msg: msg,
        meta: {
            addClass: "server-whisper" ,
            addClassToNameAndTimestamp: true
        },
        time: Date.now()
    };

    this.users.forEach(function(u) {
        if (u.rank > minrank) {
            u.socket.emit("chatMsg", notice);
        }
    });
};

/**
 * Stores a video in the channel's library
 */
Channel.prototype.cacheMedia = function (media) {
    // Don't cache Google Drive videos because of their time limit
    if (media.type === "gd") {
        return false;
    }

    if (this.registered) {
        db.channels.addToLibrary(this.name, media);
    }
};

/**
 * Attempts to ban a user by name
 */
Channel.prototype.tryNameBan = function (actor, name, reason) {
    var self = this;
    if (!self.hasPermission(actor, "ban")) {
        return false;
    }

    name = name.toLowerCase();
    if (name == actor.name.toLowerCase()) {
        actor.socket.emit("costanza", {
            msg: "Trying to ban yourself?"
        });
        return;
    }

    // Look up the name's rank so people can't ban others with higher rank than themselves
    self.getRank(name, function (err, rank) {
        if (self.dead) {
            return;
        }

        if (err) {
            actor.socket.emit("errorMsg", {
                msg: "Internal error " + err
            });
            return;
        }

        if (rank >= actor.rank) {
            actor.socket.emit("errorMsg", {
                msg: "You don't have permission to ban " + name
            });
            return;
        }

        if (typeof reason !== "string") {
            reason = "";
        }

        reason = reason.substring(0, 255);
        self.namebans[name] = {
            ip: "*",
            name: name,
            bannedby: actor.name,
            reason: reason
        };

        // If in the channel already, kick the banned user
        for (var i = 0; i < self.users.length; i++) {
            if (self.users[i].name.toLowerCase() == name) {
                self.kick(self.users[i], "You're banned!");
                break;
            }
        }
        self.logger.log("*** " + actor.name + " namebanned " + name);
        self.sendModMessage(actor.name + " banned " + name, self.permissions.ban);

        if (!self.registered) {
            return;
        }

        // channel, ip, name, reason, actor
        db.channels.ban(self.name, "*", name, reason, actor.name);
        // TODO send banlist?
    });
};

/**
 * Removes a name ban
 */
Channel.prototype.tryUnbanName = function (actor, name) {
    if (!this.hasPermission(actor, "ban")) {
        return;
    }

    delete this.namebans[name];
    this.logger.log("*** " + actor.name + " un-namebanned " + name);
    this.sendModMessage(actor.name + " unbanned " + name, this.permissions.ban);

    if (!this.registered) {
        return;
    }

    db.channels.unbanName(this.name, name);
    // TODO send banlist?
};

/**
 * Bans all IP addresses associated with a username
 */
Channel.prototype.tryBanAllIP = function (actor, name, reason, range) {
    var self = this;
    if (!self.hasPermission(actor, "ban")) {
        return;
    }

    if (typeof name !== "string") {
        return;
    }

    name = name.toLowerCase();
    if (name === actor.name.toLowerCase()) {
        actor.socket.emit("costanza", {
            msg: "Trying to ban yourself?"
        });
        return;
    }

    db.getIPs(name, function (err, ips) {
        if (self.dead) {
            return;
        }

        if (err) {
            actor.socket.emit("errorMsg", {
                msg: "Internal error: " + err
            });
            return;
        }

        ips.forEach(function (ip) {
            self.tryBanIP(actor, ip, name, range);
        });
    });
};

/**
 * Bans an individual IP
 */
Channel.prototype.tryBanIP = function (actor, ip, name, reason, range) {
    if (range) {
        ip = ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, "$1.$2.$3");
    }

    if (typeof reason !== "string") {
        reason = "";
    }

    reason = reason.substring(0, 255);

    self.getIPRank(ip, function (err, rank) {
        if (self.dead) {
            return;
        }

        if (err) {
            actor.socket.emit("errorMsg", {
                msg: "Internal error: " + err
            });
            return;
        }

        if (rank >= actor.rank) {
            actor.socket.emit("errorMsg", {
                msg: "You don't have permission to ban IP: " + util.maskIP(ip)
            });
            return;
        }

        self.ipbans[ip] = {
            ip: ip,
            name: name,
            bannedby: actor.name,
            reason: reason
        };

        self.logger.log("*** " + actor.name + " banned " + ip + " (" + name + ")");
        self.sendModMessage(actor.name + " banned " + ip + " (" + name + ")", self.permissions.ban);
        // If in the channel already, kick the banned user
        for (var i = 0; i < self.users.length; i++) {
            if (self.users[i].ip === ip) {
                self.kick(self.users[i], "You're banned!");
                break;
            }
        }

        if (!self.registered) {
            return;
        }

        // channel, ip, name, reason, ban actor
        db.channels.ban(self.name, ip, name, reason, actor.name);
    });
};

/**
 * Removes an IP ban
 */
Channel.prototype.unbanIP = function (actor, ip) {
    if (!this.hasPermission(actor, "ban")) {
        return;
    }

    var record = this.ipbans[ip];
    delete this.ipbans[ip];
    this.logger.log("*** " + actor.name + " unbanned " + ip + " (" + record.name + ")");
    this.sendModMessage(actor.name + " unbanned " + util.maskIP(ip) + " (" + record.name + ")", this.permissions.ban);

    if (!this.registered) {
        return;
    }

    db.channels.unbanIP(this.name, ip);
};

/**
 * Sends the banlist
 */
Channel.prototype.sendBanlist = function (users) {
    var self = this;

    var bans = [];
    var unmaskedbans = [];
    for (var ip in self.ipbans) {
        bans.push({
            ip: util.maskIP(ip),
            name: self.ipbans[ip].name,
            reason: self.ipbans[ip].reason,
            bannedby: self.ipbans[ip].bannedby
        });
        unmaskedbans.push({
            ip: ip,
            name: self.ipbans[ip].name,
            reason: self.ipbans[ip].reason,
            bannedby: self.ipbans[ip].bannedby
        });
    }

    users.forEach(function (u) {
        if (!self.hasPermission(u, "ban")) {
            return;
        }

        if (u.rank >= 255) {
            u.socket.emit("banlist", unmaskedbans);
        } else {
            u.socket.emit("banlist", bans);
        }
    });
};

/**
 * Sends the chat filter list
 */
Channel.prototype.sendChatFilters = function (users) {
    var self = this;

    var pkt = self.filters.map(function (f) {
        return f.pack();
    });

    users.forEach(function (u) {
        if (!self.hasPermission(u, "filteredit")) {
            return;
        }

        u.socket.emit("chatFilters", f);
    });
};

/**
 * Sends the playlist
 */
Channel.prototype.sendPlaylist = function (users) {
    var self = this;

    var pl = self.playlist.items.toArray();
    var current = null;
    if (self.playlist.current) {
        current = self.playlist.current.uid;
    }

    users.forEach(function (u) {
        u.socket.emit("playlist", pl);
        u.socket.emit("setPlaylistMeta", self.plmeta);
        if (current !== null) {
            u.socket.emit("setCurrent", current);
        }
    });
};

/**
 * Updates the playlist count/time
 */
Channel.prototype.updatePlaylistMeta = function () {
    var total = 0;
    var iter = this.playlist.items.first;
    while (iter !== null) {
        if (iter.media !== null) {
            total += iter.media.seconds;
        }
        iter = iter.next;
    }

    var timestr = util.formatTime(total);
    this.plmeta = {
        count: this.playlist.items.length,
        time: timestr
    };
};

/**
 * Send the playlist count/time
 */
Channel.prototype.sendPlaylistMeta = function (users) {
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("setPlaylistMeta", self.plmeta);
    });
};

/**
 * Sends the playlist lock
 */
Channel.prototype.sendPlaylistLock = function (users) {
    var lock = this.playlistLock;
    users.forEach(function (u) {
        u.socket.emit("setPlaylistLocked", lock);
    });
};

/**
 * Sends a changeMedia packet
 */
Channel.prototype.sendMediaUpdate = function (users) {
    var update = this.playlist.getFullUpdate();
    if (update) {
        users.forEach(function (u) {
            u.socket.emit("changeMedia", update);
        });
    }
};

/**
 * Send the userlist
 */
Channel.prototype.sendUserlist = function (toUsers) {
    var users = [];
    var detailedUsers = [];

    for (var i = 0; i < this.users.length; i++) {
        var u = this.users[i];
        if (u.name === "") {
            continue;
        }

        users.push({
            name: u.name,
            rank: u.rank,
            profile: u.profile
        });

        detailedUsers.push({
            name: u.name,
            rank: u.rank,
            meta: u.meta,
            profile: u.profile
        });
    }

    toUsers.forEach(function (u) {
        if (u.rank >= 2) {
            u.socket.emit("userlist", detailedUsers);
        } else {
            u.socket.emit("userlist", users);
        }

        if (this.leader !== null) {
            u.socket.emit("setLeader", this.leader.name);
        }
    });
};

/**
 * Send the user count
 */
Channel.prototype.sendUsercount = function (users) {
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("usercount", self.users.length);
    });
};

/**
 * Send the chat buffer
 */
Channel.prototype.sendRecentChat = function (users) {
    var self = this;
    users.forEach(function (u) {
        for (var i = 0; i < self.chatbuffer.length; i++) {
            u.socket.emit("chatMsg", self.chatbuffer[i]);
        }
    });
};

/**
 * Send a user join notification
 */
Channel.prototype.sendUserJoin = function (users, user) {
    var self = this;
    db.getAliases(user.ip, function (err, aliases) {
        if (self.dead) {
            return;
        }

        if (err) {
            aliases = [user.name];
        }

        user.meta.aliases = aliases;

        if (user.name.toLowerCase() in self.namebans) {
            user.kick("You're banned!");
            return;
        }

        if (self.mutedUsers.contains("[shadow]"+user.name.toLowerCase())) {
            user.meta.muted = true;
            user.meta.shadowmuted = true;
            user.meta.icon = "icon-volume-off";
        } else if (self.mutedUsers.contains(user.name.toLowerCase())) {
            user.meta.muted = true;
            user.meta.shadowmuted = false;
            user.meta.icon = "icon-volume-off";
        }

        var base = {
            name: user.name,
            rank: user.rank,
            profile: user.profile,
            meta: {
                afk: user.meta.afk
            }
        };

        if (user.meta.icon && !user.meta.shadowmuted) {
            base.meta.icon = user.meta.icon;
        }

        var mod = {
            name: user.name,
            rank: user.rank,
            profile: user.profile,
            meta: {
                afk: user.meta.afk,
                icon: user.meta.icon
            }
        };

        users.forEach(function (u) {
            if (u.rank >= 2) {
                u.socket.emit("addUser", mod);
            } else {
                u.socket.emit("addUser", base);
            }
        });

        self.sendModMessage(user.name + " joined (aliases: " + aliases.join(",") + ")", 2);
    });
};

/**
 * Sends a poll notification
 */
Channel.prototype.sendPollUpdate = function (users) {
    var self = this;
    var unhidden = self.poll.packUpdate(true);
    var hidden = self.poll.packUpdate(false);

    users.forEach(function (u) {
        if (self.hasPermission(u, "viewhiddenpoll")) {
            u.socket.emit("newPoll", unhidden);
        } else {
            u.socket.emit("newPoll", hidden);
        }
    });
};

/**
 * Sends a "poll closed" notification
 */
Channel.prototype.sendPollClose = function (users) {
    users.forEach(function (u) {
        u.socket.emit("closePoll");
    });
};

/**
 * Broadcasts the channel options
 */
Channel.prototype.sendOpts = function (users) {
    var opts = this.opts;
    users.forEach(function (u) {
        u.socket.emit("channelOpts", opts);
    });
};

/**
 * Calculates the number of eligible users to voteskip
 */
Channel.prototype.calcVoteskipMax = function () {
    var self = this;
    return self.users.map(function (u) {
        if (!self.hasPermission(u, "voteskip")) {
            return 0;
        }

        return u.meta.afk ? 0 : 1;
    }).reduce(function (a, b) {
        return a + b;
    }, 0);
};

/**
 * Creates a voteskip update packet
 */
Channel.prototype.getVoteskipPacket = function () {
    var have = this.voteskip ? this.voteskip.counts[0] : 0;
    var max = this.calcVoteskipMax();
    var need = this.voteskip ? Math.ceil(max * this.opts.voteskip_ratio) : 0;
    return {
        count: have,
        need: need
    };
};

/**
 * Sends a voteskip update packet
 */
Channel.prototype.sendVoteskipUpdate = function (users) {
    var update = this.getVoteskipPacket();
    users.forEach(function (u) {
        if (u.rank >= 1.5) {
            u.socket.emit("voteskip", update);
        }
    });
};

/**
 * Sends the MOTD
 */
Channel.prototype.sendMotd = function (users) {
    var motd = this.motd;
    users.forEach(function (u) {
        u.socket.emit("setMotd", motd);
    });
};

/**
 * Sends the drink count
 */
Channel.prototype.sendDrinks = function (users) {
    var drinks = this.drinks;
    users.forEach(function (u) {
        u.socket.emit("drinkCount", drinks);
    });
};

/**
 * Resets video-related variables
 */
Channel.prototype.resetVideo = function () {
    this.voteskip = false;
    this.sendVoteskipUpdate(this.users);
    this.drinks = 0;
    this.sendDrinks(this.users);
};

/**
 * Handles a queue message from a client
 */
Channel.prototype.handleQueue = function (user, data) {
    // Verify the user has permission to add
    if (!this.hasPermission(user, "playlistadd")) {
        return;
    }

    // Verify data types
    if (typeof data.id !== "string" && data.id !== false) {
        return;
    }
    var id = data.id || false;

    if (typeof data.type !== "string") {
        return;
    }
    var type = data.type;
    var link = util.formatLink(id, type);

    // Verify user has the permission to add at the position given
    if (data.pos === "next" && !this.hasPermission(user, "playlistnext")) {
        return;
    }
    var pos = data.pos || "end";

    // Verify user has permission to add a YouTube playlist, if relevant
    if (data.type === "yp" && !this.hasPermission(user, "playlistaddlist")) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add playlists",
            link: link
        });
        return;
    }

    // Verify the user has permission to add livestreams, if relevant
    if (isLive(type) && !this.hasPermission(user, "playlistaddlive")) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add livestreams",
            link: link
        });
        return;
    }

    // Verify the user has permission to add a Custom Embed, if relevant
    if (data.type === "cu" && !this.hasPermission(user, "playlistaddcustom")) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add custom embeds",
            link: null
        });
        return;
    }

    /**
     * Always reset any user-provided title if it's not a custom embed.
     * Additionally reset if it is a custom embed but a title is not provided
     */
    if (typeof data.title !== "string" || data.type !== "cu") {
        data.title = false;
    }
    var title = data.title || false;

    var queueby = user != null ? user.name : "";
    var temp = data.temp || !this.hasPermission(user, "addnontemp");

    // Throttle video adds
    var limit = {
        burst: 3,
        sustained: 1
    };

    if (user.rank >= 2 || this.leader === user) {
        limit = {
            burst: 10,
            sustained: 2
        };
    }

    if (user.queueLimiter.throttle(limit)) {
        user.socket.emit("queueFail", {
            msg: "You are adding videos too quickly",
            link: null
        });
        return;
    }

    // Actually add the video
    this.addMedia({
        id: id,
        title: title,
        pos: pos,
        queueby: queueby,
        temp: temp,
        type: type,
        maxlength: this.hasPermission(user, "exceedmaxlength") ? 0 : this.opts.maxlength
    }, function (err, media) {
        if (err) {
            user.socket.emit("queueFail", {
                msg: err,
                link: link
            });
            return;
        }

        if (media.restricted) {
            user.socket.emit("queueWarn", {
                msg: "This video is blocked in the following countries: " +
                     media.restricted,
                link: link
            });
            return;
        }
    });
};

/**
 * Add a video to the playlist
 */
Channel.prototype.addMedia = function (data, callback) {
    var self = this;

    if (data.type === "cu" && typeof data.title === "string") {
        var t = data.title;
        if (t.length > 100) {
            t = t.substring(0, 97) + "...";
        }
        data.title = t;
    }

    if (data.pos === "end") {
        data.pos === "append";
    }

    var afterLookup = function (lock, shouldCache, media) {
        if (data.maxlength && media.seconds > data.maxlength) {
            callback("Maximum length exceeded: " + data.maxlength + " seconds", null);
            lock.release();
            return;
        }

        media.pos = data.pos;
        media.queueby = data.queueby;
        media.temp = data.temp;
        var res = self.playlist.addMedia(media);
        if (res.error) {
            callback(res.error, null);
            lock.release();
            return;
        }

        self.logger.log("### " + data.queueby + " queued " + media.title);

        var item = res.item;
        var packet = {
            item: item.pack(),
            after: item.prev ? item.prev.uid : "prepend"
        };
        self.users.forEach(function (u) {
            u.socket.emit("queue", packet);
        });

        self.sendPlaylistMeta(self.users);

        if (shouldCache) {
            self.cacheMedia(media);
        }

        lock.release();
        callback(null, media);
    };

    // Cached video data
    if (data.type !== "cu" && typeof data.title === "string") {
        self.plqueue.queue(function (lock) {
            var m = new Media(data.id, data.title, data.seconds, data.type);
            afterData(lock, false, m);
        });
        return;
    }

    // YouTube playlists
    if (data.type === "yp") {
        self.plqueue.queue(function (lock) {
            InfoGetter.getMedia(data.id, data.type, function (e, vids) {
                if (e) {
                    callback(e, null);
                    lock.release();
                    return;
                }

                // If queueing next, reverse queue order so the videos end up
                // in the correct order
                if (data.pos === "next") {
                    vids.reverse();
                    // Special case to ensure correct playlist order
                    if (self.playlist.length === 0) {
                        vids.unshift(vids.pop());
                    }
                }

                // We only want to release the lock after the entire playlist
                // is processed.  Set up a dummy so the same code will work.
                var dummy = {
                    release: function () { }
                };

                for (var i = 0; i < vids.length; i++) {
                    afterData(dummy, true, vids[i]);
                }

                lock.release();
            });
        });
        return;
    }

    // Cases where there is no cached data in the database
    if (!self.registered || util.isLive(data.type)) {
        self.plqueue.queue(function (lock) {
            InfoGetter.getMedia(data.id, data.type, function (e, media) {
                if (e) {
                    callback(e, null);
                    lock.release();
                    return;
                }

                afterData(lock, false, media);
            });
        });
        return;
    }

    // Finally, the "normal" case
    self.plqueue.queue(function (lock) {
        if (self.dead) {
            return;
        }

        var lookupNewMedia = function () {
            InfoGetter.getMedia(data.id, data.type, function (e, media) {
                if (self.dead) {
                    return;
                }

                if (e) {
                    callback(e, null);
                    lock.release();
                    return;
                }

                afterData(lock, true, media);
            });
        };

        db.channels.getLibraryItem(self.name, data.id, function (err, item) {
            if (self.dead) {
                return;
            }

            if (err && err !== "Item not in library") {
                user.socket.emit("queueFail", {
                    msg: "Internal error: " + err,
                    link: util.formatLink(data.id, data.type)
                });
                lock.release();
                return;
            }
        });

        if (item !== null) {
            afterData(lock, true, item);
        }
    });
};

/**
 * Handles a user queueing a user playlist
 */
Channel.prototype.handleQueuePlaylist = function (user, data) {
    var self = this;
    if (!self.hasPermission(user, "playlistaddlist")) {
        return;
    }

    if (typeof data.name !== "string") {
        return;
    }
    var name = data.name;

    if (data.pos === "next" && !self.hasPermission(user, "playlistaddnext")) {
        return;
    }
    var pos = data.pos || "end";

    var temp = data.temp || !self.hasPermission(user, "addnontemp");

    db.getUserPlaylist(user.name, name, function (err, pl) {
        if (self.dead) {
            return;
        }

        if (err) {
            user.socket.emit("errorMsg", {
                msg: "Playlist load failed: " + err
            });
            return;
        }

        try {
            // Ensure correct order when queueing next
            if (pos === "next") {
                pl.reverse();
                if (pl.length > 0 && self.playlist.items.length === 0) {
                    pl.unshift(pl.pop());
                }
            }

            for (var i = 0; i < pl.length; i++) {
                pl[i].pos = pos;
                pl[i].temp = temp;
                self.addMedia(pl[i], function (err, media) {
                    if (err) {
                        user.socket.emit("queueFail", {
                            msg: err,
                            link: util.formatLink(pl[i].id, pl[i].type)
                        });
                    }
                });
            }
        } catch (e) {
            Logger.errlog.log("Loading user playlist failed!");
            Logger.errlog.log("PL: " + user.name + "-" + name);
            Logger.errlog.log(e.stack);
            user.socket.emit("queueFail", {
                msg: "Internal error occurred when loading playlist.  The administrator has been notified.",
                link: null
            });
        }
    });
};

/**
 * Handles a user message to delete a playlist item
 */
Channel.prototype.handleDelete = function (user, data) {
    if (!this.hasPermission(user, "playlistdelete")) {
        return;
    }

    if (typeof data !== "number") {
        return;
    }

    this.deleteMedia(data, function (err) {
        if (!err) {
            this.logger.log("### " + user.name + " deleted " + plitem.media.title);
        }
    });
};

/**
 * Deletes a playlist item
 */
Channel.prototype.deleteMedia = function (uid, callback) {
    var self = this;
    self.plqueue.queue(function (lock) {
        if (self.dead) {
            return;
        }

        if (self.playlist.remove(uid)) {
            self.sendAll("delete", {
                uid: uid
            });
            self.sendPlaylistMeta(self.users);
            callback(null);
        } else {
            callback("Delete failed");
        }

        lock.release();
    });
};

/**
 * Sets the temporary status of a playlist item
 */
Channel.prototype.setTemp = function (uid, temp) {
    var item = this.playlist.items.find(uid);
    if (item == null) {
        return;
    }

    item.temp = temp;
    this.sendAll("setTemp", {
        uid: uid,
        temp: temp
    });

    // TODO might change the way this works
    if (!temp) {
        this.cacheMedia(item.media);
    }
};

/**
 * Handles a user message to set a playlist item as temporary/not
 */
Channel.prototype.handleSetTemp = function (user, data) {
    if (!this.hasPermission(user, "settemp")) {
        return;
    }

    if (typeof data.uid !== "number" || typeof data.temp !== "boolean") {
        return;
    }

    this.setTemp(data.uid, data.temp);
    // TODO log?
};

/**
 * Moves a playlist item in the playlist
 */
Channel.prototype.move = function (from, after, callback) {
    callback = typeof callback === "function" ? callback : function () { };
    var self = this;

    self.plqueue.queue(function (lock) {
        if (self.dead) {
            return;
        }

        if (self.playlist.move(data.from, data.after)) {
            self.sendAll("moveVideo", {
                from: from,
                after: after
            });
            callback(null, true);
        } else {
            callback(true, null);
        }

        lock.release();
    });
};

/**
 * Handles a user message to move a playlist item
 */
Channel.prototype.handleMove = function (user, data) {
    var self = this;

    if (!self.hasPermission(user, "playlistmove")) {
        return;
    }

    if (typeof data.from !== "number" || (typeof data.after !== "number" && typeof data.after !== "string")) {
        return;
    }

    self.move(data.from, data.after, function (err) {
        if (!err) {
            var fromit = self.playlist.items.find(data.from);
            var afterit = self.playlist.items.find(data.after);
            var aftertitle = (afterit && afterit.media) ? afterit.media.title : "";
            if (fromit) {
                self.logger.log("### " + user.name + " moved " + fromit.media.title +
                                (aftertitle ? " after " + aftertitle : ""));
            }
        }
    });
};

/**
 * Handles a user message to remove a video from the library
 */
Channel.prototype.handleUncache = function (user, data) {
    var self = this;
    if (!self.registered) {
        return;
    }

    if (user.rank < 2) {
        return;
    }

    if (typeof data.id !== "string") {
        return;
    }

    db.channels.deleteFromLibrary(self.name, data.id, function (err, res) {
        if (self.dead) {
            return;
        }

        if (err) {
            return;
        }

        self.logger.log("*** " + user.name + " deleted " + data.id + " from library");
    });
};

/**
 * Handles a user message to skip to the next video in the playlist
 */
Channel.prototype.handlePlayNext = function (user) {
    if (!this.hasPermission(user, "playlistjump")) {
        return;
    }

    this.logger.log("### " + user.name + " skipped the video");
    this.playNext();
};

/**
 * Handles a user message to jump to a video in the playlist
 */
Channel.prototype.handleJumpTo = function (user, data) {
    if (!this.hasPermission(user, "playlistjump")) {
        return;
    }

    if (typeof data !== "string" && typeof data !== "number") {
        return;
    }

    this.logger.log("### " + user.name + " skipped the video");
    this.playlist.jump(data);
};

/**
 * Clears the playlist
 */
Channel.prototype.clear = function () {
    this.playlist.clear();
    this.plqueue.reset();
    this.sendPlaylist(this.users);
};

/**
 * Handles a user message to clear the playlist
 */
Channel.prototype.handleClear = function (user) {
    if (!this.hasPermission(user, "playlistclear")) {
        return;
    }

    this.logger.log("### " + user.name + " cleared the playlist");
    this.clear();
};

/**
 * Shuffles the playlist
 */
Channel.prototype.shuffle = function () {
    var pl = this.playlist.items.toArray(false);
    this.playlist.clear();
    this.plqueue.reset();
    while (pl.length > 0) {
        var i = Math.floor(Math.random() * pl.length);
        var item = this.playlist.makeItem(pl[i].media);
        item.temp = pl[i].temp;
        item.queueby = pl[i].queueby;
        this.playlist.items.append(item);
        pl.splice(i, 1);
    }

    this.playlist.current = this.playlist.items.first;
    this.sendPlaylist(this.users);
    this.playlist.startPlayback();
};

/**
 * Handles a user message to shuffle the playlist
 */
Channel.prototype.handleShuffle = function (user) {
    if (!this.hasPermission(user, "playlistshuffle")) {
        return;
    }

    this.logger.log("### " + user.name + " shuffle the playlist");
    this.shuffle();
};

/**
 * Handles a video update from a leader
 */
Channel.prototype.handleUpdate = function (user, data) {
    if (this.leader !== user) {
        user.kick("Received mediaUpdate from non-leader");
        return;
    }

    if (typeof data.id !== "string" || typeof data.currentTime !== "number") {
        return;
    }

    if (this.playlist.current === null) {
        return;
    }

    var media = this.playlist.current.media;

    if (util.isLive(media.type) && media.type !== "jw") {
        return;
    }

    if (media.id !== data.id || isNaN(data.currentTime)) {
        return;
    }

    media.currentTime = data.currentTime;
    media.paused = Boolean(data.paused);
    this.sendAll("mediaUpdate", media.timeupdate());
};

/**
 * Handles a user message to open a poll
 */
Channel.prototype.handleOpenPoll = function (user, data) {
    if (!this.hasPermission(user, "pollctl")) {
        return;
    }

    if (typeof data.title !== "string" || !(data.opts instanceof Array)) {
        return;
    }
    var title = data.title.substring(0, 255);
    var opts = [];

    for (var i = 0; i < data.opts.length; i++) {
        opts[i] = (""+data.opts[i]).substring(0, 255);
    }

    var obscured = (data.obscured === true);
    var poll = new Poll(user.name, title, opts, obscured);
    this.poll = poll;
    this.sendPoll(this.users);
    this.logger.log("*** " + user.name + " Opened Poll: '" + poll.title + "'");
};

/**
 * Handles a user message to close the active poll
 */
Channel.prototype.handleClosePoll = function (user) {
    if (!this.hasPermission(user, "pollctl")) {
        return;
    }

    if (this.poll) {
        if (this.poll.obscured) {
            this.poll.obscured = false;
            this.sendPoll(this.users);
        }

        this.logger.log("*** " + user.name + " closed the active poll");
        this.poll = false;
        this.sendAll("closePoll");
    }
};

/**
 * Handles a user message to vote in a poll
 */
Channel.prototype.handlePollVote = function (user, data) {
    if (!this.hasPermission(user, "pollvote")) {
        return;
    }

    if (typeof data.option !== "number") {
        return;
    }

    if (this.poll) {
        this.poll.vote(user.ip, data.option);
        this.sendPoll(this.users);
    }
};

/**
 * Handles a user message to voteskip the current video
 */
Channel.prototype.handleVoteskip = function (user) {
    if (!this.opts.allow_voteskip) {
        return;
    }

    if (!this.hasPermission(user, "voteskip")) {
        return;
    }

    user.setAFK(false);
    user.autoAFK();
    if (!this.voteskip) {
        this.voteskip = new Poll("voteskip", "voteskip", ["yes"]);
    }
    this.voteskip.vote(user.ip, 0);
    this.logger.log("### " + (user.name ? user.name : "anonymous") + " voteskipped");
    this.checkVoteskipPass();
};

/**
 * Checks if the voteskip requirement is met
 */
Channel.prototype.checkVoteskipPass = function () {
    if (!this.opts.allow_voteskip) {
        return false;
    }

    if (!this.voteskip) {
        return false;
    }

    var max = this.calcVoteskipMax();
    var need = Math.ceil(count * this.opts.voteskip_ratio);
    if (this.voteskip.counts[0] >= need) {
        this.logger.log("### Voteskip passed, skipping to next video");
        this.playNext();
    }

    this.sendVoteskipUpdate(this.users);
    return true;
};

/**
 * Sets the locked state of the playlist
 */
Channel.prototype.setLock = function (locked) {
    this.playlistLock = locked;
    this.sendPlaylistLock(this.users);
};

/**
 * Handles a user message to change the locked state of the playlist
 */
Channel.prototype.handleSetLock = function (user, data) {
    // TODO permission node?
    if (user.rank < 2) {
        return;
    }

    data.locked = Boolean(data.locked);
    this.logger.log("*** " + user.name + " set playlist lock to " + data.locked);
    this.setLock(data.locked);
};

/**
 * Handles a user message to toggle the locked state of the playlist
 */
Channel.prototype.handleToggleLock = function (user) {
    this.handleSetLock(user, { locked: !this.playlistLocked });
};

/**
 * Updates a chat filter, or adds a new one if the filter does not exist
 */
Channel.prototype.updateFilter = function (filter) {
    if (!filter.name) {
        filter.name = filter.source;
    }

    var found = false;
    for (var i = 0; i < this.filters.length; i++) {
        if (this.filters[i].name === filter.name) {
            found = true;
            this.filters[i] = filter;
            break;
        }
    }

    if (!found) {
        this.filters.push(filter);
    }
};

/**
 * Handles a user message to update a filter
 */
Channel.prototype.handleUpdateFilter = function (user, f) {
    if (!this.hasPermission(user, "filteredit")) {
        user.kick("Attempted updateFilter with insufficient permission");
        return;
    }

    if (typeof f.source !== "string" || typeof f.flags !== "string" ||
        typeof f.replace !== "string") {
        return;
    }

    if (typeof f.name !== "string") {
        f.name = f.source;
    }

    f.replace = f.replace.substring(0, 1000);
    f.flags = f.flags.substring(0, 4);

    // TODO XSS prevention
    try {
        new RegExp(f.source, f.flags);
    } catch (e) {
        return;
    }

    var filter = new Filter(f.name, f.source, f.flags, f.replace);
    filter.active = Boolean(f.active);
    filter.filterlinks = Boolean(f.filterlinks);

    this.logger.log("%%% " + user.name + " updated filter: " + f.name);
    this.updateFilter(filter);
};

/**
 * Removes a chat filter
 */
Channel.prototype.removeFilter = function (filter) {
    for (var i = 0; i < this.filters.length; i++) {
        if (this.filters[i].name === filter.name) {
            this.filters.splice(i, 1);
            break;
        }
    }
};

/**
 * Handles a user message to delete a chat filter
 */
Channel.prototype.handleRemoveFilter = function (user, f) {
    if (!this.hasPermission(user, "filteredit")) {
        user.kick("Attempted removeFilter with insufficient permission");
        return;
    }

    if (typeof f.name !== "string") {
        return;
    }

    this.logger.log("%%% " + user.name + " removed filter: " + f.name);
    this.removeFilter(f);
};

/**
 * Changes the order of chat filters
 */
Channel.prototype.moveFilter = function (from, to) {
    if (from < 0 || to < 0 || from >= this.filters.length || to >= this.filters.length) {
        return;
    }

    var f = this.filters[from];
    to = to > from ? to + 1 : to;
    from = to > from ? from : from + 1;

    this.filters.splice(to, 0, f);
    this.filters.splice(from, 1);
    // TODO broadcast
};

/**
 * Handles a user message to change the chat filter order
 */
Channel.prototype.handleMoveFilter = function (user, data) {
    if (!this.hasPermission(user, "filteredit")) {
        user.kick("Attempted moveFilter with insufficient permission");
        return;
    }

    if (typeof data.to !== "number" || typeof data.from !== "number") {
        return;
    }

    this.moveFilter(data.from, data.to);
};

/**
 * Handles a user message to change the channel permissions
 */
Channel.prototype.handleUpdatePermissions = function (user, perms) {
    if (user.rank < 3) {
        user.kick("Attempted setPermissions as a non-admin");
        return;
    }

    for (var key in perms) {
        if (key in this.permissions) {
            this.permissions[key] = perms[key];
        }
    }

    this.logger.log("%%% " + user.name + " updated permissions");
    this.sendAll("setPermissions", this.permissions);
};

/**
 * Handles a user message to change the channel settings
 */
Channel.prototype.handleUpdateOptions = function (user, data) {
    if (user.rank < 2) {
        user.kick("Attempted setOptions as a non-moderator");
        return;
    }

    if ("allow_voteskip" in data) {
        this.opts.voteskip = Boolean(data.allow_voteskip);
    }

    if ("voteskip_ratio" in data) {
        var ratio = parseFloat(data.voteskip_ratio);
        if (isNaN(ratio) || ratio < 0) {
            ratio = 0;
        }
        this.opts.voteskip_ratio = ratio;
    }

    if ("afk_timeout" in data) {
        var tm = parseInt(data.afk_timeout);
        if (isNaN(tm) || tm < 0) {
            tm = 0;
        }

        var same = tm === this.opts.afk_timeout;
        this.opts.afk_timeout = tm;
        if (!same) {
            this.users.forEach(function (u) {
                u.autoAFK();
            });
        }
    }

    if ("pagetitle" in data && user.rank >= 3) {
        this.opts.pagetitle = (""+data.pagetitle).substring(0, 100);
    }

    if ("maxlength" in data) {
        var ml = parseInt(data.maxlength);
        if (isNaN(ml) || ml < 0) {
            ml = 0;
        }
        this.opts.maxlength = ml;
    }

    if ("externalcss" in data && user.rank >= 3) {
        this.opts.externalcss = (""+data.externalcss).substring(0, 255);
    }

    if ("externaljs" in data && user.rank >= 3) {
        this.opts.externaljs = (""+data.externaljs).substring(0, 255);
    }

    if ("chat_antiflood" in data) {
        this.opts.chat_antiflood = Boolean(data.chat_antiflood);
    }

    if ("chat_antiflood_params" in data) {
        if (typeof data.chat_antiflood_params !== "object") {
            data.chat_antiflood_params = {
                burst: 4,
                sustained: 1
            };
        }

        var b = parseInt(data.chat_antiflood_params.burst);
        if (isNaN(b) || b < 0) {
            b = 1;
        }

        var s = parseInt(data.chat_antiflood_params.sustained);
        if (isNaN(s) || s <= 0) {
            s = 1;
        }

        var c = b / s;
        this.opts.chat_antiflood_params = {
            burst: b,
            sustained: s,
            cooldown: c
        };
    }

    if ("show_public" in data && user.rank >= 3) {
        this.opts.show_public = Boolean(data.show_public);
    }

    if ("enable_link_regex" in data) {
        this.opts.enable_link_regex = Boolean(data.enable_link_regex);
    }

    if ("password" in data && user.rank >= 3) {
        var pw = data.password + "";
        pw = pw === "" ? false : pw.substring(0, 100);
        this.opts.password = pw;
    }

    this.logger.log("%%% " + user.name + " updated channel options");
    this.sendOpts(this.users);
};

/**
 * Handles a user message to set the inline channel CSS
 */
Channel.prototype.handleSetCSS = function (user, data) {
    if (user.rank < 3) {
        user.kick("Attempted setChannelCSS as non-admin");
        return;
    }

    if (typeof data.css !== "string") {
        return;
    }
    var css = data.css.substring(0, 20000);

    this.css = css;
    this.sendCSSJS(this.users);

    this.logger.log("%%% " + user.name + " updated the channel CSS");
};

/**
 * Handles a user message to set the inline channel CSS
 */
Channel.prototype.handleSetJS = function (user, data) {
    if (user.rank < 3) {
        user.kick("Attempted setChannelJS as non-admin");
        return;
    }

    if (typeof data.js !== "string") {
        return;
    }
    var js = data.js.substring(0, 20000);

    this.js = js;
    this.sendCSSJS(this.users);

    this.logger.log("%%% " + user.name + " updated the channel JS");
};

/**
 * Sets the MOTD
 */
Channel.prototype.setMotd = function (motd) {
    // TODO XSS
    var html = motd.replace(/\n/g, "<br>");
    this.motd = {
        motd: motd,
        html: html
    };
    this.sendMotd(this.users);
};

/**
 * Handles a user message to update the MOTD
 */
Channel.prototype.handleSetMotd = function (user, data) {
    if (!this.hasPermission(user, "motdedit")) {
        user.kick("Attempted setMotd with insufficient permission");
        return;
    }

    if (typeof data.motd !== "string") {
        return;
    }
    var motd = data.motd.substring(0, 20000);

    this.setMotd(motd);
    this.logger.log("%%% " + user.name + " updated the MOTD");
};

/**
 * Handles a user chat message
 */
Channel.prototype.handleChat = function (user, data) {
    if (!this.hasPermission(user, "chat")) {
        return;
    }

    if (typeof data.meta !== "object") {
        data.meta = {};
    }

    if (!user.name) {
        return;
    }

    if (typeof data.msg !== "string") {
        return;
    }
    var msg = data.msg.substring(0, 240);

    var muted = this.isMuted(user.name);
    var smuted = this.isShadowMuted(user.name);

    var meta = {};
    if (user.rank >= 2) {
        if ("modflair" in data.meta && data.meta.modflair === user.rank) {
            meta.modflair = data.meta.modflair;
        }
    }

    if (user.rank < 2 && this.opts.chat_antiflood &&
        user.chatLimiter.throttle(this.opts.chat_antiflood_params)) {
        user.socket.emit("chatCooldown", 1000 / this.opts.chat_antiflood_params.sustained);
    }

    if (smuted) {
        // TODO XSS
        msg = this.filterMessage(msg);
        var msgobj = {
            username: user.name,
            msg: msg,
            meta: meta,
            time: Date.now()
        };
        this.shadowMutedUsers().forEach(function (u) {
            u.socket.emit("chatMsg", msgobject);
        });
        return;
    }

    if (msg.indexOf("/") === 0) {
        if (!ChatCommand.handle(this, user, msg, meta)) {
            this.sendMessage(user, msg, meta);
        }
    } else {
        if (msg.indexOf(">") === 0) {
            data.meta.addClass = "greentext";
        }
        this.sendMessage(user, msg, meta);
    }
};

/**
 * Filters a chat message
 */
Channel.prototype.filterMessage = function (msg) {
    const link = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;
    var parts = msg.split(link);

    for (var j = 0; j < parts.length; j++) {
        // Case 1: The substring is a URL
        if (this.opts.enable_link_regex && parts[j].match(link)) {
            var original = parts[j];
            // Apply chat filters that are active and filter links
            for (var i = 0; i < this.filters.length; i++) {
                if (!this.filters[i].filterlinks || !this.filters[i].active) {
                    continue;
                }
                parts[j] = this.filters[i].filter(parts[j]);
            }

            // Unchanged, apply link filter
            if (parts[j] === original) {
                parts[j] = url.format(url.parse(parts[j]));
                parts[j] = parts[j].replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");
            }

            continue;
        } else {
        // Substring is not a URL
            for (var i = 0; i < this.filters.length; i++) {
                if (!this.filters[i].active) {
                    continue;
                }

                parts[j] = this.filters[i].filter(parts[j]);
            }
        }
    }

    // Recombine the message
    return parts.join("");
};

/**
 * Sends a chat message
 */
Channel.prototype.sendMessage = function (user, msg, meta) {
    // TODO HTML escape
    msg = this.filterMessage(msg);
    var msgobj = {
        username: user.name,
        msg: msg,
        meta: meta,
        time: Date.now()
    };

    this.sendAll("chatMsg", msgobj);
    this.chatbuffer.push(msgobj);
    if (this.chatbuffer.length > 15) {
        this.chatbuffer.shift();
    }

    this.logger.log("<" + user.name + (meta.addClass ? "." + meta.addClass : "") + "> " +
                    msg);
};

/**
 * Handles a user message to change another user's rank
 */
Channel.prototype.handleSetRank = function (user, data) {
    var self = this;
    if (user.rank < 2) {
        user.kick("Attempted setChannelRank as a non-moderator");
        return;
    }

    if (typeof data.user !== "string" || typeof data.rank !== "number") {
        return;
    }
    var name = data.user.substring(0, 20);
    var rank = data.rank;

    if (isNaN(rank) || rank < 1 || rank >= user.rank) {
        return;
    }

    var receiver;
    var lowerName = name.toLowerCase();
    for (var i = 0; i < self.users.length; i++) {
        if (self.users[i].name.toLowerCase() === lowerName) {
            receiver = self.users[i];
            break;
        }
    }

    var updateDB = function () {
        self.getRank(name, function (err, oldrank) {
            if (self.dead || err) {
                return;
            }

            if (oldrank >= user.rank) {
                return;
            }

            db.channels.setRank(self.name, name, rank, function (err, res) {
                if (self.dead || err) {
                    return;
                }

                self.logger.log("*** " + user.name + " set " + name + "'s rank to " + rank);
            });
        });
    };

    if (receiver) {
        if (Math.max(receiver.rank, receiver.global_rank) > user.rank) {
            return;
        }

        if (receiver.loggedIn) {
            updateDB();
        }

        self.sendAll("setUserRank", {
            name: name,
            rank: rank
        });
    } else if (self.registered) {
        updateDB();
    }
};

/**
 * Assigns a leader for video playback
 */
Channel.prototype.changeLeader = function (name) {
    if (this.leader != null) {
        var old = this.leader;
        this.leader = null;
        if (old.rank === 1.5) {
            old.rank = old.oldrank;
            old.socket.emit("rank", old.rank);
            this.sendAll("setUserRank", {
                name: old.name,
                rank: old.rank
            });
        }
    }

    if (!name) {
        this.sendAll("setLeader", "");
        this.logger.log("*** Resuming autolead");
        this.playlist.lead(true);
        return;
    }

    for (var i = 0; i < this.users.length; i++) {
        if (this.users[i].name === name) {
            this.sendAll("setLeader", name);
            this.logger.log("*** Assigned leader: " + name);
            this.playlist.lead(false);
            this.leader = this.users[i];
            if (this.users[i].rank < 1.5) {
                this.users[i].oldrank = this.users[i].rank;
                this.users[i].rank = 1.5;
                this.users[i].socket.emit("rank", 1.5);
                this.sendAll("setUserRank", {
                    name: name,
                    rank: this.users[i].rank
                });
            }
            break;
        }
    }
};

/**
 * Handles a user message to assign a new leader
 */
Channel.prototype.handleChangeLeader = function (user, data) {
    // TODO permission node?
    if (user.rank < 2) {
        user.kick("Attempted assignLeader with insufficient permission");
        return;
    }

    if (typeof data.name !== "string") {
        return;
    }

    this.changeLeader(data.name);
    this.logger.log("### " + user.name + " assigned leader to " + data.name);
};

/**
 * Searches channel library
 */
Channel.prototype.search = function (query, callback) {
    var self = this;
    if (!self.registered) {
        callback([]);
        return;
    }

    if (typeof query !== "string") {
        query = "";
    }

    query = query.substring(0, 100);

    db.channels.searchLibrary(self.name, query, function (err, res) {
        if (err) {
            res = [];
        }

        res.sort(function(a, b) {
            var x = a.title.toLowerCase();
            var y = b.title.toLowerCase();

            return (x == y) ? 0 : (x < y ? -1 : 1);
        });

        res.forEach(function (r) {
            r.duration = util.formatTime(r.seconds);
        });

        callback(res);
    });
};

/**
 * Sends the result of readLog() to a user if the user has sufficient permission
 */
Channel.prototype.tryReadLog = function (user) {
    if (user.rank < 3) {
        user.kick("Attempted readChanLog with insufficient permission");
        return;
    }

    if (!self.registered) {
        user.socket.emit("readChanLog", {
            success: false,
            data: "Channel log is only available to registered channels."
        });
        return;
    }

    var filterIp = user.global_rank < 255;
    this.readLog(filterIp, function (err, data) {
        if (err) {
            user.socket.emit("readChanLog", {
                success: false,
                data: "Reading channel log failed."
            });
        } else {
            user.socket.emit("readChanLog", {
                success: true,
                data: data
            });
        }
    });
};

/**
 * Reads the last 100KiB of the channel's log file, masking IP addresses if desired
 */
Channel.prototype.readLog = function (filterIp, callback) {
    var maxLen = 102400; // Limit to last 100KiB
    var file = this.logger.filename;

    fs.stat(file, function (err, data) {
        if (err) {
            callback(err, null);
            return;
        }

        var start = Math.max(data.size - maxLen, 0);
        var end = data.size - 1;

        var rs = fs.createReadStream(file, {
            start: start,
            end: end
        });

        var buffer = "";
        rs.on("data", function (data) {
            buffer += data;
        });

        rs.on("end", function () {
            if (filterIp) {
                buffer = buffer.replace(
                    /\d+\.\d+\.(\d+\.\d+)/g,
                    "x.x.$1"
                ).replace(
                    /\d+\.\d+\.(\d+)/g,
                    "x.x.$.*"
                );
            }

            callback(null, buffer);
        });
    });
};

module.exports = Channel;
