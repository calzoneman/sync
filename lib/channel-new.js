var util = require("./utilities");
var db = require("./database");
var Playlist = require("./playlist");
var Filter = require("./filter").Filter;
var Logger = require("./logger");
var AsyncQueue = require("./asyncqueue");

var EventEmitter = require("events").EventEmitter;
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
        playlistnext: 1.5, // TODO I don't think this is used
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

Channel.prototype = EventEmitter.prototype;

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
    var self = this;
    if (self.ready) {
        setImmediate(fn);
    } else {
        self.on("ready", fn);
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
    var self = this;
    self.motd.motd = message;
    // TODO XSS filter
    self.motd.html = message.replace(/\n/g, "<br>");
    self.sendMOTD(self.users);
};

/**
 * Send the MOTD to the given users
 */
Channel.prototype.sendMOTD = function (users) {
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("setMotd", self.motd);
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

    self.users.forEach(function(u) {
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

    if (self.registered) {
        db.channels.addToLibrary(self.name, media);
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
    var self = this;
    if (!self.hasPermission(actor, "ban")) {
        return;
    }

    delete self.namebans[name];
    self.logger.log("*** " + actor.name + " un-namebanned " + name);
    self.sendModMessage(actor.name + " unbanned " + name, self.permissions.ban);

    if (!self.registered) {
        return;
    }

    db.channels.unbanName(self.name, name);
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
    var self = this;
    if (!self.hasPermission(actor, "ban")) {
        return;
    }

    var record = self.ipbans[ip];
    delete self.ipbans[ip];
    self.logger.log("*** " + actor.name + " unbanned " + ip + " (" + record.name + ")");
    self.sendModMessage(actor.name + " unbanned " + util.maskIP(ip) + " (" + record.name + ")", self.permissions.ban);

    if (!self.registered) {
        return;
    }

    db.channels.unbanIP(self.name, ip);
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
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("channelOpts", self.opts);
    });
};

/**
 * Calculates the number of eligible users to voteskip
 */
Channel.prototype.calcVoteskipMax = function () {
    var self = this;
    return this.users.map(function (u) {
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
    var self = this;
    var update = self.getVoteskipPacket();
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
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("setMotd", self.motd);
    });
};

/**
 * Sends the drink count
 */
Channel.prototype.sendDrinks = function (users) {
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("drinkCount", self.drinks);
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
                    afterData(dummy, false, vids[i]);
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

    });
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
