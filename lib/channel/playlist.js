var ChannelModule = require("./module"); var ULList = require("../ullist");
var AsyncQueue = require("../asyncqueue");
var Media = require("../media/media");
var util = require("../utilities");
var InfoGetter = require("../get-info");
var vimeoWorkaround = InfoGetter.vimeoWorkaround;

const TYPE_QUEUE = {
    id: "string,boolean",
    type: "string",
    pos: "string",
    title: "string,optional",
    duration: "number,optional",
    temp: "boolean,optional"
};

const TYPE_SET_TEMP = {
    uid: "number",
    temp: "boolean"
};

const TYPE_MOVE_MEDIA = {
    from: "number",
    after: "string,number"
};

const TYPE_ASSIGN_LEADER = {
    name: "string"
};

const TYPE_MEDIA_UPDATE = {
    id: "string",
    currentTime: "number",
    paused: "boolean,optional"
};

function PlaylistItem(media, opts) {
    if (typeof opts !== "object") {
        opts = {};
    }
    this.media = media;
    this.uid = opts.uid;
    this.temp = Boolean(opts.temp);
    this.queueby = (typeof opts.queueby === "string") ? opts.queueby : "";
    this.next = null;
    this.prev = null;
}

PlaylistItem.prototype = {
    pack: function () {
        return {
            media: this.media.pack(),
            uid: this.uid,
            temp: this.temp,
            queueby: this.queueby
        };
    }
};

function PlaylistModule(channel) {
    ChannelModule.apply(this, arguments);
    this.items = new ULList();
    this.meta = {
        count: 0,
        rawTime: 0,
        time: util.formatTime(0)
    };
    this.current = null;
    this._nextuid = 0;
    this.semaphore = new AsyncQueue();

    this.leader = null;
    this._leadInterval = false;
    this._lastUpdate = 0;
    this._counter = 0;
}

PlaylistModule.prototype = Object.create(ChannelModule.prototype);

PlaylistModule.prototype.load = function (data) {
    var self = this;
    var playlist = data.playlist;
    if (typeof playlist !== "object" || !("pl" in playlist)) {
        return;
    }

    var i = 0;
    playlist.pos = parseInt(playlist.pos);
    playlist.pl.forEach(function (item) {
        /* Backwards compatibility */
        if (!("meta" in item.media)) {
            item.media.meta = {
                object: item.media.object,
                params: item.media.params
            };
        }
        var m = new Media(item.media.id, item.media.title, item.media.seconds,
                          item.media.type, item.media.meta);
        var newitem = new PlaylistItem(m, {
            uid: self._nextuid++,
            temp: item.temp,
            queueby: item.queueby
        });

        self.items.append(newitem);
        self.meta.count++;
        self.meta.rawTime += m.seconds;
        if (playlist.pos === i) {
            self.current = newitem;
        }
        i++;
    });

    self.meta.time = util.formatTime(self.meta.rawTime);
    self.startPlayback(playlist.time);
};

PlaylistModule.prototype.save = function (data) {
    var arr = this.items.toArray();
    var pos = 0;
    for (var i = 0; i < arr.length; i++) {
        if (this.current && arr[i].uid == this.current.uid) {
            pos = i;
            break;
        }
    }

    var time = 0;
    if (this.current) {
        time = this.current.media.currentTime;
    }

    data.playlist = {
        pl: arr,
        pos: pos,
        time: time
    };
};

PlaylistModule.prototype.unload = function () {
    if (this._leadInterval) {
        clearInterval(this._leadInterval);
        this._leadInterval = false;
    }

    this.channel = null;
};

PlaylistModule.prototype.onUserPostJoin = function (user) {
    this.sendPlaylist([user]);
    this.sendChangeMedia([user]);
    user.socket.typecheckedOn("queue", TYPE_QUEUE, this.handleQueue.bind(this, user));
    user.socket.typecheckedOn("setTemp", TYPE_SET_TEMP, this.handleSetTemp.bind(this, user));
    user.socket.typecheckedOn("moveMedia", TYPE_MOVE_MEDIA, this.handleMoveMedia.bind(this, user));
    user.socket.on("delete", this.handleDelete.bind(this, user));
    user.socket.on("jumpTo", this.handleJumpTo.bind(this, user));
    user.socket.on("playNext", this.handlePlayNext.bind(this, user));
    user.socket.typecheckedOn("assignLeader", TYPE_ASSIGN_LEADER, this.handleAssignLeader.bind(this, user));
    user.socket.typecheckedOn("mediaUpdate", TYPE_MEDIA_UPDATE, this.handleUpdate.bind(this, user));
    var self = this;
    user.socket.on("playerReady", function () {
        self.sendMediaUpdate([user]);
    });
    user.socket.on("requestPlaylist", function () {
        self.sendPlaylist([user]);
    });
    user.socket.on("clearPlaylist", this.handleClear.bind(this, user));
    user.socket.on("shufflePlaylist", this.handleShuffle.bind(this, user));
};

/**
 * == Functions for sending various playlist data to users ==
 */

PlaylistModule.prototype.sendPlaylist = function (users) {
    var pl = this.items.toArray(true);
    var perms = this.channel.modules.permissions;
    var self = this;
    users.forEach(function (u) {
        u.socket.emit("setPlaylistMeta", self.meta);
        if (!perms.canSeePlaylist(u)) {
            return;
        }
        u.socket.emit("playlist", pl);
        if (self.current) {
            u.socket.emit("setCurrent", self.current.uid);
        }
    });
};

PlaylistModule.prototype.sendChangeMedia = function (users) {
    if (!this.current || !this.current.media) {
        return;
    }

    var update = this.current.media.getFullUpdate();
    var uid = this.current.uid;
    if (users === this.channel.users) {
        this.channel.broadcastAll("setCurrent", uid);
        this.channel.broadcastAll("changeMedia", update);
    } else {
        users.forEach(function (u) {
            u.socket.emit("setCurrent", uid);
            u.socket.emit("changeMedia", update);
        });
    }

    var m = this.current.media;
    this.channel.logger.log("[playlist] Now playing: " + m.title +
                            " (" + m.type + ":" + m.id + ")");
};

PlaylistModule.prototype.sendMediaUpdate = function (users) {
    if (!this.current || !this.current.media) {
        return;
    }

    var update = this.current.media.getTimeUpdate();
    if (users === this.channel.users) {
        this.channel.broadcastAll("mediaUpdate", update);
    } else {
        users.forEach(function (u) {
            u.socket.emit("mediaUpdate", update);
        });
    }
};

/**
 * == Handlers for playlist manipulation ==
 */

PlaylistModule.prototype.handleQueue = function (user, data) {
    if (typeof data.id === "boolean" && data.id !== false) {
        return;
    }

    var id = data.id;
    var type = data.type;

    if (data.pos !== "next" && data.pos !== "end") {
        return;
    }

    /* Specifying a custom title is currently only allowed for custom media */
    if (typeof data.title !== "string" || data.type !== "cu") {
        data.title = false;
    }

    var link = util.formatLink(id, type);
    var perms = this.channel.modules.permissions;

    if (!perms.canAddVideo(user, data)) {
        return;
    }

    if (data.pos === "next" && !perms.canAddNext(user)) {
        return;
    }

    /* Certain media types require special permission to add */
    if (data.type === "yp" && !perms.canAddList(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add playlists",
            link: link
        });
        return;
    } else if (util.isLive(type) && !perms.canAddLive(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add live media",
            link: link
        });
        return;
    } else if (type === "cu" && !perms.canAddCustom(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add custom embeds",
            link: link
        });
        return;
    }

    var temp = data.temp || !perms.canAddNonTemp(user);
    var queueby = user.getName();

    var duration = undefined;
    /**
     * Duration can optionally be specified for a livestream.
     * The UI for it only shows up for jw: queues, but it is
     * accepted for any live media
     */
    if (util.isLive(type) && typeof data.duration === "number") {
        duration = !isNaN(data.duration) ? data.duration : undefined;
    }

    var limit = {
        burst: 3,
        sustained: 1
    };

    if (user.account.effectiveRank >= 2) {
        limit = {
            burst: 10,
            sustained: 2
        };
    }

    if (user.queueLimiter.throttle(limit)) {
        user.socket.emit("queueFail", {
            msg: "You are adding videos too quickly",
            link: link
        });
        return;
    }

    var maxlength = 0;
    if (!perms.canExceedMaxLength(user)) {
        if (this.channel.modules.opts) {
            maxlength = this.channel.modules.opts.get("maxlength");
        }
    }

    data = {
        id: data.id,
        type: data.type,
        pos: data.pos,
        title: data.title,
        link: link,
        temp: temp,
        queueby: queueby,
        duration: duration,
        maxlength: maxlength
    };

    if (data.type === "yp") {
        this.queueYouTubePlaylist(user, data);
    } else {
        this.queueStandard(user, data);
    }
};

PlaylistModule.prototype.queueStandard = function (user, data) {
    var error = function (what) {
        user.socket.emit("queueFail", {
            msg: what,
            link: data.link
        });
    };

    var self = this;
    this.semaphore.queue(function (lock) {
        if (self.dead) {
            return;
        }

        var lib = self.channel.modules.library;
        if (lib) {
            lib.getItem(data.id, function (err, item) {
                if (self.dead) {
                    return;
                }

                if (err && err !== "Item not in library") {
                    error(err+"");
                    return lock.release();
                }

                if (item !== null) {
                    self._addItem(item, data, user, lock);
                } else {
                    handleLookup();
                }
            });
        }

        var handleLookup = function () {
            InfoGetter.getMedia(data.id, data.type, function (err, media) {
                if (self.dead) {
                    return;
                }

                if (err) {
                    console.log(err.stack);
                    error(err+"");
                    return lock.release();
                }

                self._addItem(media, data, user, lock);
            });
        };

        if (!lib) {
            handleLookup();
        }
    });
};

PlaylistModule.prototype.queueYouTubePlaylist = function (user, data) {
    var error = function (what) {
        user.socket.emit("queueFail", {
            msg: what,
            link: data.link
        });
    };

    var self = this;
    this.semaphore.queue(function (lock) {
        if (self.dead) {
            return;
        }

        InfoGetter.getMedia(data.id, data.type, function (err, vids) {
            if (self.dead) {
                return;
            }

            if (err) {
                error(err+"");
                return lock.release();
            }

            var dummy = { release: function () { } };
            vids.forEach(function (media) {
                self._addItem(media, data, user, dummy);
            });

            lock.release();
        });
    });
};

PlaylistModule.prototype.handleDelete = function (user, data) {
    var self = this;
    var perms = this.channel.modules.permissions;
    if (!perms.canDeleteVideo(user)) {
        return;
    }

    if (typeof data !== "number") {
        return;
    }

    var plitem = this.items.find(data);
    this.semaphore.queue(function (lock) {
        if (self.dead) {
            return;
        }

        if (self._delete(data)) {
            self.channel.logger.log("[playlist] " + user.name + " deleted " +
                                    plitem.media.title);
        }

        lock.release();
    });
};

PlaylistModule.prototype.handleSetTemp = function (user, data) {
    if (!this.channel.modules.permissions.canSetTemp(user)) {
        return;
    }

    var item = this.items.find(data.uid);
    if (!item) {
        return;
    }

    item.temp = data.temp;
    this.channel.broadcastAll("setTemp", data);

    if (!data.temp && this.channel.modules.library) {
        this.channel.modules.library.cache(item.media);
    }
};

PlaylistModule.prototype.handleMoveMedia = function (user, data) {
    if (!this.channel.modules.permissions.canMoveVideo(user)) {
        return;
    }

    var from = this.items.find(data.from);
    var after = this.items.find(data.after);

    if (!from || from === after) {
        return;
    }

    var self = this;
    self.semaphore.queue(function (lock) {
        if (!self.items.remove(data.from)) {
            return lock.release();
        }

        if (data.after === "prepend") {
            if (!self.items.prepend(from)) {
                return lock.release();
            }
        } else if (data.after === "append") {
            if (!self.items.append(from)) {
                return lock.release();
            }
        } else {
            if (!self.items.insertAfter(from, data.after)) {
                return lock.release();
            }
        }

        self.channel.broadcastAll("moveVideo", data);

        self.channel.logger.log("[playlist] " + user.getName() + " moved " +
                                from.media.title +
                                (after ? " after " + after.media.title : ""));
        lock.release();
    });
};

PlaylistModule.prototype.handleJumpTo = function (user, data) {
    if (typeof data !== "string" && typeof data !== "number") {
        return;
    }

    if (!this.channel.modules.permissions.canSkipVideo(user)) {
        return;
    }

    var to = this.items.find(data);
    var title = "";
    if (this.current) {
        title = " from " + this.current.media.title;
    }

    if (to) {
        title += " to " + to.media.title;
        var old = this.current;
        this.current = to;
        this.startPlayback();
        this.channel.logger.log("[playlist] " + user.getName() + " skipped" + title);

        if (old.temp) {
            this._delete(old.uid);
        }
    }
};

PlaylistModule.prototype.handlePlayNext = function (user) {
    if (!this.channel.modules.permissions.canSkipVideo(user)) {
        return;
    }

    var to = this.current ? this.current.next : null;
    if (to === null) {
        to = this.items.first;
    }

    var title = "";
    if (this.current) {
        title = " from " + this.current.media.title;
    }

    if (to) {
        title += " to " + to.media.title;
        var old = this.current;
        this.current = to;
        this.startPlayback();
        this.channel.logger.log("[playlist] " + user.getName() + " skipped" + title);

        if (old.temp) {
            this._delete(old.uid);
        }
    }
};

PlaylistModule.prototype.handleClear = function (user) {
    if (!this.channel.modules.permissions.canClearPlaylist(user)) {
        return;
    }

    this.channel.logger.log("[playlist] " + user.getName() + " cleared the playlist");
    this.current = null;
    this.items.clear();
    this.semaphore.reset();

    this.meta = {
        count: 0,
        rawTime: 0,
        time: util.formatTime(0)
    };

    this.channel.broadcastAll("playlist", []);
    this.channel.broadcastAll("setPlaylistMeta", this.meta);
};

PlaylistModule.prototype.handleShuffle = function (user) {
    if (!this.channel.modules.permissions.canShufflePlaylist(user)) {
        return;
    }

    this.channel.logger.log("[playlist] " + user.getName() + " shuffled the playlist");

    var pl = this.items.toArray(false);
    this.items.clear();
    this.semaphore.reset();
    while (pl.length > 0) {
        var i = Math.floor(Math.random() * pl.length);
        var item = new PlaylistItem(pl[i].media, {
            uid: this._nextuid++,
            temp: pl[i].temp,
            queueby: pl[i].queueby
        });

        this.items.append(item);
        pl.splice(i, 1);
    }

    this.current = this.items.first;
    pl = this.items.toArray(true);
    var perms = this.channel.modules.permissions;
    this.channel.users.forEach(function (u) {
        if (perms.canSeePlaylist(u)) {
            u.socket.emit("playlist", pl);
        };
    });
    this.startPlayback();
};

/**
 * == Leader stuff ==
 */
PlaylistModule.prototype.handleAssignLeader = function (user, data) {
    if (!this.channel.modules.permissions.canAssignLeader(user)) {
        return user.kick("Attempted assignLeader without sufficient permission");
    }

    var name = data.name;

    if (this.leader) {
        var old = this.leader;
        this.leader = null;
        if (old.account.effectiveRank === 1.5) {
            old.account.effectiveRank = old.account.oldRank;
            old.socket.emit("rank", old.account.effectiveRank);
        }

        this.channel.broadcastAll("setUserRank", {
            name: old.getName(),
            rank: old.account.effectiveRank
        });
    }

    if (!name) {
        this.channel.broadcastAll("setLeader", "");

        this.channel.logger.log("[playlist] Resuming autolead");
        if (!this._leadInterval) {
            this._lastUpdate = Date.now();
            this._leadInterval = setInterval(this._leadLoop.bind(this), 1000);
        }

        return;
    }

    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getName() === name) {
            this.channel.logger.log("[playlist] Assigned leader: " + name);
            this.leader = this.channel.users[i];
            if (this._leadInterval) {
                clearInterval(this._leadInterval);
                this._leadInterval = false;
            }
            if (this.leader.account.effectiveRank < 1.5) {
                this.leader.account.oldRank = this.leader.account.effectiveRank;
                this.leader.account.effectiveRank = 1.5;
                this.leader.socket.emit("rank", 1.5);
            }

            this.channel.broadcastAll("setLeader", name);
            if (this.leader.account.effectiveRank === 1.5) {
                this.channel.broadcastAll("setUserRank", {
                    name: name,
                    rank: 1.5
                });
            }
            break;
        }
    }

    if (this.leader === null) {
        user.socket.emit("errorMsg", {
            msg: "Unable to assign leader: could not find user " + name
        });
        return;
    }

    this.channel.logger.log("[mod] " + user.getName() + " assigned leader to " + data.name);
};

PlaylistModule.prototype.handleUpdate = function (user, data) {
    if (this.leader !== user) {
        return;
    }

    if (!this.current) {
        return;
    }

    var media = this.current.media;
    if (util.isLive(media.type) && media.type !== "jw") {
        return;
    }

    if (media.id !== data.id || isNaN(data.currentTime)) {
        return;
    }

    media.currentTime = data.currentTime;
    media.paused = Boolean(data.paused);
    var update = media.getTimeUpdate();

    this.channel.broadcastAll("mediaUpdate", update);
};

/**
 * == Internal playlist manipulation ==
 */

PlaylistModule.prototype._delete = function (uid) {
    var self = this;
    var perms = this.channel.modules.permissions;

    var item = self.items.find(uid);
    if (!item) {
        return false;
    }
    var next = item.next;

    var success = self.items.remove(uid);

    if (success) {
        self.meta.count--;
        self.meta.rawTime -= item.media.seconds;
        self.meta.time = util.formatTime(self.meta.rawTime);
        self.channel.users.forEach(function (u) {
            if (perms.canSeePlaylist(u)) {
                u.socket.emit("delete", { uid: uid });
            }
            u.socket.emit("setPlaylistMeta", self.meta);
        });
    }

    if (self.current === item) {
        self.current = next;
        self.startPlayback();
    }

    return success;
};

PlaylistModule.prototype._addItem = function (media, data, user, lock) {
    // TODO Disallow duplicate items?
    var self = this;
    var qfail = function (msg) {
        user.socket.emit("queueFail", {
            msg: msg,
            link: data.link
        });
        return lock.release();
    };

    if (data.maxlength > 0 && media.seconds > data.maxlength) {
        return qfail("Video exceeds the maximum length set by the channel admin: " +
                     data.maxlength + " seconds");
    }

    // TODO this should be configurable
    if (this.items.length >= 4000) {
        return qfail("Playlist limit reached (4,000)");
    }

    /* Warn about blocked countries */
    if (media.meta.restricted) {
        user.socket.emit("queueWarn", {
            msg: "Video is blocked in the following countries: " + media.meta.restricted,
            link: data.link
        });
    }

    var item = new PlaylistItem(media, {
        uid: self._nextuid++,
        temp: data.temp,
        queueby: data.queueby
    });

    if (data.title && media.type === "cu") {
        media.title = data.title;
    }

    var success = function () {
        var packet = {
            item: item.pack(),
            after: item.prev ? item.prev.uid : "prepend"
        };

        self.meta.count++;
        self.meta.rawTime += media.seconds;
        self.meta.time = util.formatTime(self.meta.rawTime);

        var perms = self.channel.modules.permissions;
        self.channel.users.forEach(function (u) {
            if (perms.canSeePlaylist(u)) {
                u.socket.emit("queue", packet);
            }

            u.socket.emit("setPlaylistMeta", self.meta);
        });

        if (!data.temp && !util.isLive(media.type)) {
            if (this.channel.modules.library) {
                this.channel.modules.library.cache(media);
            }
        }

        if (self.items.length === 1) {
            self.current = item;
            self.startPlayback();
        }

        lock.release();
    };

    if (data.pos === "end" || this.current == null) {
        this.items.append(item);
        return success();
    } else {
        if (this.items.insertAfter(item, this.current.uid)) {
            return success();
        } else {
            return qfail("Playlist failure");
        }
    }
};

PlaylistModule.prototype.startPlayback = function (time) {
    var self = this;

    if (!self.current || !self.current.media) {
        return false;
    }

    var media = self.current.media;
    media.reset();

    if (media.type === "vi" && !media.direct && Config.get("vimeo-workaround")) {
        vimeoWorkaround(media.id, function (direct) {
            if (self.current && self.current.media === media) {
                self.current.media.direct = direct;
                self.startPlayback(time);
            }
        });
        return;
    }

    if (self.leader != null) {
        media.paused = false;
        media.currentTime = time || 0;
        self.sendChangeMedia(self.channel.users);
        self.channel.notifyModules("onMediaChange", this.current.media);
        return;
    }

    /* Lead-in time of 3 seconds to allow clients to buffer */
    time = time || -3;
    media.paused = time < 0;
    media.currentTime = time;

    /* Module was already leading, stop the previous timer */
    if (self._leadInterval) {
        clearInterval(self._leadInterval);
        self._leadInterval = false;
    }

    self.sendChangeMedia(self.channel.users);
    self.channel.notifyModules("onMediaChange", this.current.media);

    /* Only start the timer if the media item is not live, i.e. has a duration */
    if (media.seconds > 0) {
        self._lastUpdate = Date.now();
        self._leadInterval = setInterval(function() {
            self._leadLoop();
        }, 1000);
    }
}

/* TODO move this to a configuration key */
const UPDATE_INTERVAL = 5;

PlaylistModule.prototype._leadLoop = function() {
    if (this.current == null) {
        return;
    }

    if (this.channel.dead) {
        this.die();
        return;
    }

    var dt = (Date.now() - this._lastUpdate) / 1000.0;
    var t = this.current.media.currentTime;

    /* Transition from lead-in to playback */
    if (t < 0 && (t + dt) >= 0) {
        this.current.media.currentTime = 0;
        this.current.media.paused = false;
        this._counter = 0;
        this._lastUpdate = Date.now();
        this.sendMediaUpdate(this.channel.users);
        return;
    }

    this.current.media.currentTime += dt;
    this._lastUpdate = Date.now();
    this._counter++;

    /**
     * Don't transition until 2 seconds after the end, to allow slightly
     * off-sync clients to catch up
     */
    if (this.current.media.currentTime >= this.current.media.seconds + 2) {
        this._playNext();
    } else if(this._counter % UPDATE_INTERVAL == 0) {
        this.sendMediaUpdate(this.channel.users);
    }
};

PlaylistModule.prototype._playNext = function () {
    if (!this.current) {
        return;
    }

    var next = this.current.next || this.items.first;

    if (this.current.temp) {
        this._delete(this.current.uid);
    }

    if (next) {
        this.current = next;
        this.startPlayback();
    }
};

module.exports = PlaylistModule;
