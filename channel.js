
/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var fs = require("fs");
var Database = require("./database.js");
var Poll = require("./poll.js").Poll;
var Media = require("./media.js").Media;
var formatTime = require("./media.js").formatTime;
var Logger = require("./logger.js");
var InfoGetter = require("./get-info.js");
var Server = require("./server.js");
var io = Server.io;
var NWS = require("./notwebsocket");
var Rank = require("./rank.js");
var Auth = require("./auth.js");
var ChatCommand = require("./chatcommand.js");
var Filter = require("./filter.js").Filter;
var ActionLog = require("./actionlog");

var Channel = function(name) {
    Logger.syslog.log("Opening channel " + name);
    this.initialized = false;

    this.name = name;
    // Initialize defaults
    this.registered = false;
    this.users = [];
    this.queue = [];
    this.library = {};
    this.position = -1;
    this.media = null;
    this.drinks = 0;
    this.leader = null;
    this.chatbuffer = [];
    this.openqueue = false;
    this.poll = false;
    this.voteskip = false;
    this.permissions = {
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
        playlistaddlive: 1.5,
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
    this.opts = {
        allow_voteskip: true,
        voteskip_ratio: 0.5,
        pagetitle: this.name,
        externalcss: "",
        externaljs: "",
        chat_antiflood: false,
        show_public: false,
        enable_link_regex: true
    };
    this.filters = [
        new Filter("monospace", "`([^`]+)`", "g", "<code>$1</code>"),
        new Filter("bold", "(.)\\*([^\\*]+)\\*", "g", "$1<strong>$2</strong>"),
        new Filter("italic", "(^| )_([^_]+)_", "g", "$1<em>$2</em>"),
        new Filter("strikethrough", "~~([^~]+)~~", "g", "<s>$1</s>"),
        new Filter("inline spoiler", "\\[spoiler\\](.*)\\[\\/spoiler\\]", "ig", "<span class=\"spoiler\">$1</span>"),
    ];
    this.motd = {
        motd: "",
        html: ""
    };
    this.ipbans = {};
    this.namebans = {};
    this.ip_alias = {};
    this.name_alias = {};
    this.login_hist = [];
    this.logger = new Logger.Logger("chanlogs/" + this.name + ".log");
    this.i = 0;
    this.time = new Date().getTime();
    this.plmeta = {
        count: 0,
        time: "00:00"
    };

    this.css = "";
    this.js = "";

    this.ipkey = "";
    for(var i = 0; i < 15; i++) {
        this.ipkey += "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[parseInt(Math.random() * 65)]
    }

    Database.loadChannel(this);
    if(this.registered) {
        this.loadDump();
    }
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
            for(var i = 0; i < data.queue.length; i++) {
                var e = data.queue[i];
                var m = new Media(e.id, e.title, e.seconds, e.type);
                m.queueby = data.queue[i].queueby ? data.queue[i].queueby
                                                  : "";
                if(e.temp !== undefined) {
                    m.temp = e.temp;
                }
                this.queue.push(m);
            }
            this.sendAll("playlist", this.queue);
            this.broadcastPlaylistMeta();
            // Backwards compatibility
            if(data.currentPosition != undefined) {
                this.position = data.currentPosition - 1;
            }
            else {
                this.position = data.position - 1;
            }
            if(this.position < -1)
                this.position = -1;
            if(this.queue.length > 0)
                this.playNext();
            if(this.media && data.currentTime) {
                this.media.currentTime = data.currentTime;
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
            if(data.filters) {
                for(var i = 0; i < data.filters.length; i++) {
                    var f = data.filters[i];
                    // Backwards compatibility
                    if(f[0] != undefined) {
                        var filt = new Filter("", f[0], "g", f[1]);
                        filt.active = f[2];
                        this.updateFilter(filt);
                    }
                    else {
                        var filt = new Filter(f.name, f.source, f.flags, f.replace);
                        filt.active = f.active;
                        filt.filterlinks = f.filterlinks;
                        this.updateFilter(filt);
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
            Logger.errlog.log(e);
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
        queue: this.queue,
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
    this.logger.flush();
}

// Save channel dumps every 5 minutes, in case of crash
function incrementalDump(chan) {
    if(chan && chan.users && chan.users.length > 0) {
        chan.saveDump();
        setTimeout(function() { incrementalDump(chan); }, 300000);
    }
}

Channel.prototype.tryRegister = function(user) {
    if(this.registered) {
        ActionLog.record(user.ip, user.name, "channel-register-failure", [this.name]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "This channel is already registered"
        });
    }
    else if(!user.loggedIn) {
        ActionLog.record(user.ip, user.name, "channel-register-failure", [this.name]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "You must log in to register a channel"
        });

    }
    else if(!Rank.hasPermission(user, "registerChannel")) {
        ActionLog.record(user.ip, user.name, "channel-register-failure", [this.name]);
        user.socket.emit("registerChannel", {
            success: false,
            error: "You don't have permission to register this channel"
        });
    }
    else {
        if(Database.registerChannel(this.name, user.name)) {
            ActionLog.record(user.ip, user.name, "channel-register-success", [this.name]);
            this.registered = true;
            this.initialized = true;
            this.saveDump();
            this.saveRank(user);
            user.socket.emit("registerChannel", {
                success: true,
            });
            this.logger.log("*** " + user.name + " registered the channel");
            Logger.syslog.log("Channel " + this.name + " was registered by " + user.name);
        }
        else {
            user.socket.emit("registerChannel", {
                success: false,
                error: "Unable to register channel, see an admin"
            });
        }
    }
}

Channel.prototype.unregister = function() {
    if(Database.deleteChannel(this.name)) {
        this.registered = false;
        return true;
    }
    return false;
}

Channel.prototype.getRank = function(name) {
    var global = Auth.getGlobalRank(name);
    if(!this.registered) {
        return global;
    }
    var local = Database.getChannelRank(this.name, name);
    return local > global ? local : global;
}

Channel.prototype.saveRank = function(user) {
    return Database.setChannelRank(this.name, user.name, user.rank);
}

Channel.prototype.getIPRank = function(ip) {
    var names = [];
    if(!(ip in this.ip_alias))
        this.ip_alias = Database.getAliases(ip);
    this.ip_alias[ip].forEach(function(name) {
        names.push(name);
    });

    var ranks = Database.getChannelRank(this.name, names);
    var rank = 0;
    for(var i = 0; i < ranks.length; i++) {
        rank = (ranks[i] > rank) ? ranks[i] : rank;
    }
    return rank;
}

Channel.prototype.cacheMedia = function(media) {
    // Prevent the copy in the playlist from messing with this one
    media = media.dup();
    if(media.temp) {
        return;
    }
    this.library[media.id] = media;
    if(this.registered) {
        return Database.addToLibrary(this.name, media);
    }
    return false;
}

Channel.prototype.tryNameBan = function(actor, name) {
    if(!this.hasPermission(actor, "ban")) {
        return false;
    }

    name = name.toLowerCase();

    var rank = this.getRank(name);
    if(rank >= actor.rank) {
        actor.socket.emit("errorMsg", {msg: "You don't have permission to ban this person."});
        return false;
    }

    this.namebans[name] = actor.name;
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].name.toLowerCase() == name) {
            this.kick(this.users[i], "You're banned!");
            break;
        }
    }
    this.logger.log(name + " was banned by " + actor.name);
    var chan = this;
    this.users.forEach(function(u) {
        chan.sendBanlist(u);
    });
    if(!this.registered) {
        return false;
    }

    return Database.channelBan(this.name, "*", name, actor.name);
}

Channel.prototype.unbanName = function(actor, name) {
    if(!this.hasPermission(actor, "ban")) {
        return false;
    }

    this.namebans[name] = null;
    delete this.namebans[name];
    this.logger.log(name + " was unbanned by " + actor.name);

    var chan = this;
    this.users.forEach(function(u) {
        chan.sendBanlist(u);
    });
    return Database.channelUnbanName(this.name, name);
}

Channel.prototype.tryIPBan = function(actor, name, range) {
    if(!this.hasPermission(actor, "ban")) {
        return false;
    }
    if(typeof name != "string") {
        return false;
    }
    var ips = Database.ipForName(name);
    var chan = this;
    ips.forEach(function(ip) {
        if(chan.getIPRank(ip) >= actor.rank) {
            actor.socket.emit("errorMsg", {msg: "You don't have permission to ban IP: x.x." + ip.replace(/\d+\.\d+\.(\d+\.\d+)/, "$1")});
            return false;
        }

        if(range) {
            ip = ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, "$1.$2.$3");
            for(var ip2 in chan.ip_alias) {
                if(ip2.indexOf(ip) == 0 && chan.getIPRank(ip2) >= actor.rank) {
                    actor.socket.emit("errorMsg", {msg: "You don't have permission to ban IP: x.x." + ip2.replace(/\d+\.\d+\.(\d+\.\d+)/, "$1")});
                    return false;
                }
            }
        }
        chan.ipbans[ip] = [name, actor.name];
        //chan.broadcastBanlist();
        chan.logger.log(ip + " (" + name + ") was banned by " + actor.name);

        for(var i = 0; i < chan.users.length; i++) {
            if(chan.users[i].ip.indexOf(ip) == 0) {
                chan.kick(chan.users[i], "Your IP is banned!");
                i--;
            }
        }

        if(!chan.registered)
            return false;

        // Update database ban table
        return Database.channelBan(chan.name, ip, name, actor.name);
    });

    var chan = this;
    this.users.forEach(function(u) {
        chan.sendBanlist(u);
    });
}

Channel.prototype.banIP = function(actor, receiver) {
    if(!this.hasPermission(actor, "ban"))
        return false;

    this.ipbans[receiver.ip] = [receiver.name, actor.name];
    try {
        receiver.socket.disconnect(true);
    }
    catch(e) {
        // Socket already disconnected
    }
    //this.broadcastBanlist();
    this.logger.log(receiver.ip + " (" + receiver.name + ") was banned by " + actor.name);

    if(!this.registered)
        return false;

    // Update database ban table
    return Database.channelBanIP(this.name, receiver.ip, receiver.name, actor.name);
}

Channel.prototype.unbanIP = function(actor, ip) {
    if(!this.hasPermission(actor, "ban"))
        return false;

    this.ipbans[ip] = null;
    var chan = this;
    this.users.forEach(function(u) {
        chan.sendBanlist(u);
    });

    if(!this.registered)
        return false;

    //this.broadcastBanlist();
    // Update database ban table
    return Database.channelUnbanIP(this.name, ip);
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
    // Search youtube
    if(callback) {
        if(query.trim() == "") {
            return;
        }
        InfoGetter.getYTSearchResults(query, function(err, vids) {
            if(!err) {
                callback(vids);
            }
        });
        return;
    }

    query = query.toLowerCase();
    var results = [];
    for(var id in this.library) {
        if(this.library[id].title.toLowerCase().indexOf(query) != -1) {
            results.push(this.library[id]);
        }
    }
    results.sort(function(a, b) {
        var x = a.title.toLowerCase();
        var y = b.title.toLowerCase();

        return (x == y) ? 0 : (x < y ? -1 : 1);
    });

    return results;
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

    this.logger.log("+++ /" + user.ip + " joined");
    Logger.syslog.log("/" + user.ip + " joined channel " + this.name);
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
    this.broadcastVoteskipUpdate();
    this.broadcastUsercount();
    if(user.name != "") {
        this.sendAll("userLeave", {
            name: user.name
        });
    }
    this.logger.log("--- /" + user.ip + " (" + user.name + ") left");
    if(this.users.length == 0) {
        this.logger.log("*** Channel empty, unloading");
        Server.unload(this);
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
        user.socket.emit("channelRanks", Database.listChannelRanks(this.name));
    }
}

Channel.prototype.sendPlaylist = function(user) {
    user.socket.emit("playlist", this.queue);
    user.socket.emit("setPlaylistMeta", this.plmeta);
}

Channel.prototype.sendMediaUpdate = function(user) {
    if(this.media != null) {
        user.socket.emit("changeMedia", this.media.fullupdate());
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
    io.sockets.in(this.name).emit(message, data);
    NWS.inRoom(this.name).emit(message, data);
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
    for(var i = 0; i < this.queue.length; i++) {
        total += this.queue[i].seconds;
    }
    var timestr = formatTime(total);
    var packet = {
        count: this.queue.length,
        time: timestr
    };
    this.plmeta = packet;
    this.sendAll("setPlaylistMeta", packet);
}

Channel.prototype.broadcastUsercount = function() {
    this.sendAll("usercount", this.users.length);
}

Channel.prototype.broadcastNewUser = function(user) {
    var aliases = Database.getAliases(user.ip);
    var chan = this;
    this.ip_alias[user.ip] = aliases;
    aliases.forEach(function(alias) {
        chan.name_alias[alias] = aliases;
    });

    this.login_hist.unshift({
        name: user.name,
        aliases: this.ip_alias[user.ip],
        time: Date.now()
    });
    if(this.login_hist.length > 20)
        this.login_hist.pop();

    if(user.name.toLowerCase() in this.namebans &&
        this.namebans[user.name.toLowerCase()] != null) {
        this.kick(user, "You're banned!");
        return;
    }
    this.sendAll("addUser", {
        name: user.name,
        rank: user.rank,
        leader: this.leader == user,
        meta: user.meta,
        profile: user.profile
    });
    //this.sendRankStuff(user);
    if(user.rank > Rank.Guest) {
        this.saveRank(user);
    }

    var msg = user.name + " joined (aliases: ";
    msg += this.ip_alias[user.ip].join(", ") + ")";
    var pkt = {
        username: "[server]",
        msg: msg,
        msgclass: "server-whisper",
        time: Date.now()
    };
    this.users.forEach(function(u) {
        if(u.rank >= 2) {
            u.socket.emit("joinMessage", pkt);
        }
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

Channel.prototype.broadcastRankTable = function() {
    var ranks = Database.listChannelRanks(this.name);
    for(var i = 0; i < this.users.length; i++) {
        this.sendACL(this.users[i]);
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
    var need = this.voteskip ? parseInt(this.users.length * this.opts.voteskip_ratio) : 0;
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
        || type == "im";// Imgur album
}

Channel.prototype.queueAdd = function(media, after) {
    if(after === "") {
        this.queue.splice(0, 0, media);
    }
    else {
        for(var i = 0; i < this.queue.length; i++) {
            if(this.queue[i].hash == after) {
                this.queue.splice(i+1, 0, media);
                break;
            }
        }
    }
    this.sendAll("queue", {
        media: media.pack(),
        after: after
    });
    this.broadcastPlaylistMeta();
    if(this.queue.length == 1) {
        this.jumpTo(media.hash);
    }
}

Channel.prototype.autoTemp = function(media, user) {
    if(isLive(media.type)) {
        media.temp = true;
    }
    if(!this.hasPermission(user, "addnontemp")) {
        media.temp = true;
    }
}

Channel.prototype.enqueue = function(data, user, callback) {
    var after = "";
    if(data.pos == "next" && this.queue.length > 0 && this.position >= 0) {
        after = this.queue[this.position].hash;
    }
    else if(data.pos == "end" && this.queue.length > 0) {
        after = this.queue[this.queue.length - 1].hash;
    }

    if(isLive(data.type) && !this.hasPermission(user, "playlistaddlive")) {
        user.socket.emit("queueFail", "You don't have permission to queue livestreams");
        return;
    }

    // Prefer cache over looking up new data
    if(data.id in this.library) {
        var media = this.library[data.id].dup();
        media.queueby = user ? user.name : "";
        this.autoTemp(media, user);
        this.queueAdd(media, after);
        this.logger.log("*** Queued from cache: id=" + data.id);
        if(callback)
            callback();
    }
    else {
        switch(data.type) {
            case "yt":
            case "yp":
            case "vi":
            case "dm":
            case "sc":
                InfoGetter.getMedia(data.id, data.type, function(err, media) {
                    if(err) {
                        if(callback)
                            callback();
                        if(err === true)
                            err = false;
                        user.socket.emit("queueFail", err);
                        return;
                    }
                    media.queueby = user ? user.name : "";
                    this.autoTemp(media, user);
                    this.queueAdd(media, after);
                    this.cacheMedia(media);
                    if(data.type == "yp")
                        after = media.hash;
                    if(callback)
                        callback();
                }.bind(this));
                break;
            case "li":
                var media = new Media(data.id, "Livestream - " + data.id, "--:--", "li");
                media.queueby = user ? user.name : "";
                this.autoTemp(media, user);
                this.queueAdd(media, after);
                if(callback)
                    callback();
                break;
            case "tw":
                var media = new Media(data.id, "Twitch - " + data.id, "--:--", "tw");
                media.queueby = user ? user.name : "";
                this.autoTemp(media, user);
                this.queueAdd(media, after);
                if(callback)
                    callback();
                break;
            case "jt":
                var media = new Media(data.id, "JustinTV - " + data.id, "--:--", "jt");
                media.queueby = user ? user.name : "";
                this.autoTemp(media, user);
                this.queueAdd(media, after);
                if(callback)
                    callback();
                break;
            case "us":
                InfoGetter.getUstream(data.id, function(id) {
                    var media = new Media(id, "Ustream - " + data.id, "--:--", "us");
                    media.queueby = user ? user.name : "";
                    this.autoTemp(media, user);
                    this.queueAdd(media, after);
                    if(callback)
                        callback();
                }.bind(this));
                break;
            case "rt":
                var media = new Media(data.id, "Livestream", "--:--", "rt");
                media.queueby = user ? user.name : "";
                this.autoTemp(media, user);
                this.queueAdd(media, after);
                if(callback)
                    callback();
                break;
            case "jw":
                var media = new Media(data.id, "JWPlayer Stream - " + data.id, "--:--", "jw");
                media.queueby = user ? user.name : "";
                this.autoTemp(media, user);
                this.queueAdd(media, after);
                if(callback)
                    callback();
                break;
            case "im":
                var media = new Media(data.id, "Imgur Album", "--:--", "im");
                media.queueby = user ? user.name : "";
                this.autoTemp(media, user);
                this.queueAdd(media, after);
                if(callback)
                    callback();
                break;
            default:
                break;
        }
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
    if(typeof data.type !== "string" && !(data.id in this.library)) {
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

    if(data.list)
        this.enqueueList(data, user);
    else
        this.enqueue(data, user);
}

Channel.prototype.enqueueList = function(data, user) {
    var pl = data.list;
    var chan = this;
    // Queue in reverse order for qnext
    if(data.pos == "next") {
        var i = pl.length;
        var cback = function() {
            i--;
            if(i > 0) {
                pl[i].pos = "next";
                chan.enqueue(pl[i], user, cback);
            }
        }
        this.enqueue(pl[0], user, cback);
    }
    else {
        var i = 0;
        var cback = function() {
            i++;
            if(i < pl.length) {
                pl[i].pos = "end";
                chan.enqueue(pl[i], user, cback);
            }
        }
        this.enqueue(pl[i], user, cback);
    }
}

Channel.prototype.tryQueuePlaylist = function(user, data) {
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

    var pl = Database.loadUserPlaylist(user.name, data.name);
    data.list = pl;
    this.enqueueList(data, user);
}

Channel.prototype.setTemp = function(hash, temp) {
    var m = false;
    for(var i = 0; i < this.queue.length; i++) {
        if(this.queue[i].hash == hash) {
            m = this.queue[i];
            break;
        }
    }
    if(!m)
        return;
    m.temp = temp;
    this.sendAll("setTemp", {
        hash: hash,
        temp: temp
    });

    if(!temp) {
        this.cacheMedia(m);
    }
}

Channel.prototype.trySetTemp = function(user, data) {
    if(!this.hasPermission(user, "settemp")) {
        return;
    }
    if(typeof data.hash != "string" || typeof data.temp != "boolean") {
        return;
    }

    this.setTemp(data.hash, data.temp);
}


Channel.prototype.dequeue = function(hash, removeonly) {
    var m = false;
    var mpos = 0;
    for(var i = 0; i < this.queue.length; i++) {
        if(this.queue[i].hash == hash) {
            mpos = i;
            m = this.queue[i];
            break;
        }
    }
    if(!m) {
        return;
    }
    this.queue.splice(mpos, 1);
    this.sendAll("delete", {
        hash: hash
    });
    this.broadcastPlaylistMeta();

    if(removeonly)
        return;

    // If you remove the currently playing video, play the next one
    if(mpos == this.position) {
        this.position--;
        this.playNext();
        return;
    }
    // If you remove a video whose position is before the one currently
    // playing, you have to reduce the position of the one playing
    if(mpos < this.position) {
        this.position--;
    }
}

Channel.prototype.tryDequeue = function(user, data) {
    if(!this.hasPermission(user, "playlistdelete")) {
        return;
     }

     if(typeof data !== "string")
         return;

     this.dequeue(data);
}

Channel.prototype.tryUncache = function(user, data) {
    if(!Rank.hasPermission(user, "uncache")) {
        return;
    }
    if(typeof data.id != "string") {
        return;
    }
    if(Database.removeFromLibrary(this.name, data.id)) {
        delete this.library[data.id];
    }
}

Channel.prototype.playNext = function() {
    var pos = this.position + 1 >= this.queue.length ? 0 : this.position + 1;
    this.jumpTo(this.queue[pos].hash);
}

Channel.prototype.tryPlayNext = function(user) {
    if(!this.hasPermission(user, "playlistjump")) {
         return;
     }

     this.playNext();
}

Channel.prototype.jumpTo = function(hash) {
    var m = false;
    var mpos = 0;
    for(var i = 0; i < this.queue.length; i++) {
        if(this.queue[i].hash == hash) {
            m = this.queue[i];
            mpos = i;
            break;
        }
    }

    if(!m)
        return;

    // Reset voteskip
    this.voteskip = false;
    this.broadcastVoteskipUpdate();
    this.drinks = 0;
    this.broadcastDrinks();

    var old = this.position;
    if(this.media && this.media.temp) {
        this.dequeue(this.media.hash, true);
        if(mpos > old && mpos > 0) {
            mpos--;
        }
    }
    if(this.media) {
        delete this.media["currentTime"];
        delete this.media["paused"];
    }
    this.position = mpos;
    var oid = this.media ? this.media.id : "";
    this.media = m;
    this.media.currentTime = -1;
    this.media.paused = false;

    this.sendAll("changeMedia", this.media.fullupdate());

    // If it's not a livestream, enable autolead
    if(this.leader == null && !isLive(this.media.type)) {
        this.time = new Date().getTime();
        if(this.media.id != oid) {
            mediaUpdate(this, this.media.id);
        }
    }
}

Channel.prototype.tryJumpTo = function(user, data) {
    if(!this.hasPermission(user, "playlistjump")) {
         return;
    }

    if(typeof data !== "string") {
        return;
    }

    this.jumpTo(data);
}

Channel.prototype.clearqueue = function() {
    this.queue = [];
    for(var i = 0; i < this.users.length; i++) {
        this.sendPlaylist(this.users[i]);
    }
    this.broadcastPlaylistMeta();
}

Channel.prototype.tryClearqueue = function(user) {
    if(!this.hasPermission(user, "playlistclear")) {
        return;
    }
    this.clearqueue();
}

Channel.prototype.shufflequeue = function() {
    var n = [];
    var current = false;
    while(this.queue.length > 0) {
        var i = parseInt(Math.random() * this.queue.length);
        n.push(this.queue[i]);
        if(!current && i == this.position) {
            this.position = n.length - 1;
            current = true;
        }
        this.queue.splice(i, 1);
    }
    this.queue = n;
    this.sendAll("playlist", this.queue);
    this.sendAll("setPlaylistMeta", this.plmeta);
}

Channel.prototype.tryShufflequeue = function(user) {
    if(!this.hasPermission(user, "playlistshuffle")) {
        return;
    }
    this.shufflequeue();
}

Channel.prototype.tryUpdate = function(user, data) {
    if(this.leader != user) {
        return;
    }

    if(data == null ||
       data.id == undefined || data.currentTime == undefined) {
           return;
    }

    if(this.media == null) {
        return;
    }

    if(isLive(this.media.type) && this.media.type != "jw") {
        return;
    }

    if(this.media.id != data.id) {
        return;
    }

    this.media.currentTime = data.currentTime;
    this.media.paused = data.paused;
    this.sendAll("mediaUpdate", this.media.timeupdate());
}

Channel.prototype.move = function(data, user) {
    var mfrom = false;
    var fromidx = false;
    var mafter = false;
    var toidx = false;
    // Find the two elements
    for(var i = 0; i < this.queue.length; i++) {
        if(this.queue[i].hash == data.from) {
            mfrom = this.queue[i];
            fromidx = i;
            if(data.after === "" || mafter)
                break;
        }
        else if(this.queue[i].hash == data.after) {
            mafter = this.queue[i];
            toidx = i+1;
            if(mfrom)
                break;
        }
    }

    this.queue.splice(fromidx, 1);
    if(data.after === "") {
        this.queue.splice(0, 0, mfrom);
    }
    else {
        var to = toidx;
        if(fromidx < toidx)
            toidx--;
        this.queue.splice(toidx, 0, mfrom);
    }
    var moveby = user && user.name ? user.name : null;
    if(typeof data.moveby !== "undefined")
        moveby = data.moveby;

    this.sendAll("moveVideo", {
        from: data.from,
        after: data.after,
        moveby: moveby
    });

    // Account for moving things around the active video
    if(fromidx < this.position && toidx >= this.position) {
        this.position--;
    }
    else if(fromidx > this.position && toidx <= this.position) {
        this.position++
    }
    else if(fromidx == this.position) {
        this.position = toidx;
    }

}

Channel.prototype.tryMove = function(user, data) {
    if(!this.hasPermission(user, "playlistmove")) {
        return;
    }

    if(typeof data.from !== "string" || typeof data.after !== "string")
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
    if(!this.voteskip) {
        this.voteskip = new Poll("voteskip", "voteskip", ["yes"]);
    }
    this.voteskip.vote(user.ip, 0);
    this.broadcastVoteskipUpdate();
    if(this.voteskip.counts[0] >= parseInt(this.users.length * this.opts.voteskip_ratio)) {
        this.playNext();
    }
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

    this.setLock(data.locked);
}

Channel.prototype.tryToggleLock = function(user) {
    if(!Rank.hasPermission(user, "qlock")) {
        return;
    }

    this.setLock(this.openqueue);
}

Channel.prototype.tryRemoveFilter = function(user, f) {
    if(!this.hasPermission(user, "filteredit"))
        return false;

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

Channel.prototype.updateFilter = function(filter) {
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
    this.broadcastChatFilters();
}

Channel.prototype.tryUpdateFilter = function(user, f) {
    if(!this.hasPermission(user, "filteredit")) {
        return;
    }

    var re = f.source;
    var flags = f.flags;
    try {
        new RegExp(re, flags);
    }
    catch(e) {
        return;
    }
    var filter = new Filter(f.name, f.source, f.flags, f.replace);
    filter.active = f.active;
    filter.filterlinks = f.filterlinks;
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

    for(var key in this.opts) {
        if(key in data) {
            if(key in adminonly && user.rank < Rank.Owner) {
                continue;
            }
            this.opts[key] = data[key];
        }
    }

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
}

Channel.prototype.updateMotd = function(motd) {
    var html = motd.replace(/\n/g, "<br>");
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
    msg = msg.replace(/&/g, "&amp;");
    msg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    this.logger.log("<" + username + "." + msgclass + "> " + msg);
};

/* REGION Rank stuff */

Channel.prototype.trySetRank = function(user, data) {
    if(!Rank.hasPermission(user, "promote"))
        return;

    if(typeof data.user !== "string" || typeof data.rank !== "number")
        return;

    if(data.rank >= user.rank)
        return;

    if(data.rank < 1)
        return;

    var receiver;
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].name == data.user) {
            receiver = this.users[i];
            break;
        }
    }

    if(receiver) {
        if(receiver.rank >= user.rank)
            return;
        receiver.rank = data.rank;
        if(receiver.loggedIn) {
            this.saveRank(receiver);
        }
        this.broadcastUserUpdate(receiver);
    }
    else {
        var rrank = this.getRank(data.user);
        if(rrank >= user.rank)
            return;
        Database.setChannelRank(this.name, data.user, data.rank);
    }

    this.sendAllWithPermission("acl", "setChannelRank", data);
}

Channel.prototype.tryPromoteUser = function(actor, data) {
    if(!Rank.hasPermission(actor, "promote")) {
        return;
    }

    if(data.name == undefined) {
        return;
    }

    var name = data.name;

    var receiver;
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].name == name) {
            receiver = this.users[i];
            break;
        }
    }

    var rank = receiver ? receiver.rank : this.getRank(data.name);

    if(actor.rank > rank + 1) {
        rank++;
        if(receiver) {
            receiver.rank++;
            if(receiver.loggedIn) {
                this.saveRank(receiver);
            }
            this.broadcastUserUpdate(receiver);
        }
        else {
            Database.setChannelRank(this.name, data.name, rank);
        }
        this.logger.log("*** " + actor.name + " promoted " + data.name + " from " + (rank - 1) + " to " + rank);
        //this.broadcastRankTable();
    }
}

Channel.prototype.tryDemoteUser = function(actor, data) {
    if(!Rank.hasPermission(actor, "promote")) {
        return;
    }

    if(data.name == undefined) {
        return;
    }

    var name = data.name;
    var receiver;
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].name == name) {
            receiver = this.users[i];
            break;
        }
    }

    var rank = receiver ? receiver.rank : this.getRank(data.name);

    if(actor.rank > rank) {
        rank--;
        if(receiver) {
            receiver.rank--;
            if(receiver.loggedIn) {
                this.saveRank(receiver);
            }
            this.broadcastUserUpdate(receiver);
        }
        else {
            Database.setChannelRank(this.name, data.name, rank);
        }
        this.logger.log("*** " + actor.name + " demoted " + data.name + " from " + (rank + 1) + " to " + rank);
        //this.broadcastRankTable();
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
        if(this.media != null && !isLive(this.media.type)) {
            this.media.paused = false;
            this.time = new Date().getTime();
            this.i = 0;
            mediaUpdate(this, this.media.id);
        }
        return;
    }
    for(var i = 0; i < this.users.length; i++) {
        if(this.users[i].name == name) {
            this.logger.log("*** Assigned leader: " + name);
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
}

exports.Channel = Channel;
