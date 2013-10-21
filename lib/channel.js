
/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");
var path = require("path");
var url = require("url");
var Server = require("./server");
var Poll = require("./poll.js").Poll;
var Media = require("./media.js").Media;
var Logger = require("./logger.js");
var ChatCommand = require("./chatcommand.js");
var Filter = require("./filter.js").Filter;
var Playlist = require("./playlist");
var sanitize = require("validator").sanitize;
var $util = require("./utilities");
var AsyncQueue = require("./asyncqueue");
var ActionLog = require("./actionlog");
var InfoGetter = require("./get-info");

var Channel = function(name) {
    var self = this;
    Logger.syslog.log("Opening channel " + name);
    self.initialized = false;
    self.dbloaded = false;
    self.server = Server.getServer();

    self.name = name;
    self.canonical_name = name.toLowerCase();
    // Initialize defaults
    self.registered = false;
    self.users = [];
    self.mutedUsers = new $util.Set();
    self.playlist = new Playlist(self);
    self.plqueue = new AsyncQueue();
    self.position = -1;
    self.drinks = 0;
    self.leader = null;
    self.chatbuffer = [];
    self.openqueue = false;
    self.poll = false;
    self.voteskip = false;
    self.permissions = {
        oplaylistadd: -1,
        oplaylistnext: 1.5,
        oplaylistmove: 1.5,
        oplaylistdelete: 2,
        oplaylistjump: 1.5,
        oplaylistaddlist: 1.5,
        playlistadd: 1.5,
        playlistnext: 1.5,
        playlistmove: 1.5,
        playlistdelete: 2,
        playlistjump: 1.5,
        playlistaddlist: 1.5,
        playlistaddcustom: 3,
        playlistaddlive: 1.5,
        exceedmaxlength: 2,
        addnontemp: 2,
        settemp: 2,
        playlistgeturl: 1.5,
        playlistshuffle: 2,
        playlistclear: 2,
        pollctl: 1.5,
        pollvote: -1,
        viewhiddenpoll: 1.5,
        voteskip: -1,
        mute: 1.5,
        kick: 1.5,
        ban: 2,
        motdedit: 3,
        filteredit: 3,
        drink: 1.5,
        chat: 0
    };
    self.opts = {
        allow_voteskip: true,
        voteskip_ratio: 0.5,
        afk_timeout: 180,
        pagetitle: self.name,
        maxlength: 0,
        externalcss: "",
        externaljs: "",
        chat_antiflood: false,
        show_public: false,
        enable_link_regex: true
    };
    self.filters = [
        new Filter("monospace", "`([^`]+)`", "g", "<code>$1</code>"),
        new Filter("bold", "(^|\\s)\\*([^\\*]+)\\*", "g", "$1<strong>$2</strong>"),
        new Filter("italic", "(^| )_([^_]+)_", "g", "$1<em>$2</em>"),
        new Filter("strikethrough", "~~([^~]+)~~", "g", "<s>$1</s>"),
        new Filter("inline spoiler", "\\[spoiler\\](.*)\\[\\/spoiler\\]", "ig", "<span class=\"spoiler\">$1</span>"),
    ];
    self.motd = {
        motd: "",
        html: ""
    };
    self.ipbans = {};
    self.namebans = {};
    self.ip_alias = {};
    self.name_alias = {};
    self.login_hist = [];
    self.logger = new Logger.Logger(path.join(__dirname, "../chanlogs",
                                    self.canonical_name + ".log"));
    self.i = 0;
    self.time = new Date().getTime();
    self.plmeta = {
        count: 0,
        time: "00:00"
    };

    self.css = "";
    self.js = "";

    self.ipkey = "";
    for(var i = 0; i < 15; i++) {
        self.ipkey += "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[parseInt(Math.random() * 65)]
    }

    Server.getServer().db.loadChannelData(self, function (err) {
        if (err && err === "channel_dead")
            return;
        else if (!err || err === "channel_unregistered")
            self.dbloaded = true;

        if(self.registered) {
            self.loadDump();
        }
    });
}

/* REGION Permissions */
Channel.prototype.hasPermission = function(user, key) {
    if(key.indexOf("playlist") == 0 && this.openqueue) {
        var key2 = "o" + key;
        var v = this.permissions[key2];
        if(typeof v == "number" && user.rank >= v) {
            return true;
        }
    }
    var v = this.permissions[key];
    if(typeof v != "number") {
        return false;
    }
    return user.rank >= v;
}

/* REGION Channel data */
Channel.prototype.loadDump = function() {
    var self = this;
    if(self.name === "")
        return;
    fs.stat(path.join(__dirname, "../chandump", self.name),
            function (err, stats) {
        if (self.dead)
            return;

        if(!err) {
            var mb = stats.size / 1048576;
            mb = parseInt(mb * 100) / 100;
            if(mb > 1) {
                Logger.errlog.log("Large chandump detected: " + self.name +
                                  " (" + mb + " MB)");
                self.updateMotd("Your channel file has exceeded the " +
                                "maximum size of 1MB and cannot be " +
                                "loaded.  Please ask an administrator " +
                                "for assistance in restoring it.");
                return;
            }
        }
        fs.readFile(path.join(__dirname, "../chandump", self.name),
                    function(err, data) {
            if (self.dead)
                return;

            if(err) {
                if(err.code == "ENOENT") {
                    Logger.errlog.log("WARN: missing dump for " + self.name);
                    self.initialized = true;
                    self.saveDump();
                }
                else {
                    Logger.errlog.log("Failed to open channel dump " + self.name);
                    Logger.errlog.log(err);
                }
                return;
            }
            try {
                self.logger.log("*** Loading channel dump from disk");
                data = JSON.parse(data);
                /* Load the playlist */

                // Old
                if(data.queue) {
                    if(data.position < 0)
                        data.position = 0;
                    for(var i = 0; i < data.queue.length; i++) {
                        var e = data.queue[i];
                        var m = new Media(e.id, e.title, e.seconds, e.type);
                        var p = self.playlist.makeItem(m);
                        p.queueby = data.queue[i].queueby ? data.queue[i].queueby
                                                          : "";
                        p.temp = e.temp;
                        self.playlist.items.append(p);
                        if(i == data.position)
                            self.playlist.current = p;
                    }
                    self.sendAll("playlist", self.playlist.items.toArray());
                    self.broadcastPlaylistMeta();
                    self.playlist.startPlayback();
                }
                // Current
                else if(data.playlist) {
                    self.playlist.load(data.playlist, function() {
                        if (self.dead)
                            return;
                        self.sendAll("playlist", self.playlist.items.toArray());
                        self.broadcastPlaylistMeta();
                        self.playlist.startPlayback(data.playlist.time);
                    });
                }
                for(var key in data.opts) {
                    // Gotta love backwards compatibility
                    if(key == "customcss" || key == "customjs") {
                        var k = key.substring(6);
                        self.opts[k] = data.opts[key];
                    }
                    else {
                        self.opts[key] = data.opts[key];
                    }
                }
                for(var key in data.permissions) {
                    self.permissions[key] = data.permissions[key];
                }
                self.sendAll("setPermissions", self.permissions);
                self.broadcastOpts();
                self.users.forEach(function (u) {
                    u.autoAFK();
                });
                if(data.filters) {
                    for(var i = 0; i < data.filters.length; i++) {
                        var f = data.filters[i];
                        // Backwards compatibility
                        if(f[0] != undefined) {
                            var filt = new Filter("", f[0], "g", f[1]);
                            filt.active = f[2];
                            self.updateFilter(filt, false);
                        }
                        else {
                            var filt = new Filter(f.name, f.source, f.flags, f.replace);
                            filt.active = f.active;
                            filt.filterlinks = f.filterlinks;
                            self.updateFilter(filt, false);
                        }
                    }
                    self.broadcastChatFilters();
                }
                if(data.motd) {
                    self.motd = data.motd;
                    self.broadcastMotd();
                }
                self.setLock(!(data.openqueue || false));
                self.chatbuffer = data.chatbuffer || [];
                for(var i = 0; i < self.chatbuffer.length; i++) {
                    self.sendAll("chatMsg", self.chatbuffer[i]);
                }
                self.css = data.css || "";
                self.js = data.js || "";
                self.sendAll("channelCSSJS", {css: self.css, js: self.js});
                self.initialized = true;
            }
            catch(e) {
                Logger.errlog.log("Channel dump load failed: ");
                Logger.errlog.log(e.stack);
            }
        });
    });
}

Channel.prototype.saveDump = function() {
    if (this.dead)
        return;
    if(!this.initialized || this.name === "")
        return;
    var filts = new Array(this.filters.length);
    for(var i = 0; i < this.filters.length; i++) {
        filts[i] = this.filters[i].pack();
    }
    var dump = {
        position: this.position,
        currentTime: this.media ? this.media.currentTime : 0,
        playlist: this.playlist.dump(),
        opts: this.opts,
        permissions: this.permissions,
        filters: filts,
        motd: this.motd,
        openqueue: this.openqueue,
        chatbuffer: this.chatbuffer,
        css: this.css,
        js: this.js
    };
    var text = JSON.stringify(dump);
    fs.writeFileSync(path.join(__dirname, "../chandump", this.name), text);
}

Channel.prototype.readLog = function (filterIp, callback) {
    var maxLen = 100000; // Most recent 100KB
    var file = this.logger.filename;
    fs.stat(file, function (err, data) {
        if(err) {
            callback(err, null);
            return;
        }

        var start = data.size - maxLen;
        if(start < 0) {
            start = 0;
        }
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
            if(filterIp) {
                buffer = buffer.replace(
                    /\d+\.\d+\.(\d+\.\d+)/g,
                    "x.x.$1"
                ).replace(
                    /\d+\.\d+\.(\d+)/g,
                    "x.x.$1.*"
                );
            }

            callback(false, buffer);
        });
    });
}

Channel.prototype.tryReadLog = function (user) {
    if(user.rank < 3) {
        user.kick("Attempted readChanLog with insufficient permission");
        return;
    }

    var filterIp = true;
    if(user.global_rank >= 255)
        filterIp = false;

    this.readLog(filterIp, function (err, data) {
        if(err) {
            user.socket.emit("readChanLog", {
                success: false
            });
        } else {
            user.socket.emit("readChanLog", {
                success: true,
                data: data
            });
        }
    });
}

Channel.prototype.tryRegister = function (user) {
    var self = this;
    if(self.registered) {
        ActionLog.record(user.ip, user.name, "channel-register-failure",
                         [self.name, "Channel already registered"]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "This channel is already registered"
        });
    }
    else if(!user.loggedIn) {
        ActionLog.record(user.ip, user.name, "channel-register-failure",
                         [self.name, "Not logged in"]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "You must log in to register a channel"
        });

    }
    else if(user.rank < 10) {
        ActionLog.record(user.ip, user.name, "channel-register-failure",
                         [self.name, "Insufficient permissions"]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "You don't have permission to register this channel"
        });
    }
    else {
        self.server.db.registerChannel(self.name, user.name,
                                       function (err, res) {
            if(err) {
                user.socket.emit("registerChannel", {
                    success: false,
                    error: "Unable to register channel: " + err
                });
                return;
            }

            ActionLog.record(user.ip, user.name,
                             "channel-register-success", self.name);
            if (self.dead)
                return;
            self.registered = true;
            self.initialized = true;
            self.saveDump();
            self.saveRank(user);
            user.socket.emit("registerChannel", {
                success: true
            });
            self.logger.log("*** " + user.name + " registered the channel");
        });
    }
}

Channel.prototype.unregister = function (user) {
    var self = this;

    if(!self.registered) {
        user.socket.emit("unregisterChannel", {
            success: false,
            error: "This channel is already unregistered"
        });
        return;
    }

    if(user.rank < 10) {
        user.socket.emit("unregisterChannel", {
            success: false,
            error: "You must be the channel owner to unregister it"
        });
        return;
    }
    self.server.db.dropChannel(self.name, function (err, res) {
        if(err) {
            user.socket.emit("unregisterChannel", {
                success: false,
                error: "Unregistration failed: " + err
            });
            return;
        }

        user.socket.emit("unregisterChannel", { success: true });
        if (!self.dead)
            self.registered = false;
    });
}

Channel.prototype.getRank = function (name, callback) {
    var self = this;
    self.server.db.getGlobalRank(name, function (err, global) {
        if (self.dead)
            return;

        if(err) {
            callback(err, null);
            return;
        }

        if(!self.registered) {
            callback(null, global);
            return;
        }

        self.server.db.getChannelRank(self.name, name,
                                      function (err, rank) {
            if(err) {
                callback(err, null);
                return;
            }

            callback(null, rank > global ? rank : global);
        });
    });
}

Channel.prototype.saveRank = function (user, callback) {
    if(!this.registered)
        return;
    if(!user.saverank)
        return;
    this.server.db.setChannelRank(this.name, user.name, user.rank, callback);
}

Channel.prototype.saveInitialRank = function (user, callback) {
    if(!this.registered)
        return;
    this.server.db.insertChannelRank(this.name, user.name, user.rank, callback);
};

Channel.prototype.getIPRank = function (ip, callback) {
    var self = this;
    self.server.db.listAliases(ip, function (err, names) {
        if (self.dead)
            return;
        self.server.db.listGlobalRanks(names, function (err, res) {
            if(err) {
                callback(err, null);
                return;
            }

            var rank = 0;
            for(var i in res) {
                rank = (res[i] > rank) ? res[i] : rank;
            }

            if (!self.registered) {
                callback(null, rank);
                return;
            }

            self.server.db.listChannelUserRanks(self.name, names,
                                                function (err, res) {
                if (self.dead)
                    return;

                if(err) {
                    callback(err, null);
                    return;
                }

                for(var i in res) {
                    rank = (res[i] > rank) ? res[i] : rank;
                }

                callback(null, rank);
            });

        });
    });
}

Channel.prototype.cacheMedia = function(media) {
    var self = this;
    // Prevent the copy in the playlist from messing with this one
    media = media.dup();
    if(media.temp) {
        return;
    }
    if(self.registered) {
        self.server.db.addToLibrary(self.name, media);
    }
}

Channel.prototype.tryNameBan = function(actor, name) {
    var self = this;
    if(!self.hasPermission(actor, "ban")) {
        return false;
    }

    name = name.toLowerCase();
    if(name == actor.name.toLowerCase()) {
        actor.socket.emit("costanza", {
            msg: "Trying to ban yourself?"
        });
        return;
    }

    self.getRank(name, function (err, rank) {
        if (self.dead)
            return;
        if(err) {
            actor.socket.emit("errorMsg", {
                msg: "Internal error " + err
            });
            return;
        }

        if(rank >= actor.rank) {
            actor.socket.emit("errorMsg", {
                msg: "You don't have permission to ban " + name
            });
            return;
        }

        self.namebans[name] = actor.name;
        for(var i = 0; i < self.users.length; i++) {
            if(self.users[i].name.toLowerCase() == name) {
                self.kick(self.users[i], "You're banned!");
                break;
            }
        }
        self.logger.log("*** " + actor.name + " namebanned " + name);
        var notice = {
            username: "[server]",
            msg: actor.name + " banned " + name,
            msgclass: "server-whisper",
            time: Date.now()
        };
        self.users.forEach(function(u) {
            if(self.hasPermission(u, "ban")) {
                self.sendBanlist(u);
                u.socket.emit("chatMsg", notice);
            }
        });

        if(!self.registered) {
            return;
        }

        self.server.db.addChannelBan(self.name, "*", name, actor.name);
    });
}

Channel.prototype.unbanName = function(actor, name) {
    var self = this;
    if(!self.hasPermission(actor, "ban")) {
        actor.kick("Attempted unban with insufficient permission");
        return false;
    }

    self.namebans[name] = null;
    delete self.namebans[name];
    self.logger.log("*** " + actor.name + " un-namebanned " + name);
    if (!self.registered)
        return;

    self.server.db.clearChannelNameBan(self.name, name, function (err, res) {
        if (self.dead)
            return;

        self.users.forEach(function(u) {
            self.sendBanlist(u);
        });
    });
}

Channel.prototype.tryIPBan = function(actor, name, range) {
    var self = this;
    if(!self.hasPermission(actor, "ban")) {
        return;
    }
    if(typeof name != "string") {
        return;
    }
    name = name.toLowerCase();
    if(name == actor.name.toLowerCase()) {
        actor.socket.emit("costanza", {
            msg: "Trying to ban yourself?"
        });
        return;
    }
    self.server.db.listIPsForName(name, function (err, ips) {
        if (self.dead)
            return;

        if(err) {
            actor.socket.emit("errorMsg", {
                msg: "Internal error: " + err
            });
            return;
        }
        ips.forEach(function (ip) {
            if(range)
                ip = ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, "$1.$2.$3");
            self.getIPRank(ip, function (err, rank) {
                if (self.dead)
                    return;

                if(err) {
                    actor.socket.emit("errorMsg", {
                        msg: "Internal error: " + err
                    });
                    return;
                }

                if(rank >= actor.rank) {
                    actor.socket.emit("errorMsg", {
                        msg: "You don't have permission to ban IP: " +
                             $util.maskIP(ip)
                    });
                    return;
                }

                self.ipbans[ip] = [name, actor.name];
                self.logger.log("*** " + actor.name + " banned " + ip +
                                " (" + name + ")");

                for(var i = 0; i < self.users.length; i++) {
                    if(self.users[i].ip.indexOf(ip) == 0) {
                        self.kick(self.users[i], "Your IP is banned!");
                        i--;
                    }
                }

                if(!self.registered)
                    return;

                self.server.db.addChannelBan(self.name, ip, name,
                                             actor.name,
                                             function (err, res) {
                    if (self.dead)
                        return;

                    var notice = {
                        username: "[server]",
                        msg: actor.name + " banned " + $util.maskIP(ip) +
                             " (" + name + ")",
                        msgclass: "server-whisper",
                        time: Date.now()
                    };
                    self.users.forEach(function(u) {
                        if(self.hasPermission(u, "ban")) {
                            u.socket.emit("chatMsg", notice);
                            self.sendBanlist(u);
                        }
                    });
                });
            });
        });
    });
}

Channel.prototype.unbanIP = function(actor, ip) {
    var self = this;
    if(!self.hasPermission(actor, "ban")) {
        actor.kick("Attempted unban with insufficient permission");
        return false;
    }

    self.ipbans[ip] = null;
    self.users.forEach(function(u) {
        self.sendBanlist(u);
    });

    self.logger.log("*** " + actor.name + " unbanned " + ip);

    if(!self.registered)
        return false;

    // Update database ban table
    self.server.db.clearChannelIPBan(self.name, ip);
}

Channel.prototype.tryUnban = function(actor, data) {
    if(typeof data.ip_hidden === "string") {
        var ip = this.hideIP(data.ip_hidden);
        this.unbanIP(actor, ip);
    }
    if(typeof data.name === "string") {
        this.unbanName(actor, data.name);
    }
}

Channel.prototype.search = function(query, callback) {
    var self = this;
    if(!self.registered) {
        callback([]);
        return;
    }
    self.server.db.searchLibrary(self.name, query, function (err, res) {
        if(err) {
            res = [];
        }

        res.sort(function(a, b) {
            var x = a.title.toLowerCase();
            var y = b.title.toLowerCase();

            return (x == y) ? 0 : (x < y ? -1 : 1);
        });

        res.forEach(function (r) {
            r.duration = $util.formatTime(r.seconds);
        });
        callback(res);
    });
}

/* REGION User interaction */

Channel.prototype.userJoin = function(user) {
    var self = this;
    var parts = user.ip.split(".");
    var slash24 = parts[0] + "." + parts[1] + "." + parts[2];
    // GTFO
    if((user.ip in this.ipbans && this.ipbans[user.ip] != null) ||
       (slash24 in this.ipbans && this.ipbans[slash24] != null)) {
        this.logger.log("--- Kicking " + user.ip + " - banned");
        this.kick(user, "You're banned!");
        return;
    }
    if(user.name && user.name.toLowerCase() in this.namebans &&
        this.namebans[user.name.toLowerCase()] != null) {
        this.kick(user, "You're banned!");
        return;
    }

    // Join the socket pool for this channel
    user.socket.join(this.name);

    // Prevent duplicate login
    if(user.name != "") {
        for(var i = 0; i < this.users.length; i++) {
            if(this.users[i].name.toLowerCase() == user.name.toLowerCase()) {
                if (this.users[i] == user) {
                    Logger.errlog.log("Wat: userJoin() called on user "+
                                      "already in the channel");
                    break;
                }
                this.kick(this.users[i], "Duplicate login");
            }
        }
    }

    this.users.push(user);
    this.broadcastVoteskipUpdate();
    if(user.name != "") {
        self.getRank(user.name, function (err, rank) {
            if (self.dead)
                return;
            if(err) {
                user.rank = user.global_rank;
                user.saverank = false;
            } else {
                user.saverank = true;
                user.rank = rank;
            }
            user.socket.emit("rank", rank);
            self.broadcastNewUser(user);
        });
    }
    this.broadcastUsercount();

    // Set the new guy up
    this.sendPlaylist(user);
    this.sendMediaUpdate(user);
    user.socket.emit("setPlaylistLocked", {locked: !this.openqueue});
    this.sendUserlist(user);
    this.sendRecentChat(user);
    user.socket.emit("channelCSSJS", {css: this.css, js: this.js});
    if(this.poll) {
        user.socket.emit("newPoll", this.poll.packUpdate());
    }
    user.socket.emit("channelOpts", this.opts);
    user.socket.emit("setPermissions", this.permissions);
    user.socket.emit("setMotd", this.motd);
    user.socket.emit("drinkCount", this.drinks);

    this.logger.log("+++ " + user.ip + " joined");
    Logger.syslog.log(user.ip + " joined channel " + this.name);
}

Channel.prototype.userLeave = function(user) {
    // Their socket might already be dead, so wrap in a try-catch
    try {
        user.socket.leave(this.name);
    }
    catch(e) {}

    // Undo vote for people who leave
    if(this.poll) {
        this.poll.unvote(user.ip);
        this.broadcastPollUpdate();
    }
    if(this.voteskip) {
        this.voteskip.unvote(user.ip);
    }

    // If they were leading, return control to the server
    if(this.leader == user) {
        this.changeLeader("");
    }

    // Remove the user from the client list for this channel
    var idx = this.users.indexOf(user);
    if(idx >= 0 && idx < this.users.length)
        this.users.splice(idx, 1);
    this.checkVoteskipPass();
    this.broadcastUsercount();
    if(user.name != "") {
        this.sendAll("userLeave", {
            name: user.name
        });
    }
    this.logger.log("--- " + user.ip + " (" + user.name + ") left");
    if(this.users.length == 0) {
        this.logger.log("*** Channel empty, unloading");
        this.server.unloadChannel(this);
    }
}

Channel.prototype.kick = function(user, reason) {
    user.socket.emit("kick", {
        reason: reason
    });
    user.socket.disconnect(true);
    user.channel = null;
}

Channel.prototype.hideIP = function(ip) {
    var chars = new Array(15);
    for(var i = 0; i < ip.length; i++) {
        chars[i] = String.fromCharCode(ip.charCodeAt(i) ^ this.ipkey.charCodeAt(i));
    }
    return chars.join("");
}

Channel.prototype.sendLoginHistory = function(user) {
    if(user.rank < 2)
        return;

    user.socket.emit("recentLogins", this.login_hist);
}

Channel.prototype.sendBanlist = function(user) {
    if(this.hasPermission(user, "ban")) {
        var ents = [];
        for(var ip in this.ipbans) {
            if(this.ipbans[ip] != null) {
                var name = this.ipbans[ip][0];
                var ip_hidden = this.hideIP(ip);
                var disp = ip;
                if(user.rank < 255) {
                    disp = $util.maskIP(ip);
                }
                ents.push({
                    ip_displayed: disp,
                    ip_hidden: ip_hidden,
                    name: name,
                    aliases: this.ip_alias[ip] || [],
                    banner: this.ipbans[ip][1]
                });
            }
        }
        for(var name in this.namebans) {
            if(this.namebans[name] != null) {
                ents.push({
                    ip_displayed: "*",
                    ip_hidden: false,
                    name: name,
                    aliases: this.name_alias[name] || [],
                    banner: this.namebans[name]
                });
            }
        }
        user.socket.emit("banlist", ents);
    }
}

Channel.prototype.sendChatFilters = function(user) {
    if(this.hasPermission(user, "filteredit")) {
        var filts = new Array(this.filters.length);
        for(var i = 0; i < this.filters.length; i++) {
            filts[i] = this.filters[i].pack();
        }
        user.socket.emit("chatFilters", filts);
    }
}

Channel.prototype.sendChannelRanks = function(user) {
    if(user.rank >= 3 && this.registered) {
        this.server.db.listChannelRanks(this.name, function (err, res) {
            if(err) {
                user.socket.emit("errorMsg", {
                    msg: "Internal error: " + err
                });
                return;
            }
            user.socket.emit("channelRanks", res);
        });
    }
}

Channel.prototype.sendPlaylist = function(user) {
    user.socket.emit("playlist", this.playlist.items.toArray());
    if(this.playlist.current)
        user.socket.emit("setCurrent", this.playlist.current.uid);
    user.socket.emit("setPlaylistMeta", this.plmeta);
}

Channel.prototype.sendMediaUpdate = function(user) {
    if(this.playlist.current != null) {
        user.socket.emit("changeMedia", this.playlist.current.media.fullupdate());
    }
}

Channel.prototype.sendUserlist = function(user) {
    var users = [];
    for(var i = 0; i < this.users.length; i++) {
        // Skip people who haven't logged in
        if(this.users[i].name != "") {
            users.push({
                name: this.users[i].name,
                rank: this.users[i].rank,
                leader: this.users[i] == this.leader,
                meta: this.users[i].meta,
                profile: this.users[i].profile
            });
        }
    }
    user.socket.emit("userlist", users);
}

// Send the last 15 messages for context
Channel.prototype.sendRecentChat = function(user) {
    for(var i = 0; i < this.chatbuffer.length; i++) {
        user.socket.emit("chatMsg", this.chatbuffer[i]);
    }
}

/* REGION Broadcasts to all clients */

Channel.prototype.sendAll = function(message, data) {
    if(this.name == "")
        return;
    this.server.io.sockets.in(this.name).emit(message, data);
    if (this.server.cfg["enable-ssl"])
        this.server.ioSecure.sockets.in(this.name).emit(message, data);
}

Channel.prototype.sendAllWithRank = function(rank, msg, data) {
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].rank >= rank) {
            this.users[i].socket.emit(msg, data);
        }
    }
}

Channel.prototype.broadcastPlaylistMeta = function() {
    var total = 0;
    var iter = this.playlist.items.first;
    while(iter !== null) {
        if(iter.media !== null)
            total += iter.media.seconds;
        iter = iter.next;
    }
    var timestr = $util.formatTime(total);
    var packet = {
        count: this.playlist.items.length,
        time: timestr
    };
    this.plmeta = packet;
    this.sendAll("setPlaylistMeta", packet);
}

Channel.prototype.broadcastUsercount = function() {
    this.sendAll("usercount", this.users.length);
}

Channel.prototype.broadcastNewUser = function(user) {
    var self = this;
    // If the channel is empty and isn't registered, the first person
    // gets ownership of the channel (temporarily)
    if(self.dbloaded && self.users.length == 1 && !self.registered) {
        user.rank = (user.rank < 10) ? 10 : user.rank;
        user.socket.emit("channelNotRegistered");
        user.socket.emit("rank", user.rank);
    }
    self.server.db.listAliases(user.ip, function (err, aliases) {
        if(err) {
            aliases = [];
        }

        self.ip_alias[user.ip] = aliases;
        aliases.forEach(function (alias) {
            self.name_alias[alias] = aliases;
        });

        self.login_hist.unshift({
            name: user.name,
            aliases: self.ip_alias[user.ip],
            time: Date.now()
        });

        if(self.login_hist.length > 20)
            self.login_hist.pop();

        if(user.name.toLowerCase() in self.namebans &&
            self.namebans[user.name.toLowerCase()] !== null) {
            self.kick(user, "You're banned!");
            return;
        }
        if (self.mutedUsers.contains(user.name.toLowerCase())) {
            user.meta.icon = "icon-volume-off";
        }
        self.sendAll("addUser", {
            name: user.name,
            rank: user.rank,
            leader: self.leader == user,
            meta: user.meta,
            profile: user.profile
        });

        if(user.rank > 0) {
            self.saveInitialRank(user);
        }

        var msg = user.name + " joined (aliases: ";
        msg += self.ip_alias[user.ip].join(", ") + ")";
        var pkt = {
            username: "[server]",
            msg: msg,
            msgclass: "server-whisper",
            time: Date.now()
        };
        self.users.forEach(function(u) {
            if(u.rank >= 2) {
                u.socket.emit("joinMessage", pkt);
            }
        });
    });
}

Channel.prototype.broadcastUserUpdate = function(user) {
    this.sendAll("updateUser", {
        name: user.name,
        rank: user.rank,
        leader: this.leader == user,
        meta: user.meta,
        profile: user.profile
    });
}

Channel.prototype.broadcastPoll = function() {
    var self = this;
    var unhidden = this.poll.packUpdate(true);
    var hidden = this.poll.packUpdate(false);

    this.users.forEach(function (u) {
        if (self.hasPermission(u, "viewhiddenpoll"))
            u.socket.emit("newPoll", unhidden);
        else
            u.socket.emit("newPoll", hidden);
    });
}

Channel.prototype.broadcastPollUpdate = function() {
    var self = this;
    var unhidden = this.poll.packUpdate(true);
    var hidden = this.poll.packUpdate(false);

    this.users.forEach(function (u) {
        if (self.hasPermission(u, "viewhiddenpoll"))
            u.socket.emit("updatePoll", unhidden);
        else
            u.socket.emit("updatePoll", hidden);
    });
}

Channel.prototype.broadcastPollClose = function() {
    this.sendAll("closePoll");
}

Channel.prototype.broadcastOpts = function() {
    this.sendAll("channelOpts", this.opts);
}

Channel.prototype.broadcastBanlist = function() {
    var ents = [];
    var adminents = [];
    for(var ip in this.ipbans) {
        if(this.ipbans[ip] != null) {
            var name = this.ipbans[ip][0];
            var ip_hidden = this.hideIP(ip);
            ents.push({
                ip_displayed: $util.maskIP(ip),
                ip_hidden: ip_hidden,
                name: name,
                aliases: this.ip_alias[ip] || [],
                banner: this.ipbans[ip][1]
            });
            adminents.push({
                ip_displayed: ip,
                ip_hidden: ip_hidden,
                name: name,
                aliases: this.ip_alias[ip] || [],
                banner: this.ipbans[ip][1]
            });
        }
    }
    for(var name in this.namebans) {
        if(this.namebans[name] != null) {
            ents.push({
                ip_displayed: "*",
                ip_hidden: false,
                name: name,
                aliases: this.name_alias[name] || [],
                banner: this.namebans[name]
            });
            adminents.push({
                ip_displayed: "*",
                ip_hidden: false,
                name: name,
                aliases: this.name_alias[name] || [],
                banner: this.namebans[name]
            });
        }
    }
    for(var i = 0; i < this.users.length; i++) {
        if(this.hasPermission(this.users[i], "ban")) {
            if(this.users[i].rank >= 255) {
                this.users[i].socket.emit("banlist", adminents);
            }
            else {
                this.users[i].socket.emit("banlist", ents);
            }
        }
    }
}

Channel.prototype.broadcastChatFilters = function() {
    var filts = new Array(this.filters.length);
    for(var i = 0; i < this.filters.length; i++) {
        filts[i] = this.filters[i].pack();
    }
    for(var i = 0; i < this.users.length; i++) {
        if(this.hasPermission(this.users[i], "filteredit")) {
            this.users[i].socket.emit("chatFilters", filts);
        }
    }
}

Channel.prototype.calcVoteskipMax = function () {
    var self = this;
    // good ol' map-reduce
    return self.users.map(function (u) {
        if (!self.hasPermission(u, "voteskip"))
            return 0;
        return u.meta.afk ? 0 : 1;
    }).reduce(function (a, b) {
        return a + b;
    }, 0);
};

Channel.prototype.broadcastVoteskipUpdate = function() {
    var amt = this.voteskip ? this.voteskip.counts[0] : 0;
    var count = this.calcVoteskipMax();
    var need = this.voteskip ? Math.ceil(count * this.opts.voteskip_ratio) : 0;
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].rank >= 1.5) {
            this.users[i].socket.emit("voteskip", {
                count: amt,
                need: need
            });
        }
    }
}

Channel.prototype.broadcastMotd = function() {
    this.sendAll("setMotd", this.motd);
}

Channel.prototype.broadcastDrinks = function() {
    this.sendAll("drinkCount", this.drinks);
}

/* REGION Playlist Stuff */

Channel.prototype.onVideoChange = function () {
    this.voteskip = false;
    this.broadcastVoteskipUpdate();
    this.drinks = 0;
    this.broadcastDrinks();
}

function isLive(type) {
    return type == "li" // Livestream.com
        || type == "tw" // Twitch.tv
        || type == "jt" // Justin.tv
        || type == "rt" // RTMP
        || type == "jw" // JWPlayer
        || type == "us" // Ustream.tv
        || type == "im" // Imgur album
        || type == "cu";// Custom Embed
}

Channel.prototype.queueAdd = function(item, after) {
    var chan = this;
    function afterAdd() {
        chan.sendAll("queue", {
            item: item.pack(),
            after: after
        });
        chan.broadcastPlaylistMeta();
    }
    if(after === "prepend")
        this.playlist.prepend(item, afterAdd);
    else if(after === "append")
        this.playlist.append(item, afterAdd);
    else
        this.playlist.insertAfter(item, after, afterAdd);
}

Channel.prototype.autoTemp = function(item, user) {
    if(isLive(item.media.type)) {
        item.temp = true;
    }
    if(!this.hasPermission(user, "addnontemp")) {
        item.temp = true;
    }
}

Channel.prototype.tryQueue = function(user, data) {
    if(!this.hasPermission(user, "playlistadd")) {
        return;
    }
    if(typeof data.pos !== "string") {
        return;
    }
    if(typeof data.id !== "string" && data.id !== false) {
        return;
    }

    if (data.pos === "next" && !this.hasPermission(user, "playlistnext")) {
        return;
    }

    var limit = {
        burst: 3,
        sustained: 1
    };

    if (user.rank >= 2 || this.leader == user) {
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

    if (typeof data.title !== "string" || data.type !== "cu")
        data.title = false;

    data.queueby = user ? user.name : "";
    data.temp = !this.hasPermission(user, "addnontemp");

    if (data.list) {
        if (data.pos === "next") {
            data.list.reverse();
            if (this.playlist.items.length === 0)
                data.list.unshift(data.list.pop());
        }
        var i = 0;
        var self = this;
        var next = function () {
            if (self.dead)
                return;
            if (i < data.list.length) {
                data.list[i].pos = data.pos;
                self.tryQueue(user, data.list[i]);
                i++;
                setTimeout(next, 2000);
            }
        };
        next();
    } else {
        this.addMedia(data, user);
    }
}

Channel.prototype.addMedia = function(data, user) {
    var self = this;
    if(data.type === "yp" &&
       !self.hasPermission(user, "playlistaddlist")) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add " +
                 "playlists",
            link: $util.formatLink(data.id, data.type)
        });
        return;
    }
    if(data.type === "cu" &&
       !self.hasPermission(user, "playlistaddcustom")) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add " +
                 "custom embeds",
            link: null
        });
        return;
    }
    if(isLive(data.type) &&
       !self.hasPermission(user, "playlistaddlive")) {
        user.socket.emit("queueFail", {
            msg: "You don't have " +
                 "permission to add livestreams",
            link: $util.formatLink(data.id, data.type)
        });
        return;
    }
    data.temp = data.temp || isLive(data.type);
    data.queueby = user ? user.name : "";
    data.maxlength = self.hasPermission(user, "exceedmaxlength")
                   ? 0
                   : this.opts.maxlength;
    if (data.pos === "end")
        data.pos = "append";

    if (data.type === "cu" && data.title) {
        var t = data.title;
        if(t.length > 100)
            t = t.substring(0, 97) + "...";
        data.title = t;
    }

    var afterData = function (q, c, m) {
        if (data.maxlength && m.seconds > data.maxlength) {
            user.socket.emit("queueFail", {
                msg: "Media is too long!",
                link: $util.formatLink(m.id, m.type)
            });
            q.release();
            return;
        }

        m.pos = data.pos;
        m.queueby = data.queueby;
        m.temp = data.temp;
        var res = self.playlist.addMedia(m);
        if (res.error) {
            user.socket.emit("queueFail", {
                msg: res.error,
                link: $util.formatLink(m.id, m.type)
            });
            q.release();
            return;
        }

        var item = res.item;
        self.logger.log("### " + user.name + " queued " +
                        item.media.title);
        self.sendAll("queue", {
            item: item.pack(),
            after: item.prev ? item.prev.uid : "prepend"
        });
        self.broadcastPlaylistMeta();
        if (!c && !item.temp)
            self.cacheMedia(item.media);
        q.release();
    };

    // Pre-cached data (e.g. from a playlist)
    if (typeof data.title === "string" && data.type !== "cu") {
        self.plqueue.queue(function (q) {
            var m = new Media(data.id, data.title, data.seconds, data.type);
            afterData.bind(self, q, false)(m);
        });
        return;
    }

    // special case for youtube playlists
    if (data.type === "yp") {
        self.plqueue.queue(function (q) {
            if (self.dead)
                return;
            InfoGetter.getMedia(data.id, data.type,
                                function (e, vids) {
                if (e) {
                    user.socket.emit("queueFail", {
                        msg: e,
                        link: $util.formatLink(data.id, data.type)
                    });
                    q.release();
                    return;
                }

                if (data.pos === "next") {
                    vids.reverse();
                    if (self.playlist.length === 0)
                        vids.unshift(vids.pop());
                }

                var fake = { release: function () { } };
                var cb = afterData.bind(self, fake, false);
                for (var i = 0; i < vids.length; i++) {
                    cb(vids[i]);
                }
                q.release();
            });
        });
        return;
    }

    // Don't check library for livestreams or if the channel is
    // unregistered
    if (!self.registered || isLive(data.type)) {
        self.plqueue.queue(function (q) {
            if (self.dead)
                return;
            var cb = afterData.bind(self, q, false);
            InfoGetter.getMedia(data.id, data.type,
                                function (e, m) {
                if (self.dead)
                    return;
                if (e) {
                    user.socket.emit("queueFail", {
                        msg: e,
                        link: $util.formatLink(data.id, data.type)
                    });
                    q.release();
                    return;
                }

                cb(m);
            });
        });
    } else {
        self.plqueue.queue(function (q) {
            if (self.dead)
                return;
            self.server.db.getLibraryItem(self.name, data.id,
                                          function (err, item) {
                if (self.dead)
                    return;

                if (err) {
                    user.socket.emit("queueFail", {
                        msg: "Internal error: " + err,
                        link: $util.formatLink(data.id, data.type)
                    });
                    return;
                }

                if (item !== null) {
                    if (data.maxlength && item.seconds > data.maxlength) {
                        user.socket.emit("queueFail", {
                            msg: "Media is too long!",
                            link: $util.formatLink(item.id, item.type)
                        });
                        return;
                    }

                    afterData.bind(self, q, true)(item);
                } else {
                    InfoGetter.getMedia(data.id, data.type,
                                        function (e, m) {
                        if (self.dead)
                            return;
                        if (e) {
                            user.socket.emit("queueFail", {
                                msg: e,
                                link: $util.formatLink(data.id, data.type)
                            });
                            q.release();
                            return;
                        }

                        afterData.bind(self, q, false)(m);
                    });
                }
            });
        });
    }
};

Channel.prototype.tryQueuePlaylist = function(user, data) {
    var self = this;
    if (!self.hasPermission(user, "playlistaddlist")) {
        return;
    }

    if(typeof data.name !== "string" ||
       typeof data.pos !== "string") {
        return;
    }

    if (data.pos == "next" && !this.hasPermission(user, "playlistnext")) {
        return;
    }

    self.server.db.getUserPlaylist(user.name, data.name,
                                   function (err, pl) {
        if (self.dead)
            return;

        if (err) {
            user.socket.emit("errorMsg", {
                msg: "Playlist load failed: " + err
            });
            return;
        }

        try {
            if (data.pos === "next") {
                pl.reverse();
                if (pl.length > 0 && self.playlist.items.length === 0)
                    pl.unshift(pl.pop());
            }

            for (var i = 0; i < pl.length; i++) {
                pl[i].pos = data.pos;
                pl[i].temp = !self.hasPermission(user, "addnontemp");
                self.addMedia(pl[i], user);
            }
        } catch (e) {
            Logger.errlog.log("Loading user playlist failed!");
            Logger.errlog.log("PL: " + user.name + "-" + data.name);
            Logger.errlog.log(e.stack);
        }
    });
}

Channel.prototype.setTemp = function(uid, temp) {
    var item = this.playlist.items.find(uid);
    if(!item)
        return;
    item.temp = temp;
    this.sendAll("setTemp", {
        uid: uid,
        temp: temp
    });

    if(!temp) {
        this.cacheMedia(item.media);
    }
}

Channel.prototype.trySetTemp = function(user, data) {
    if(!this.hasPermission(user, "settemp")) {
        return;
    }
    if(typeof data.uid != "number" || typeof data.temp != "boolean") {
        return;
    }

    this.setTemp(data.uid, data.temp);
}


Channel.prototype.dequeue = function(uid) {
    var self = this;
    self.plqueue.queue(function (q) {
        if (self.dead)
            return;

        if (self.playlist.remove(uid)) {
            self.sendAll("delete", {
                uid: uid
            });
            self.broadcastPlaylistMeta();
        }

        q.release();
    });
}

Channel.prototype.tryDequeue = function(user, data) {
    if(!this.hasPermission(user, "playlistdelete"))
        return;

    if(typeof data !== "number") {
        return;
    }

    var plitem = this.playlist.items.find(data);
    if(plitem && plitem.media)
        this.logger.log("### " + user.name + " deleted " + plitem.media.title);
    this.dequeue(data);
}

Channel.prototype.tryUncache = function(user, data) {
    var self = this;
    if(user.rank < 2) {
        return;
    }
    if(typeof data.id != "string") {
        return;
    }
    if (!self.registered)
        return;
    self.server.db.removeFromLibrary(self.name, data.id,
                                     function (err, res) {
        if (self.dead)
            return;

        if(err)
            return;

        self.logger.log("*** " + user.name + " deleted " + data.id +
                        " from library");
    });
}

Channel.prototype.playNext = function() {
    this.playlist.next();
}

Channel.prototype.tryPlayNext = function(user) {
    if(!this.hasPermission(user, "playlistjump")) {
         return;
    }

    this.logger.log("### " + user.name + " skipped the video");

    this.playNext();
}

Channel.prototype.jumpTo = function(uid) {
    return this.playlist.jump(uid);
}

Channel.prototype.tryJumpTo = function(user, data) {
    if(!this.hasPermission(user, "playlistjump")) {
         return;
    }

    if(typeof data !== "number") {
        return;
    }

    this.logger.log("### " + user.name + " skipped the video");

    this.jumpTo(data);
}

Channel.prototype.clearqueue = function() {
    this.playlist.clear();
    this.plqueue.reset();
    this.sendAll("playlist", this.playlist.items.toArray());
    this.broadcastPlaylistMeta();
}

Channel.prototype.tryClearqueue = function(user) {
    if(!this.hasPermission(user, "playlistclear")) {
        return;
    }

    this.logger.log("### " + user.name + " cleared the playlist");
    this.clearqueue();
}

Channel.prototype.shufflequeue = function() {
    var n = [];
    var pl = this.playlist.items.toArray(false);
    this.playlist.clear();
    this.plqueue.reset();
    while(pl.length > 0) {
        var i = parseInt(Math.random() * pl.length);
        var item = this.playlist.makeItem(pl[i].media);
        item.temp = pl[i].temp;
        item.queueby = pl[i].queueby;
        this.playlist.items.append(item);
        pl.splice(i, 1);
    }
    this.playlist.current = this.playlist.items.first;
    this.sendAll("playlist", this.playlist.items.toArray());
    this.sendAll("setPlaylistMeta", this.plmeta);
    this.playlist.startPlayback();
}

Channel.prototype.tryShufflequeue = function(user) {
    if(!this.hasPermission(user, "playlistshuffle")) {
        return;
    }
    this.logger.log("### " + user.name + " shuffled the playlist");
    this.shufflequeue();
}

Channel.prototype.tryUpdate = function(user, data) {
    if(this.leader != user) {
        user.kick("Received mediaUpdate from non-leader");
        return;
    }

    if(typeof data.id !== "string" || typeof data.currentTime !== "number") {
        return;
    }

    if(this.playlist.current === null) {
        return;
    }

    if(isLive(this.playlist.current.media.type)
        && this.playlist.current.media.type != "jw") {
        return;
    }

    if(this.playlist.current.media.id != data.id) {
        return;
    }

    this.playlist.current.media.currentTime = data.currentTime;
    this.playlist.current.media.paused = data.paused;
    this.sendAll("mediaUpdate", this.playlist.current.media.timeupdate());
}

Channel.prototype.move = function(data, user) {
    var self = this;
    self.plqueue.queue(function (q) {
        if (self.dead)
            return;

        if (self.playlist.move(data.from, data.after)) {
            var fromit = self.playlist.items.find(data.from);
            var afterit = self.playlist.items.find(data.after);
            var aftertitle = (afterit && afterit.media)
                             ? afterit.media.title : "";
            if (fromit) {
                self.logger.log("### " + user.name + " moved " +
                                fromit.media.title +
                                (aftertitle ? " after " + aftertitle : ""));
            }

            self.sendAll("moveVideo", {
                from: data.from,
                after: data.after,
            });
        }

        q.release();
    });
}

Channel.prototype.tryMove = function(user, data) {
    if(!this.hasPermission(user, "playlistmove")) {
        return;
    }

    if(typeof data.from !== "number" || (typeof data.after !== "number" && typeof data.after !== "string")) {
        return;
    }

    this.move(data, user);
}

/* REGION Polls */

Channel.prototype.tryOpenPoll = function(user, data) {
    if(!this.hasPermission(user, "pollctl") && this.leader != user) {
        return;
    }

    if(typeof data.title !== "string" || !(data.opts instanceof Array)) {
        return;
    }

    var obscured = (data.obscured === true);
    var poll = new Poll(user.name, data.title, data.opts, obscured);
    this.poll = poll;
    this.broadcastPoll();
    this.logger.log("*** " + user.name + " Opened Poll: '" + poll.title + "'");
}

Channel.prototype.tryClosePoll = function(user) {
    if(!this.hasPermission(user, "pollctl")) {
        return;
    }

    if(this.poll) {
        if (this.poll.obscured) {
            this.poll.obscured = false;
            this.broadcastPollUpdate();
        }
        this.logger.log("*** " + user.name + " closed the active poll");
        this.poll = false;
        this.broadcastPollClose();
    }
}

Channel.prototype.tryVote = function(user, data) {

    if(!this.hasPermission(user, "pollvote")) {
        return;
    }
    if(typeof data.option !== "number") {
        return;
    }

    if(this.poll) {
        this.poll.vote(user.ip, data.option);
        this.broadcastPollUpdate();
    }
}

Channel.prototype.tryVoteskip = function(user) {
    if(!this.opts.allow_voteskip) {
        return;
    }

    if(!this.hasPermission(user, "voteskip"))
        return;
    // Voteskip = auto-unafk
    user.setAFK(false);
    user.autoAFK();
    if(!this.voteskip) {
        this.voteskip = new Poll("voteskip", "voteskip", ["yes"]);
    }
    this.voteskip.vote(user.ip, 0);
    this.logger.log("### " + user.name + " voteskipped");
    this.checkVoteskipPass();
}

Channel.prototype.checkVoteskipPass = function () {
    if(!this.opts.allow_voteskip)
        return false;

    if(!this.voteskip)
        return false;

    var count = this.calcVoteskipMax();
    var need = Math.ceil(count * this.opts.voteskip_ratio);
    if(this.voteskip.counts[0] >= need)
        this.playNext();

    this.broadcastVoteskipUpdate();
    return true;
}


/* REGION Channel Option stuff */

Channel.prototype.setLock = function(locked) {
    this.openqueue = !locked;
    this.sendAll("setPlaylistLocked", {locked: locked});
}

Channel.prototype.trySetLock = function(user, data) {
    if(user.rank < 2) {
        return;
    }

    if(data.locked == undefined) {
        return;
    }

    this.logger.log("*** " + user.name + " set playlist lock to " + data.locked);
    this.setLock(data.locked);
}

Channel.prototype.tryToggleLock = function(user) {
    if(user.rank < 2) {
        return;
    }

    this.logger.log("*** " + user.name + " set playlist lock to " + this.openqueue);
    this.setLock(this.openqueue);
}

Channel.prototype.tryRemoveFilter = function(user, f) {
    if(!this.hasPermission(user, "filteredit")) {
        user.kick("Attempted removeFilter with insufficient permission");
        return;
    }

    this.logger.log("%%% " + user.name + " removed filter: " + f.name);
    this.removeFilter(f);
}

Channel.prototype.removeFilter = function(filter) {
    for(var i = 0; i < this.filters.length; i++) {
        if(this.filters[i].name == filter.name) {
            this.filters.splice(i, 1);
            break;
        }
    }
    this.broadcastChatFilters();
}

Channel.prototype.updateFilter = function(filter, emit) {
    if(filter.name == "")
        filter.name = filter.source;
    var found = false;
    for(var i = 0; i < this.filters.length; i++) {
        if(this.filters[i].name == filter.name) {
            found = true;
            this.filters[i] = filter;
            break;
        }
    }
    if(!found) {
        this.filters.push(filter);
    }
    if(emit !== false)
        this.broadcastChatFilters();
}

Channel.prototype.tryUpdateFilter = function(user, f) {
    if(!this.hasPermission(user, "filteredit")) {
        user.kick("Attempted updateFilter with insufficient permission");
        return;
    }

    if (typeof f.source !== "string" || typeof f.flags !== "string" ||
        typeof f.replace !== "string") {
        return;
    }

    var re = f.source;
    var flags = f.flags;
    // Temporary fix
    // 2013-09-12 Temporary my ass
    f.replace = f.replace.replace(/style/g, "stlye");
    f.replace = sanitize(f.replace).xss();
    f.replace = f.replace.replace(/stlye/g, "style");
    try {
        new RegExp(re, flags);
    }
    catch(e) {
        return;
    }
    var filter = new Filter(f.name, f.source, f.flags, f.replace);
    filter.active = !!f.active;
    filter.filterlinks = !!f.filterlinks;
    this.logger.log("%%% " + user.name + " updated filter: " + f.name);
    this.updateFilter(filter);
}

Channel.prototype.moveFilter = function(data) {
    if(data.from < 0 || data.to < 0 || data.from >= this.filters.length ||
        data.to > this.filters.length) {
        return;
    }
    var f = this.filters[data.from];
    var to = data.to > data.from ? data.to + 1 : data.to;
    var from =  data.to > data.from ? data.from : data.from + 1;
    this.filters.splice(to, 0, f);
    this.filters.splice(from, 1);
    this.broadcastChatFilters();
}

Channel.prototype.tryMoveFilter = function(user, data) {
    if(!this.hasPermission(user, "filteredit")) {
        user.kick("Attempted moveFilter with insufficient permission");
        return;
    }

    if(typeof data.to !== "number" || typeof data.from !== "number") {
        return;
    }
    this.moveFilter(data);
}

Channel.prototype.tryUpdatePermissions = function(user, perms) {
    if(user.rank < 3) {
        user.kick("Attempted setPermissions with insufficient permission");
        return;
    }
    for(var key in perms) {
        this.permissions[key] = perms[key];
    }
    this.logger.log("%%% " + user.name + " updated permissions");
    this.sendAll("setPermissions", this.permissions);
}

Channel.prototype.tryUpdateOptions = function(user, data) {
    if(user.rank < 2) {
        user.kick("Attempted setOptions with insufficient permission");
        return;
    }

    const adminonly = {
        pagetitle: true,
        externalcss: true,
        externaljs: true,
        show_public: true
    };

    if ("afk_timeout" in data) {
        data.afk_timeout = parseInt(data.afk_timeout);
        if(data.afk_timeout < 0)
            data.afk_timeout = 0;
    }

    for(var key in this.opts) {
        if(key in data) {
            if(key in adminonly && user.rank < 3) {
                continue;
            }
            if(key === "afk_timeout" && this.opts[key] != data[key]) {
                this.users.forEach(function (u) {
                    u.autoAFK();
                });
            }
            this.opts[key] = data[key];
        }
    }

    this.logger.log("%%% " + user.name + " updated channel options");
    this.broadcastOpts();
}

Channel.prototype.trySetCSS = function(user, data) {
    if(user.rank < 3) {
        user.kick("Attempted setChannelCSS with insufficient permission");
        return;
    }

    if (typeof data.css !== "string") {
        return;
    }
    var css = data.css || "";
    if(css.length > 20000) {
        css = css.substring(0, 20000);
    }
    this.css = css;
    this.sendAll("channelCSSJS", {
        css: this.css,
        js: this.js
    });
    this.logger.log("%%% " + user.name + " set channel CSS");
}

Channel.prototype.trySetJS = function(user, data) {
    if(user.rank < 3) {
        user.kick("Attempted setChannelJS with insufficient permission");
        return;
    }
    if (typeof data.js !== "string") {
        return;
    }

    var js = data.js || "";
    if(js.length > 20000) {
        js = js.substring(0, 20000);
    }
    this.js = js;
    this.sendAll("channelCSSJS", {
        css: this.css,
        js: this.js
    });
    this.logger.log("%%% " + user.name + " set channel JS");
}

Channel.prototype.updateMotd = function(motd) {
    var html = motd.replace(/\n/g, "<br>");
    // Temporary fix
    html = html.replace(/style/g, "stlye");
    html = sanitize(html).xss();
    html = html.replace(/stlye/g, "style");
    //html = this.filterMessage(html);
    this.motd = {
        motd: motd,
        html: html
    };
    this.broadcastMotd();
}

Channel.prototype.tryUpdateMotd = function(user, data) {
    if(!this.hasPermission(user, "motdedit")) {
        user.kick("Attempted setMotd with insufficient permission");
        return;
    }

    if (typeof data.motd !== "string") {
        return;
    }

    data.motd = data.motd || "";
    this.updateMotd(data.motd);
    this.logger.log("%%% " + user.name + " set the MOTD");
}

/* REGION Chat */

Channel.prototype.tryChat = function(user, data) {
    if(user.name == "") {
        return;
    }

    if(!this.hasPermission(user, "chat"))
        return;

    if (this.mutedUsers.contains(user.name.toLowerCase())) {
        user.socket.emit("noflood", {
            action: "chat",
            msg: "You have been muted on this channel."
        });
        return;
    }

    if(typeof data.msg !== "string") {
        return;
    }

    var msg = data.msg;
    if(msg.length > 240) {
        msg = msg.substring(0, 240);
    }
    if(this.opts.chat_antiflood && user.noflood("chat", 2.0)) {
        return;
    }

    this.chainMessage(user, msg);
}

Channel.prototype.chainMessage = function(user, msg, data) {
    if(msg.indexOf("/") == 0)
        ChatCommand.handle(this, user, msg, data);

    else if(msg.indexOf(">") == 0)
        this.sendMessage(user.name, msg, "greentext", data);

    else
        this.sendMessage(user.name, msg, "", data);
}

Channel.prototype.filterMessage = function(msg) {
    const link = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;
    var subs = msg.split(link);
    // Apply other filters
    for(var j = 0; j < subs.length; j++) {
        if(this.opts.enable_link_regex && subs[j].match(link)) {
            var orig = subs[j];
            for(var i = 0; i < this.filters.length; i++) {
                if(!this.filters[i].filterlinks || !this.filters[i].active)
                    continue;
                subs[j] = this.filters[i].filter(subs[j]);
            }

            // only apply link filter if another filter hasn't changed
            // the link
            if (subs[j] === orig) {
                subs[j] = url.format(url.parse(subs[j]));
                subs[j] = subs[j].replace(link,
                    "<a href=\"$1\" target=\"_blank\">$1</a>");
            }
            continue;
        }
        for(var i = 0; i < this.filters.length; i++) {
            if(!this.filters[i].active)
                continue;
            subs[j] = this.filters[i].filter(subs[j]);
        }
    }
    return subs.join("");
}

Channel.prototype.sendMessage = function(username, msg, msgclass, data) {
    // I don't want HTML from strangers
    msg = sanitize(msg).escape();
    msg = this.filterMessage(msg);
    var msgobj = {
        username: username,
        msg: msg,
        msgclass: msgclass,
        time: Date.now()
    };
    if(data) {
        for(var key in data) {
            msgobj[key] = data[key];
        }
    }
    this.sendAll("chatMsg", msgobj);
    this.chatbuffer.push(msgobj);
    if(this.chatbuffer.length > 15)
        this.chatbuffer.shift();
    var unescaped = sanitize(msg).entityDecode();
    this.logger.log("<" + username + "." + msgclass + "> " + unescaped);
};

/* REGION Rank stuff */

Channel.prototype.trySetRank = function(user, data) {
    var self = this;
    if(user.rank < 2) {
        user.kick("Attempted setChannelRank with insufficient permission");
        return;
    }

    if(typeof data.user !== "string" || typeof data.rank !== "number") {
        return;
    }

    if(data.rank >= user.rank)
        return;

    if(data.rank < 1)
        return;

    var receiver;
    for(var i = 0; i < self.users.length; i++) {
        if(self.users[i].name == data.user) {
            receiver = self.users[i];
            break;
        }
    }

    if(receiver) {
        if(receiver.rank >= user.rank)
            return;
        receiver.rank = data.rank;
        if(receiver.loggedIn) {
            self.saveRank(receiver, function (err, res) {
                if (self.dead)
                    return;

                self.logger.log("*** " + user.name + " set " +
                                data.user + "'s rank to " + data.rank);
                self.sendAllWithRank(3, "setChannelRank", data);
            });
        }
        self.broadcastUserUpdate(receiver);
    } else if(self.registered) {
        self.getRank(data.user, function (err, rrank) {
            if (self.dead)
                return;

            if(err)
                return;
            if(rrank >= user.rank)
                return;
            self.server.db.setChannelRank(self.name, data.user,
                                          data.rank, function (err, res) {

                if (self.dead)
                    return;

                self.logger.log("*** " + user.name + " set " +
                                data.user + "'s rank to " + data.rank);
                self.sendAllWithRank(3, "setChannelRank", data);
            });
        });
    }
}

Channel.prototype.changeLeader = function(name) {
    if(this.leader != null) {
        var old = this.leader;
        this.leader = null;
        if(old.rank == 1.5) {
            old.rank = old.oldrank;
        }
        this.broadcastUserUpdate(old);
    }
    if(name == "") {
        this.logger.log("*** Resuming autolead");
        this.playlist.lead(true);
        return;
    }
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].name == name) {
            this.logger.log("*** Assigned leader: " + name);
            this.playlist.lead(false);
            this.leader = this.users[i];
            if(this.users[i].rank < 1.5) {
                this.users[i].oldrank = this.users[i].rank;
                this.users[i].rank = 1.5;
            }
            this.broadcastUserUpdate(this.leader);
        }
    }
}

Channel.prototype.tryChangeLeader = function(user, data) {
    if(user.rank < 2) {
        user.kick("Attempted assignLeader with insufficient permission");
        return;
    }

    if(typeof data.name !== "string") {
        return;
    }

    this.changeLeader(data.name);
    this.logger.log("### " + user.name + " assigned leader to " + data.name);
}

module.exports = Channel;
