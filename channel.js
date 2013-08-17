
/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");
var Poll = require("./poll.js").Poll;
var Media = require("./media.js").Media;
var formatTime = require("./media.js").formatTime;
var Logger = require("./logger.js");
var Rank = require("./rank.js");
var ChatCommand = require("./chatcommand.js");
var Filter = require("./filter.js").Filter;
var Playlist = require("./playlist");
var sanitize = require("validator").sanitize;

var Channel = function(name, Server) {
    var self = this;
    Logger.syslog.log("Opening channel " + name);
    self.initialized = false;
    self.server = Server;

    self.name = name;
    self.canonical_name = name.toLowerCase();
    // Initialize defaults
    self.registered = false;
    self.users = [];
    self.afkers = [];
    self.playlist = new Playlist(self);
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
    self.logger = new Logger.Logger("chanlogs/" + self.canonical_name + ".log");
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

    Server.db.loadChannelData(self, function () {
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
    fs.readFile("chandump/" + this.name, function(err, data) {
        if(err) {
            if(err.code == "ENOENT") {
                Logger.errlog.log("WARN: missing dump for " + this.name);
                this.initialized = true;
                this.saveDump();
            }
            else {
                Logger.errlog.log("Failed to open channel dump " + this.name);
                Logger.errlog.log(err);
            }
            return;
        }
        try {
            this.logger.log("*** Loading channel dump from disk");
            data = JSON.parse(data);
            /* Load the playlist */

            // Old
            if(data.queue) {
                if(data.position < 0)
                    data.position = 0;
                for(var i = 0; i < data.queue.length; i++) {
                    var e = data.queue[i];
                    var m = new Media(e.id, e.title, e.seconds, e.type);
                    var p = this.playlist.makeItem(m);
                    p.queueby = data.queue[i].queueby ? data.queue[i].queueby
                                                      : "";
                    p.temp = e.temp;
                    this.playlist.items.append(p);
                    if(i == data.position)
                        this.playlist.current = p;
                }
                this.sendAll("playlist", this.playlist.items.toArray());
                this.broadcastPlaylistMeta();
                this.playlist.startPlayback();
            }
            // Current
            else if(data.playlist) {
                var chan = this;
                this.playlist.load(data.playlist, function() {
                    chan.sendAll("playlist", chan.playlist.items.toArray());
                    chan.broadcastPlaylistMeta();
                    chan.playlist.startPlayback(data.playlist.time);
                });
            }
            for(var key in data.opts) {
                // Gotta love backwards compatibility
                if(key == "customcss" || key == "customjs") {
                    var k = key.substring(6);
                    this.opts[k] = data.opts[key];
                }
                else {
                    this.opts[key] = data.opts[key];
                }
            }
            for(var key in data.permissions) {
                this.permissions[key] = data.permissions[key];
            }
            this.sendAll("setPermissions", this.permissions);
            this.broadcastOpts();
            this.users.forEach(function (u) {
                u.autoAFK();
            });
            if(data.filters) {
                for(var i = 0; i < data.filters.length; i++) {
                    var f = data.filters[i];
                    // Backwards compatibility
                    if(f[0] != undefined) {
                        var filt = new Filter("", f[0], "g", f[1]);
                        filt.active = f[2];
                        this.updateFilter(filt, false);
                    }
                    else {
                        var filt = new Filter(f.name, f.source, f.flags, f.replace);
                        filt.active = f.active;
                        filt.filterlinks = f.filterlinks;
                        this.updateFilter(filt, false);
                    }
                }
                this.broadcastChatFilters();
            }
            if(data.motd) {
                this.motd = data.motd;
                this.broadcastMotd();
            }
            this.setLock(!(data.openqueue || false));
            this.chatbuffer = data.chatbuffer || [];
            for(var i = 0; i < this.chatbuffer.length; i++) {
                this.sendAll("chatMsg", this.chatbuffer[i]);
            }
            this.css = data.css || "";
            this.js = data.js || "";
            this.sendAll("channelCSSJS", {css: this.css, js: this.js});
            this.initialized = true;
            setTimeout(function() { incrementalDump(this); }.bind(this), 300000);
        }
        catch(e) {
            Logger.errlog.log("Channel dump load failed: ");
            Logger.errlog.log(e.stack);
        }
    }.bind(this));
}

Channel.prototype.saveDump = function() {
    if(!this.initialized)
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
    fs.writeFileSync("chandump/" + this.name, text);
}

// Save channel dumps every 5 minutes, in case of crash
function incrementalDump(chan) {
    if(chan && chan.users && chan.users.length > 0) {
        chan.saveDump();
        setTimeout(function() { incrementalDump(chan); }, 300000);
    }
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
                    /(\d{1,3}\.){2}(\d{1,3})\.(\d{1,3})/g,
                    "x.x.$2.$3"
                );
            }

            callback(false, buffer);
        });
    });
}

Channel.prototype.tryReadLog = function (user) {
    if(user.rank < 3)
        return;

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
        self.server.actionlog.record(user.ip, user.name, "channel-register-failure",
                         [self.name, "Channel already registered"]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "This channel is already registered"
        });
    }
    else if(!user.loggedIn) {
        self.server.actionlog.record(user.ip, user.name, "channel-register-failure",
                         [self.name, "Not logged in"]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "You must log in to register a channel"
        });

    }
    else if(!Rank.hasPermission(user, "registerChannel")) {
        self.server.actionlog.record(user.ip, user.name, "channel-register-failure",
                         [self.name, "Insufficient permissions"]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "You don't have permission to register self channel"
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

            self.server.actionlog.record(user.ip, user.name, 
                             "channel-register-success", self.name);
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
        
        self.registered = false;
        user.socket.emit("unregisterChannel", { success: true });
    });
}

Channel.prototype.getRank = function (name, callback) {
    var self = this;
    self.server.db.getGlobalRank(name, function (err, global) {
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

Channel.prototype.saveRank = function (user) {
    this.server.db.setChannelRank(this.name, user.name, user.rank);
}

Channel.prototype.getIPRank = function (ip, callback) {
    var self = this;
    var names = [];
    var next = function (names) {
        self.server.db.getChannelRank(self.name, names,
                                      function (err, res) {
            if(err) {
                callback(err, null);
                return;
            }

            var rank = 0;
            for(var i in res) {
                rank = (res[i].rank > rank) ? res[i].rank : rank;
            }
            callback(null, rank);
        });
    };

    if(ip in self.ip_alias) {
        names = self.ip_alias[ip];
        next(names);
    } else if(ip.match(/^(\d+)\.(\d+)\.(\d+)$/)) {
        // Range
        for(var ip2 in self.ip_alias) {
            if(ip2.indexOf(ip) == 0) {
                for(var i in self.ip_aliases[ip2])
                    names.push(self.ip_aliases[ip2][i]);
            }
        }
        next(names);
    } else {
        self.server.db.listAliases(ip, function (err, names) {
            self.ip_alias[ip] = names;
            next(names);
        });
    }
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

    self.getRank(name, function (err, rank) {
        if(err) {
            actor.socket.emit("errorMsg", {
                msg: "Internal error"
            });
            return;
        }

        if(rank >= actor.rank) {
            actor.socket.emit("errorMsg", {
                msg: "You don't have permission to ban this person."
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
        self.users.forEach(function(u) {
            self.sendBanlist(u);
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
        return false;
    }

    self.namebans[name] = null;
    delete self.namebans[name];
    self.logger.log("*** " + actor.name + " un-namebanned " + name);

    self.server.db.clearChannelNameBan(self.name, name, function (err, res) {

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
    self.server.db.listIPsForName(name, function (err, ips) {
        if(err) {
            actor.socket.emit("errorMsg", {
                msg: "Internal error"
            });
            return;
        }
        ips.forEach(function (ip) {
            if(range)
                ip = ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, "$1.$2.$3");
            self.getIPRank(ip, function (err, rank) {
                if(err) {
                    actor.socket.emit("errorMsg", {
                        msg: "Internal error"
                    });
                    return;
                }

                if(rank >= actor.rank) {
                    actor.socket.emit("errorMsg", {
                        msg: "You don't have permission to ban IP: x.x." + 
                             ip.replace(/\d+\.\d+\.(\d+\.\d+)/, "$1")
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

                self.server.db.addChannelBan(chan.name, ip, name,
                                             actor.name,
                                             function (err, res) {
                    self.users.forEach(function(u) {
                        self.sendBanlist(u);
                    });
                });
            });
        });
    });
}

Channel.prototype.unbanIP = function(actor, ip) {
    var self = this;
    if(!self.hasPermission(actor, "ban"))
        return false;

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
    if(data.ip_hidden) {
        var ip = this.hideIP(data.ip_hidden);
        this.unbanIP(actor, ip);
    }
    if(data.name) {
        this.unbanName(actor, data.name);
    }
}

Channel.prototype.search = function(query, callback) {
    var self = this;
    self.server.db.searchLibrary(self.name, query, function (err, res) {
        if(err) {
            res = [];
        }

        results.sort(function(a, b) {
            var x = a.title.toLowerCase();
            var y = b.title.toLowerCase();

            return (x == y) ? 0 : (x < y ? -1 : 1);
        });
        callback(results);
    });
}

/* REGION User interaction */

Channel.prototype.userJoin = function(user) {
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
                this.kick(this.users[i], "Duplicate login");
            }
        }
    }

    // If the channel is empty and isn't registered, the first person
    // gets ownership of the channel (temporarily)
    if(this.users.length == 0 && !this.registered) {
        user.rank = (user.rank < Rank.Owner) ? 10 : user.rank;
        user.socket.emit("channelNotRegistered");
    }
    this.users.push(user);
    this.broadcastVoteskipUpdate();
    if(user.name != "") {
        this.broadcastNewUser(user);
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

    // Send things that require special permission
    this.sendRankStuff(user);

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
    idx = this.afkers.indexOf(user.name.toLowerCase());
    if(idx >= 0 && idx < this.afkers.length)
        this.afkers.splice(idx, 1);
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
    if(user.socket.disconnected) {
        this.userLeave(user);
    }
    user.socket.disconnect(true);
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
                if(user.rank < Rank.Siteadmin) {
                    disp = "x.x." + ip.replace(/\d+\.\d+\.(\d+\.\d+)/, "$1");
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

Channel.prototype.sendRankStuff = function(user) {
    this.sendBanlist(user);
    this.sendChatFilters(user);
    this.sendChannelRanks(user);
}

Channel.prototype.sendChannelRanks = function(user) {
    if(Rank.hasPermission(user, "acl")) {
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
}

Channel.prototype.sendAllWithPermission = function(perm, msg, data) {
    for(var i = 0; i < this.users.length; i++) {
        if(Rank.hasPermission(this.users[i], perm)) {
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
    var timestr = formatTime(total);
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
    self.server.db.listAliases(user.ip, function (err, aliases) {
        if(err) {
            aliases = [];
        }

        self.ip_alias[user.ip] = aliases;
        aliases.forEach(function (alias) {
            chan.name_alias[alias] = aliases;
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
        self.sendAll("addUser", {
            name: user.name,
            rank: user.rank,
            leader: self.leader == user,
            meta: user.meta,
            profile: user.profile
        });

        if(user.rank > Rank.Guest) {
            self.saveRank(user);
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
    this.sendRankStuff(user);
}

Channel.prototype.broadcastPoll = function() {
    this.sendAll("newPoll", this.poll.packUpdate());
}

Channel.prototype.broadcastPollUpdate = function() {
    this.sendAll("updatePoll", this.poll.packUpdate());
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
                ip_displayed: "x.x." + ip.replace(/\d+\.\d+\.(\d+\.\d+)/, "$1"),
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
            if(this.users[i].rank >= Rank.Siteadmin) {
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

Channel.prototype.broadcastVoteskipUpdate = function() {
    var amt = this.voteskip ? this.voteskip.counts[0] : 0;
    var count = this.users.length - this.afkers.length;
    var need = this.voteskip ? Math.ceil(count * this.opts.voteskip_ratio) : 0;
    for(var i = 0; i < this.users.length; i++) {
        if(Rank.hasPermission(this.users[i], "seeVoteskip") ||
                this.leader == this.users[i]) {
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

// The server autolead function
function mediaUpdate(chan, id) {
    // Bail cases - video changed, someone's leader, no video playing
    if(chan.media == null ||
           id != chan.media.id ||
           chan.leader != null ||
           chan.users.length == 0) {
        return;
    }

    chan.media.currentTime += (new Date().getTime() - chan.time) / 1000.0;
    chan.time = new Date().getTime();

    // Show's over, move on to the next thing
    if(chan.media.currentTime > chan.media.seconds + 1) {
        chan.playNext();
    }
    // Send updates about every 5 seconds
    else if(chan.i % 5 == 0) {
        chan.sendAll("mediaUpdate", chan.media.timeupdate());
    }
    chan.i++;

    setTimeout(function() { mediaUpdate(chan, id); }, 1000);
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

    if(data.pos == "next" && !this.hasPermission(user, "playlistnext")) {
        return;
    }

    if(user.rank < Rank.Moderator
            && this.leader != user
            && user.noflood("queue", 1.5)) {
        return;
    }

    data.queueby = user ? user.name : "";
    data.temp = !this.hasPermission(user, "addnontemp");

    if(data.list)
        this.addMediaList(data, user);
    else
        this.addMedia(data, user);
}

Channel.prototype.addMedia = function(data, user) {
    var self = this;
    if(data.type === "yp" && 
       !self.hasPermission(user, "playlistaddlist")) {
        user.socket.emit("queueFail", "You don't have permission to add " +
                         "playlists");
        return;
    }
    if(data.type === "cu" &&
       !self.hasPermission(user, "playlistaddcustom")) {
        user.socket.emit("queueFail", "You don't have permission to add " +
                         "custom embeds");
        return;
    }
    data.temp = data.temp || isLive(data.type);
    data.queueby = user ? user.name : "";
    data.maxlength = self.hasPermission(user, "exceedmaxlength")
                   ? 0
                   : this.opts.maxlength;
    self.server.db.getLibraryItem(self.name, data.id,
                                  function (err, item) {
        if(err) {
            user.socket.emit("queueFail", "Internal error: " + err);
            return;
        }

        if(item !== null) {
            var m = new Media(item.id, item.title, item.seconds, item.type);
            if(data.maxlength && m.seconds > data.maxlength) {
                user.socket.emit("queueFail", "Media is too long!");
                return;
            }

            data.media = m;
            self.playlist.addCachedMedia(data, function (err, item) {
                if(err) {
                    if(err === true)
                        err = false;
                    if(user)
                        user.socket.emit("queueFail", err);
                    return;
                }
                else {
                    chan.logger.log("### " + user.name + " queued " + item.media.title);
                    chan.sendAll("queue", {
                        item: item.pack(),
                        after: item.prev ? item.prev.uid : "prepend"
                    });
                    chan.broadcastPlaylistMeta();
                }
            });
            return;
        } else {
            if(isLive(data.type) &&
               !self.hasPermission(user, "playlistaddlive")) {
                user.socket.emit("queueFail", "You don't have " +
                                 "permission to add livestreams");
                return;
            }
            self.playlist.addMedia(data, function(err, item) {
                if(err) {
                    if(err === true)
                        err = false;
                    if(user)
                        user.socket.emit("queueFail", err);
                    return;
                }
                else {
                    chan.logger.log("### " + user.name + " queued " + item.media.title);
                    chan.sendAll("queue", {
                        item: item.pack(),
                        after: item.prev ? item.prev.uid : "prepend"
                    });
                    chan.broadcastPlaylistMeta();
                    if(!item.temp)
                        chan.cacheMedia(item.media);
                }
            });
        }

    });

}

Channel.prototype.addMediaList = function(data, user) {
    var chan = this;
    this.playlist.addMediaList(data, function(err, item) {
        if(err) {
            if(err === true)
                err = false;
            if(user)
                user.socket.emit("queueFail", err);
            return;
        }
        else {
            chan.logger.log("### " + user.name + " queued " + item.media.title);
            item.temp = data.temp;
            item.queueby = data.queueby;
            chan.sendAll("queue", {
                item: item.pack(),
                after: item.prev ? item.prev.uid : "prepend"
            });
            chan.broadcastPlaylistMeta();
            if(!item.temp)
                chan.cacheMedia(item.media);
        }
    });
}

Channel.prototype.tryQueuePlaylist = function(user, data) {
    var self = this;
    if(!this.hasPermission(user, "playlistaddlist")) {
        return;
    }

    if(typeof data.name != "string" ||
       typeof data.pos != "string") {
        return;
    }

    if(data.pos == "next" && !this.hasPermission(user, "playlistnext")) {
        return;
    }

    self.server.db.getUserPlaylist(user.name, data.name,
                                   function (err, pl) {
        if(err) {
            user.socket.emit("errorMsg", {
                msg: "Playlist load failed: " + err
            });
            return;
        }
        data.list = pl;
        data.queueby = user.name;
        data.temp = !self.hasPermission(user, "addnontemp");
        self.addMediaList(data, user);
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
    var chan = this;
    function afterDelete() {
        chan.sendAll("delete", {
            uid: uid
        });
        chan.broadcastPlaylistMeta();
    }
    if(!this.playlist.remove(uid, afterDelete))
        return;
}

Channel.prototype.tryDequeue = function(user, data) {
    if(!this.hasPermission(user, "playlistdelete"))
        return;

    if(typeof data !== "number")
        return;
    
    var plitem = this.playlist.items.find(data);
    if(plitem && plitem.media)
        this.logger.log("### " + user.name + " deleted " + plitem.media.title);
    this.dequeue(data);
}

Channel.prototype.tryUncache = function(user, data) {
    if(!Rank.hasPermission(user, "uncache")) {
        return;
    }
    if(typeof data.id != "string") {
        return;
    }
    self.server.db.removeFromLibrary(self.name, data.id,
                                     function (err, res) {
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
        return;
    }

    if(typeof data.id !== "string" || typeof data.currentTime !== "number")
           return;

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
    var chan = this;
    function afterMove() {
        var moveby = user && user.name ? user.name : null;
        if(typeof data.moveby !== "undefined")
            moveby = data.moveby;

        
        var fromit = chan.playlist.items.find(data.from);
        var afterit = chan.playlist.items.find(data.after);
        var aftertitle = afterit && afterit.media ? afterit.media.title : "";
        if(fromit) {
            chan.logger.log("### " + user.name + " moved " + fromit.media.title 
                          + (aftertitle ? " after " + aftertitle : ""));
        }

        chan.sendAll("moveVideo", {
            from: data.from,
            after: data.after,
            moveby: moveby
        });
    }

    this.playlist.move(data.from, data.after, afterMove);
}

Channel.prototype.tryMove = function(user, data) {
    if(!this.hasPermission(user, "playlistmove")) {
        return;
    }

    if(typeof data.from !== "number" || (typeof data.after !== "number" && typeof data.after !== "string"))
        return;

    this.move(data, user);
}

/* REGION Polls */

Channel.prototype.tryOpenPoll = function(user, data) {
    if(!this.hasPermission(user, "pollctl") && this.leader != user) {
        return;
    }

    if(!data.title || !data.opts) {
        return;
    }

    var poll = new Poll(user.name, data.title, data.opts);
    this.poll = poll;
    this.broadcastPoll();
    this.logger.log("*** " + user.name + " Opened Poll: '" + poll.title + "'");
}

Channel.prototype.tryClosePoll = function(user) {
    if(!this.hasPermission(user, "pollctl")) {
        return;
    }

    if(this.poll) {
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

    var count = this.users.length - this.afkers.length;
    var need = Math.ceil(count * this.opts.voteskip_ratio);
    if(this.server.cfg["debug"]) {
        console.log("afkers=", this.afkers.length);
        console.log("users =", this.users.length);
        console.log("DBG", this.voteskip.counts[0], "/", need);
    }
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
    if(!Rank.hasPermission(user, "qlock")) {
        return;
    }

    if(data.locked == undefined) {
        return;
    }

    this.logger.log("*** " + user.name + " set playlist lock to " + data.locked);
    this.setLock(data.locked);
}

Channel.prototype.tryToggleLock = function(user) {
    if(!Rank.hasPermission(user, "qlock")) {
        return;
    }

    this.logger.log("*** " + user.name + " set playlist lock to " + this.openqueue);
    this.setLock(this.openqueue);
}

Channel.prototype.tryRemoveFilter = function(user, f) {
    if(!this.hasPermission(user, "filteredit"))
        return false;

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
        return;
    }

    var re = f.source;
    var flags = f.flags;
    // Temporary fix
    f.replace = f.replace.replace("style", "stlye");
    f.replace = sanitize(f.replace).xss();
    f.replace = f.replace.replace("stlye", "style");
    try {
        new RegExp(re, flags);
    }
    catch(e) {
        return;
    }
    var filter = new Filter(f.name, f.source, f.flags, f.replace);
    filter.active = f.active;
    filter.filterlinks = f.filterlinks;
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
    if(!this.hasPermission(user, "filteredit"))
        return;

    if(typeof data.to !== "number" || typeof data.from !== "number")
        return;
    this.moveFilter(data);
}

Channel.prototype.tryUpdatePermissions = function(user, perms) {
    if(!Rank.hasPermission(user, "channelperms")) {
        return;
    }
    for(var key in perms) {
        this.permissions[key] = perms[key];
    }
    this.logger.log("%%% " + user.name + " updated permissions");
    this.sendAll("setPermissions", this.permissions);
}

Channel.prototype.tryUpdateOptions = function(user, data) {
    if(!Rank.hasPermission(user, "channelOpts")) {
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
            if(key in adminonly && user.rank < Rank.Owner) {
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
    if(!Rank.hasPermission(user, "setcss")) {
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
    if(!Rank.hasPermission(user, "setjs")) {
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
    html = html.replace("style", "stlye");
    html = sanitize(html).xss();
    html = html.replace("stlye", "style");
    //html = this.filterMessage(html);
    this.motd = {
        motd: motd,
        html: html
    };
    this.broadcastMotd();
}

Channel.prototype.tryUpdateMotd = function(user, data) {
    if(!this.hasPermission(user, "motdedit")) {
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

    if(user.muted) {
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
    const link = /((?:(?:https?)|(?:ftp))(?::\/\/[0-9a-zA-Z\.]+(?::[0-9]+)?[^\s'"$]+))/g;
    var subs = msg.split(link);
    // Apply other filters
    for(var j = 0; j < subs.length; j++) {
        if(this.opts.enable_link_regex && subs[j].match(link)) {
            subs[j] = subs[j].replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");
            for(var i = 0; i < this.filters.length; i++) {
                if(!this.filters[i].filterlinks || !this.filters[i].active)
                    continue;
                subs[j] = this.filters[i].filter(subs[j]);
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
    if(!Rank.hasPermission(user, "promote"))
        return;

    if(typeof data.user !== "string" || typeof data.rank !== "number")
        return;

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
            self.saveRank(receiver);
        }
        self.broadcastUserUpdate(receiver);
    }
    else {
        self.getRank(data.user, function (err, rrank) {
            if(err)
                return;
            if(rrank >= user.rank)
                return;
            self.server.db.setChannelRank(this.name, data.user,
                                          data.rank, function (err, res) {
            
                self.logger.log("*** " + user.name + " set " + 
                                data.user + "'s rank to " + data.rank);
                self.sendAllWithPermission("acl", "setChannelRank", data);
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
        /*
        if(this.playlist.current != null && !isLive(this.playlist.current.media.type)) {
            this.playlist.current.media.paused = false;
            this.time = new Date().getTime();
            this.i = 0;
            mediaUpdate(this, this.playlist.current.media.id);
        }
        */
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
    if(!Rank.hasPermission(user, "assignLeader")) {
        return;
    }

    if(data.name == undefined) {
        return;
    }

    this.changeLeader(data.name);
    this.logger.log("### " + user.name + " assigned leader to " + data.name);
}

module.exports = Channel;
