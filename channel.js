
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
var io = require("./server.js").io;
var Rank = require("./rank.js");
var Auth = require("./auth.js");
var ChatCommand = require("./chatcommand.js");

var Channel = function(name) {
    Logger.syslog.log("Opening channel " + name);

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
    this.opts = {
        qopen_allow_qnext: false,
        qopen_allow_move: false,
        qopen_allow_playnext: false,
        qopen_allow_delete: false,
        allow_voteskip: true,
        voteskip_ratio: 0.5,
        pagetitle: this.name,
        customcss: "",
        customjs: "",
        chat_antiflood: false
    };
    this.filters = [
        [/`([^`]+)`/g          , "<code>$1</code>"    , true],
        [/\*([^\*]+)\*/g       , "<strong>$1</strong>", true],
        [/(^| )_([^_]+)_/g     , "$1<em>$2</em>"      , true],
        [/\\\\([-a-zA-Z0-9]+)/g, "[](/$1)"            , true]
    ];
    this.motd = {
        motd: "",
        html: ""
    };
    this.ipbans = {};
    this.logger = new Logger.Logger("chanlogs/" + this.name + ".log");
    this.i = 0;
    this.time = new Date().getTime();
    this.plmeta = {
        count: 0,
        time: "00:00"
    };

    Database.loadChannel(this);
    if(this.registered) {
        this.loadDump();
    }
}

/* REGION Channel data */
Channel.prototype.loadDump = function() {
    fs.readFile("chandump/" + this.name, function(err, data) {
        if(err) {
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
                this.queue.push(m);
            }
            this.sendAll("playlist", {
                pl: this.queue
            });
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
                this.opts[key] = data.opts[key];
            }
            this.broadcastOpts();
            if(data.filters) {
                this.filters = new Array(data.filters.length);
                for(var i = 0; i < data.filters.length; i++) {
                    this.filters[i] = [new RegExp(data.filters[i][0], "g"),
                                       data.filters[i][1],
                                       data.filters[i][2]];
                }
            }
            if(data.motd) {
                this.motd = data.motd;
            }
        }
        catch(e) {
            Logger.errlog.log("Channel dump load failed: ");
            Logger.errlog.log(e);
        }
    }.bind(this));
}

Channel.prototype.saveDump = function() {
    var filts = new Array(this.filters.length);
    for(var i = 0; i < this.filters.length; i++) {
        filts[i] = [this.filters[i][0].source,
                    this.filters[i][1],
                    this.filters[i][2]];
    }
    var dump = {
        position: this.position,
        currentTime: this.media ? this.media.currentTime : 0,
        queue: this.queue,
        opts: this.opts,
        filters: filts,
        motd: this.motd
    };
    var text = JSON.stringify(dump);
    fs.writeFileSync("chandump/" + this.name, text);
    this.logger.flush();
}

Channel.prototype.tryRegister = function(user) {
    if(this.registered) {
        user.socket.emit("registerChannel", {
            success: false,
            error: "This channel is already registered"
        });
    }
    else if(!user.loggedIn) {
        user.socket.emit("registerChannel", {
            success: false,
            error: "You must log in to register a channel"
        });

    }
    else if(!Rank.hasPermission(user, "registerChannel")) {
        user.socket.emit("registerChannel", {
            success: false,
            error: "You don't have permission to register this channel"
        });
    }
    else {
        if(Database.registerChannel(this)) {
            this.registered = true;
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

Channel.prototype.getRank = function(name) {
    var global = Auth.getGlobalRank(name);
    if(!this.registered) {
        return global;
    }
    var local = Database.lookupChannelRank(this.name, name);
    return local > global ? local : global;
}

Channel.prototype.saveRank = function(user) {
    return Database.saveChannelRank(this.name, user);
}

Channel.prototype.cacheMedia = function(media) {
    this.library[media.id] = media;
    if(this.registered) {
        return Database.cacheMedia(this.name, media);
    }
    return false;
}

Channel.prototype.banIP = function(actor, receiver) {
    if(!Rank.hasPermission(actor, "ipban"))
        return false;

    this.ipbans[receiver.ip] = [receiver.name, actor.name];
    try {
        receiver.socket.disconnect(true);
    }
    catch(e) {
        // Socket already disconnected
    }
    this.broadcastBanlist();
    this.logger.log(receiver.ip + " (" + receiver.name + ") was banned by " + actor.name);

    if(!this.registered)
        return false;

    // Update database ban table
    return Database.addChannelBan(this.name, actor, receiver);
}

Channel.prototype.unbanIP = function(actor, ip) {
    if(!Rank.hasPermission(actor, "ipban"))
        return false;

    this.ipbans[ip] = null;

    if(!this.registered)
        return false;

    this.broadcastBanlist();
    // Update database ban table
    return Database.removeChannelBan(this.name, ip);
}

Channel.prototype.search = function(query, callback) {
    // Search youtube
    if(callback) {
        if(query.trim() == "") {
            return;
        }
        InfoGetter.getYTSearchResults(query, function(vids) {
            callback(vids);
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
    // GTFO
    if(user.ip in this.ipbans && this.ipbans[user.ip] != null) {
        this.logger.log("--- Kicking " + user.ip + " - banned");
        this.kick(user, "You're banned!");
        user.socket.disconnect(true);
        return;
    }

    // Join the socket pool for this channel
    user.socket.join(this.name);

    // Prevent duplicate login
    if(user.name != "") {
        for(var i = 0; i < this.users.length; i++) {
            if(this.users[i].name == user.name) {
                user.name = "";
                user.loggedIn = false;
                user.socket.emit("login", {
                    success: false,
                    error: "The username " + user.name + " is already in use on this channel"
                });
            }
        }
    }

    // If the channel is empty and isn't registered, the first person
    // gets ownership of the channel (temporarily)
    if(this.users.length == 0 && !this.registered) {
        user.rank = (user.rank < Rank.Owner) ? Rank.Owner + 7 : user.rank;
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
    user.socket.emit("queueLock", {locked: !this.openqueue});
    this.sendUserlist(user);
    this.sendRecentChat(user);
    if(this.poll) {
        user.socket.emit("newPoll", this.poll.packUpdate());
    }
    user.socket.emit("channelOpts", this.opts);
    user.socket.emit("updateMotd", this.motd);
    user.socket.emit("drinkCount", {count: this.drinks});

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

Channel.prototype.sendRankStuff = function(user) {
    if(Rank.hasPermission(user, "ipban")) {
        var ents = [];
        for(var ip in this.ipbans) {
            if(this.ipbans[ip] != null) {
                ents.push({
                    ip: ip,
                    name: this.ipbans[ip][0],
                    banner: this.ipbans[ip][1]
                });
            }
        }
        user.socket.emit("banlist", {entries: ents});
    }
    if(Rank.hasPermission(user, "chatFilter")) {
        var filts = new Array(this.filters.length);
        for(var i = 0; i < this.filters.length; i++) {
            filts[i] = [this.filters[i][0].source, this.filters[i][1], this.filters[i][2]];
        }
        user.socket.emit("chatFilters", {filters: filts});
    }
    this.sendACL(user);
}

Channel.prototype.sendACL = function(user) {
    if(Rank.hasPermission(user, "acl")) {
        user.socket.emit("acl", Database.getChannelRanks(this.name));
    }
}

Channel.prototype.sendPlaylist = function(user) {
    user.socket.emit("playlist", {
        pl: this.queue
    });
    user.socket.emit("updatePlaylistIdx", {
        idx: this.position
    });
    user.socket.emit("updatePlaylistMeta", this.plmeta);
}

Channel.prototype.sendMediaUpdate = function(user) {
    if(this.media != null) {
        user.socket.emit("mediaUpdate", this.media.packupdate());
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
                meta: this.users[i].meta
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
    this.sendAll("updatePlaylistMeta", packet);
}

Channel.prototype.broadcastUsercount = function() {
    this.sendAll("usercount", {
        count: this.users.length
    });
}

Channel.prototype.broadcastNewUser = function(user) {
    this.sendAll("addUser", {
        name: user.name,
        rank: user.rank,
        leader: this.leader == user,
        meta: user.meta
    });
    this.sendRankStuff(user);
    if(user.rank > Rank.Guest) {
        this.saveRank(user);
    }
}

Channel.prototype.broadcastRankUpdate = function(user) {
    this.sendAll("updateUser", {
        name: user.name,
        rank: user.rank,
        leader: this.leader == user,
        meta: user.meta
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
    for(var ip in this.ipbans) {
        if(this.ipbans[ip] != null) {
            ents.push({
                ip: ip,
                name: this.ipbans[ip][0],
                banner: this.ipbans[ip][1]
            });
        }
    }
    for(var i = 0; i < this.users.length; i++) {
        if(Rank.hasPermission(this.users[i], "ipban")) {
            this.users[i].socket.emit("banlist", {entries: ents});
        }
    }
}

Channel.prototype.broadcastRankTable = function() {
    var ranks = Database.getChannelRanks(this.name);
    for(var i = 0; i < this.users.length; i++) {
        this.sendACL(this.users[i]);
    }
}

Channel.prototype.broadcastChatFilters = function() {
    var filts = new Array(this.filters.length);
    for(var i = 0; i < this.filters.length; i++) {
        filts[i] = [this.filters[i][0].source, this.filters[i][1], this.filters[i][2]];
    }
    for(var i = 0; i < this.users.length; i++) {
        if(Rank.hasPermission(this.users[i], "chatFilter")) {
            this.users[i].socket.emit("chatFilters", {filters: filts});
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
    this.sendAll("updateMotd", this.motd);
}

Channel.prototype.broadcastDrinks = function() {
    this.sendAll("drinkCount", {count: this.drinks});
}

/* REGION Playlist Stuff */

// The server autolead function
function mediaUpdate(chan, id) {
    // Bail cases - video changed, someone's leader, no video playing
    if(chan.media == null ||
           id != chan.media.id ||
           chan.leader != null) {
        return;
    }

    chan.media.currentTime += (new Date().getTime() - chan.time) / 1000.0;
    chan.time = new Date().getTime();

    // Show's over, move on to the next thing
    if(chan.media.currentTime > chan.media.seconds) {
        chan.playNext();
    }
    // Send updates about every 5 seconds
    else if(chan.i % 5 == 0) {
        chan.sendAll("mediaUpdate", chan.media.packupdate());
    }
    chan.i++;

    setTimeout(function() { mediaUpdate(chan, id); }, 1000);
}

function isLive(type) {
    return type == "li"
        || type == "tw"
        || type == "rt"
        || type == "jw";
}

Channel.prototype.enqueue = function(data, user) {
    var idx = data.pos == "next" ? this.position + 1 : this.queue.length;

    // Prefer cache over looking up new data
    if(data.id in this.library) {
        var media = this.library[data.id];
        media.queueby = user ? user.name : "";
        this.queue.splice(idx, 0, media);
        this.sendAll("queue", {
            media: media.pack(),
            pos: idx
        });
        this.broadcastPlaylistMeta();
        this.logger.log("*** Queued from cache: id=" + data.id);
    }
    else {
        switch(data.type) {
            case "yt":
            case "yp":
            case "vi":
            case "dm":
            case "sc":
                InfoGetter.getMedia(data.id, data.type, function(media) {
                    media.queueby = user ? user.name : "";
                    this.queue.splice(idx, 0, media);
                    this.sendAll("queue", {
                        media: media.pack(),
                        pos: idx
                    });
                    this.broadcastPlaylistMeta();
                    this.cacheMedia(media);
                    if(data.type == "yp")
                        idx++;
                }.bind(this));
                break;
            case "li":
                var media = new Media(data.id, "Livestream - " + data.id, "--:--", "li");
                media.queueby = user ? user.name : "";
                this.queue.splice(idx, 0, media);
                this.sendAll("queue", {
                    media: media.pack(),
                    pos: idx
                });
                this.broadcastPlaylistMeta();
                break;
            case "tw":
                var media = new Media(data.id, "Twitch - " + data.id, "--:--", "tw");
                media.queueby = user ? user.name : "";
                this.queue.splice(idx, 0, media);
                this.sendAll("queue", {
                    media: media.pack(),
                    pos: idx
                });
                this.broadcastPlaylistMeta();
                break;
            case "rt":
                var media = new Media(data.id, "Livestream", "--:--", "rt");
                media.queueby = user ? user.name : "";
                this.queue.splice(idx, 0, media);
                this.sendAll("queue", {
                    media: media.pack(),
                    pos: idx
                });
                this.broadcastPlaylistMeta();
                break;
            case "jw":
                var media = new Media(data.id, "JWPlayer Stream - " + data.id, "--:--", "jw");
                media.queueby = user ? user.name : "";
                this.queue.splice(idx, 0, media);
                this.sendAll("queue", {
                    media: media.pack(),
                    pos: idx
                });
                this.broadcastPlaylistMeta();
                break;
            default:
                break;
        }
    }
}

Channel.prototype.tryQueue = function(user, data) {
    if(!Rank.hasPermission(user, "queue") &&
            this.leader != user &&
            !this.openqueue) {
        return;
    }
    if(data.pos == undefined || data.id == undefined) {
        return;
    }
    if(data.type == undefined && !(data.id in this.library)) {
        return;
    }

    if(data.pos == "next" && !Rank.hasPermission(user, "queue") &&
            this.leader != user &&
            !this.opts.qopen_allow_qnext) {
        return;
    }

    if(user.rank < Rank.Moderator
            && this.leader  != user
            && user.noflood("queue", 1.5)) {
        return;
    }

    this.enqueue(data, user);
}

Channel.prototype.dequeue = function(data) {
    if(data.pos < 0 || data.pos >= this.queue.length) {
        return;
    }

    this.queue.splice(data.pos, 1);
    this.sendAll("unqueue", {
        pos: data.pos
    });
    this.broadcastPlaylistMeta();

    // If you remove the currently playing video, play the next one
    if(data.pos == this.position) {
        this.position--;
        this.playNext();
        return;
    }
    // If you remove a video whose position is before the one currently
    // playing, you have to reduce the position of the one playing
    if(data.pos < this.position) {
        this.position--;
    }
}

Channel.prototype.tryDequeue = function(user, data) {
    if(!Rank.hasPermission(user, "queue") &&
            this.leader != user &&
            (!this.openqueue ||
             this.openqueue && !this.opts.qopen_allow_delete)) {
        return;
     }

     if(data.pos == undefined) {
         return;
     }

     this.dequeue(data);
}

Channel.prototype.tryUncache = function(user, data) {
    if(!Rank.hasPermission(user, "uncache")) {
        return;
    }
    if(typeof data.id != "string") {
        return;
    }
    if(Database.uncacheMedia(this.name, data.id)) {
        delete this.library[data.id];
    }
}

Channel.prototype.playNext = function() {
    // Nothing to play
    if(this.queue.length == 0) {
        return;
    }

    // Reset voteskip
    this.voteskip = false;
    this.broadcastVoteskipUpdate();
    this.drinks = 0;
    this.broadcastDrinks();

    var old = this.position;
    // Wrap around if the end is hit
    if(this.position + 1 >= this.queue.length) {
        this.position = -1;
    }

    this.position++;
    var oid = this.media ? this.media.id : "";
    this.media = this.queue[this.position];
    this.media.currentTime = -1;

    this.sendAll("mediaUpdate", this.media.packupdate());
    this.sendAll("updatePlaylistIdx", {
        old: old,
        idx: this.position
    });

    // If it's not a livestream, enable autolead
    if(this.leader == null && !isLive(this.media.type)) {
        this.time = new Date().getTime();
        if(this.media.id != oid) {
            mediaUpdate(this, this.media.id);
        }
    }
}

Channel.prototype.tryPlayNext = function(user) {
    if(!Rank.hasPermission(user, "queue") &&
            this.leader != user &&
            (!this.openqueue ||
             this.openqueue && !this.opts.qopen_allow_playnext)) {
         return;
     }

     this.playNext();
}

Channel.prototype.jumpTo = function(pos) {
    if(pos >= this.queue.length || pos < 0) {
        return;
    }

    // Reset voteskip
    this.voteskip = false;
    this.broadcastVoteskipUpdate();
    this.drinks = 0;
    this.broadcastDrinks();

    var old = this.position;
    this.position = pos;
    var oid = this.media ? this.media.id : "";
    this.media = this.queue[this.position];
    this.media.currentTime = -1;

    this.sendAll("mediaUpdate", this.media.packupdate());
    this.sendAll("updatePlaylistIdx", {
        old: old,
        idx: this.position
    });

    // If it's not a livestream, enable autolead
    if(this.leader == null && !isLive(this.media.type)) {
        this.time = new Date().getTime();
        if(this.media.id != oid) {
            mediaUpdate(this, this.media.id);
        }
    }
}

Channel.prototype.tryJumpTo = function(user, data) {
    if(!Rank.hasPermission(user, "queue") &&
            this.leader != user &&
            (!this.openqueue ||
             this.openqueue && !this.opts.qopen_allow_playnext)) {
         return;
    }

    if(data.pos == undefined) {
        return;
    }

    this.jumpTo(data.pos);
}

Channel.prototype.clearqueue = function() {
    this.queue = [];
    for(var i = 0; i < this.users.length; i++) {
        this.sendPlaylist(this.users[i]);
    }
    this.broadcastPlaylistMeta();
}

Channel.prototype.tryClearqueue = function(user) {
    if(!Rank.hasPermission(user, "queue")) {
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
    for(var i = 0; i < this.users.length; i++) {
        this.sendPlaylist(this.users[i]);
    }
}

Channel.prototype.tryShufflequeue = function(user) {
    if(!Rank.hasPermission(user, "queue")) {
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

    if(isLive(this.media.type)) {
        return;
    }

    if(this.media.id != data.id) {
        return;
    }

    this.media.currentTime = data.currentTime;
    this.sendAll("mediaUpdate", this.media.packupdate());
}

Channel.prototype.move = function(data) {
    if(data.src < 0 || data.src >= this.queue.length) {
        return;
    }
    if(data.dest < 0 || data.dest > this.queue.length) {
        return;
    }

    var media = this.queue[data.src];
    var dest = data.dest > data.src ? data.dest + 1 : data.dest;
    var src =  data.dest > data.src ? data.src      : data.src + 1;

    this.queue.splice(dest, 0, media);
    this.queue.splice(src, 1);
    this.sendAll("moveVideo", {
        src: data.src,
        dest: data.dest
    });

    // Account for moving things around the active video
    if(data.src < this.position && data.dest >= this.position) {
        this.position--;
    }
    else if(data.src > this.position && data.dest < this.position) {
        this.position++
    }
    else if(data.src == this.position) {
        this.position = data.dest;
    }
}

Channel.prototype.tryMove = function(user, data) {
    if(!Rank.hasPermission(user, "queue") &&
            this.leader != user &&
            (!this.openqueue ||
             this.openqueue && !this.opts.qopen_allow_move)) {
         return;
     }

     if(data.src == undefined || data.dest == undefined) {
         return;
     }

     this.move(data);
}

/* REGION Polls */

Channel.prototype.tryOpenPoll = function(user, data) {
    if(!Rank.hasPermission(user, "poll") && this.leader != user) {
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
    if(!Rank.hasPermission(user, "poll") && this.leader != user) {
        return;
    }

    if(this.poll) {
        this.poll = false;
        this.broadcastPollClose();
    }
}

Channel.prototype.tryVote = function(user, data) {
    if(data.option == undefined) {
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
    this.sendAll("queueLock", {locked: locked});
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

Channel.prototype.updateFilter = function(filter) {
    var found = false;
    for(var i = 0; i < this.filters.length; i++) {
        if(this.filters[i][0].source == filter[0].source) {
            found = true;
            this.filters[i][1] = filter[1];
            this.filters[i][2] = filter[2];
        }
    }
    if(!found) {
        this.filters.push(filter);
    }
    this.broadcastChatFilters();
}

Channel.prototype.removeFilter = function(regex) {
    for(var i = 0; i < this.filters.length; i++) {
        if(this.filters[i][0].source == regex) {
            this.filters.splice(i, 1);
            break;
        }
    }
    this.broadcastChatFilters();
}

Channel.prototype.tryChangeFilter = function(user, data) {
    if(!Rank.hasPermission(user, "chatFilter")) {
        return;
    }

    if(data.cmd == undefined || data.filter == undefined) {
        return;
    }

    if(data.cmd == "update") {
        var re = data.filter[0];
        var flags = "g";
        var slash = re.lastIndexOf("/");
        if(slash > 0 && re[slash-1] != "\\") {
            flags = re.substring(slash+1);
            re = re.substring(0, slash);
        }
        try {
            data.filter[0] = new RegExp(re, flags);
        }
        catch(e) {
            return;
        }
        this.updateFilter(data.filter);
    }
    else if(data.cmd == "remove") {
        this.removeFilter(data.filter[0]);
    }
}

Channel.prototype.tryUpdateOptions = function(user, data) {
    if(!Rank.hasPermission(user, "channelOpts")) {
        return;
    }

    for(var key in this.opts) {
        if(key in data) {
            this.opts[key] = data[key];
        }
    }

    this.broadcastOpts();
}

Channel.prototype.updateMotd = function(motd) {
    var html = motd.replace(/\n/g, "<br>");
    html = this.filterMessage(html);
    this.motd = {
        motd: motd,
        html: html
    };
    this.broadcastMotd();
}

Channel.prototype.tryUpdateMotd = function(user, data) {
    if(!Rank.hasPermission(user, "updateMotd")) {
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

    if(data.msg == undefined) {
        return;
    }

    var msg = data.msg;
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
    msg = msg.replace(/(((https?)|(ftp))(:\/\/[0-9a-zA-Z\.]+(:[0-9]+)?[^\s$]+))/g, "<a href=\"$1\" target=\"_blank\">$1</a>");
    // Apply other filters
    for(var i = 0; i < this.filters.length; i++) {
        if(!this.filters[i][2])
            continue;
        var regex = this.filters[i][0];
        var replace = this.filters[i][1];
        msg = msg.replace(regex, replace);
    }
    return msg;
}

Channel.prototype.sendMessage = function(username, msg, msgclass, data) {
    // I don't want HTML from strangers
    msg = msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    msg = this.filterMessage(msg);
    var msgobj = {
        username: username,
        msg: msg,
        msgclass: msgclass
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
            this.broadcastRankUpdate(receiver);
        }
        else {
            Database.saveChannelRank(this.name, {
                name: data.name,
                rank: rank
            });
        }
        this.logger.log("*** " + actor.name + " promoted " + data.name + " from " + (rank - 1) + " to " + rank);
        this.broadcastRankTable();
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
            this.broadcastRankUpdate(receiver);
        }
        else {
            Database.saveChannelRank(this.name, {
                name: data.name,
                rank: rank
            });
        }
        this.logger.log("*** " + actor.name + " demoted " + data.name + " from " + (rank + 1) + " to " + rank);
        this.broadcastRankTable();
    }
}

Channel.prototype.changeLeader = function(name) {
    if(this.leader != null) {
        var old = this.leader;
        this.leader = null;
        this.broadcastRankUpdate(old);
    }
    if(name == "") {
        this.logger.log("*** Resuming autolead");
        if(this.media != null && !isLive(this.media.type)) {
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
            this.broadcastRankUpdate(this.leader);
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
