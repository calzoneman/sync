var ChannelModule = require("./module"); var ULList = require("../ullist");
var AsyncQueue = require("../asyncqueue");
var Media = require("../media");
var util = require("../utilities");
var InfoGetter = require("../get-info");
var vimeoWorkaround = InfoGetter.vimeoWorkaround;
var Config = require("../config");
var Flags = require("../flags");
var db = require("../database");
var Logger = require("../logger");

const MAX_ITEMS = Config.get("playlist.max-items");

const TYPE_QUEUE = {
    id: "string,boolean",
    type: "string",
    pos: "string",
    title: "string,boolean,optional",
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
    paused: "boolean,optional",
    type: "string,optional"
};

const TYPE_CLONE_PLAYLIST = {
    name: "string"
};

const TYPE_QUEUE_PLAYLIST = {
    name: "string",
    pos: "string",
    temp: "boolean,optional"
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
    this._gdRefreshTimer = false;

    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("/clean", this.handleClean.bind(this));
        this.channel.modules.chat.registerCommand("/cleantitle", this.handleClean.bind(this));
    }
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
        var m = new Media(item.media.id, item.media.title, item.media.seconds,
                          item.media.type, item.media.meta || {});
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
    var arr = this.items.toArray().map(function (item) {
        /* Clear Google Docs and Vimeo meta */
        if (item.media && item.media.meta) {
            delete item.media.meta.object;
            delete item.media.meta.params;
            delete item.media.meta.direct;
        }
        return item;
    });
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

    if (this._gdRefreshTimer) {
        clearInterval(this._gdRefreshTimer);
        this._gdRefreshTimer = false;
    }

    this.channel = null;
};

PlaylistModule.prototype.packInfo = function (data, isAdmin) {
    if (this.current) {
        data.mediatitle = this.current.media.title;
        if (isAdmin) {
            data.mediaLink = util.formatLink(this.current.media.id, this.current.media.type);
        }
    } else {
        data.mediatitle = "(Nothing Playing)";
        if (isAdmin) {
            data.mediaLink = "#";
        }
    }

    if (isAdmin) {
        if (this.leader) {
            data.leader = this.leader.getName();
        } else {
            data.leader = "[server]";
        }
    }
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
        self.sendChangeMedia([user]);
    });
    user.socket.on("requestPlaylist", function () {
        self.sendPlaylist([user]);
    });
    user.socket.on("clearPlaylist", this.handleClear.bind(this, user));
    user.socket.on("shufflePlaylist", this.handleShuffle.bind(this, user));
    /* User playlists */
    user.socket.on("listPlaylists", this.handleListPlaylists.bind(this, user));
    if (user.is(Flags.U_REGISTERED)) {
        this.handleListPlaylists(user);
    }
    user.socket.typecheckedOn("clonePlaylist", TYPE_CLONE_PLAYLIST, this.handleClonePlaylist.bind(this, user));
    user.socket.typecheckedOn("deletePlaylist", TYPE_CLONE_PLAYLIST, this.handleDeletePlaylist.bind(this, user));
    user.socket.typecheckedOn("queuePlaylist", TYPE_QUEUE_PLAYLIST, this.handleQueuePlaylist.bind(this, user));
};

PlaylistModule.prototype.onUserPart = function (user) {
    if (this.leader === user) {
        this.leader = null;
        this.channel.broadcastAll("setLeader", "");

        this.channel.logger.log("[playlist] Resuming autolead");
        if (this.current !== null) {
            this.current.media.paused = false;
            if (!this._leadInterval) {
                this._lastUpdate = Date.now();
                this._leadInterval = setInterval(this._leadLoop.bind(this), 1000);
                this._leadLoop();
            }
        }
    }
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

        var m = this.current.media;
        this.channel.logger.log("[playlist] Now playing: " + m.title +
                                " (" + m.type + ":" + m.id + ")");
    } else {
        users.forEach(function (u) {
            u.socket.emit("setCurrent", uid);
            u.socket.emit("changeMedia", update);
        });
    }
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

    /**
     * Specifying a custom title is currently only allowed for custom media
     * and raw files
     */
    if (typeof data.title !== "string" || (data.type !== "cu" && data.type !== "fi")) {
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
    } else if (type === "fi" && !perms.canAddRawFile(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add raw video files",
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
        if (this.channel.modules.options) {
            maxlength = this.channel.modules.options.get("maxlength");
        }
    }

    data = {
        id: data.id,
        type: data.type,
        pos: data.pos,
        title: data.title,
        link: link,
        temp: temp,
        shouldAddToLibrary: !temp,
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
    this.channel.activeLock.lock();
    this.semaphore.queue(function (lock) {
        var lib = self.channel.modules.library;
        if (lib && self.channel.is(Flags.C_REGISTERED) && !util.isLive(data.type)) {
            lib.getItem(data.id, function (err, item) {
                if (err && err !== "Item not in library") {
                    error(err+"");
                    self.channel.activeLock.release();
                    return lock.release();
                }

                if (item !== null) {
                    /* Don't re-cache data we got from the library */
                    data.shouldAddToLibrary = false;
                    self._addItem(item, data, user, function () {
                        lock.release();
                        self.channel.activeLock.release();
                    });
                } else {
                    handleLookup();
                }
            });
        } else {
            handleLookup();
        }

        function handleLookup() {
            InfoGetter.getMedia(data.id, data.type, function (err, media) {
                if (err) {
                    error(err+"");
                    self.channel.activeLock.release();
                    return lock.release();
                }

                self._addItem(media, data, user, function () {
                    lock.release();
                    self.channel.activeLock.release();
                });
            });
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
        InfoGetter.getMedia(data.id, data.type, function (err, vids) {
            if (err) {
                error(err+"");
                return lock.release();
            }

            if (self.dead) {
                return lock.release();
            }

            /**
             * Add videos in reverse order if queueing a playlist next.
             * This is because each video gets added after the currently playing video
             */
            if (data.pos === "next") {
                vids = vids.reverse();
                /* Special case: when the playlist is empty, add the real first video */
                if (self.items.length === 0) {
                    vids.unshift(vids.pop());
                }
            }

            self.channel.activeLock.lock();
            vids.forEach(function (media) {
                data.link = util.formatLink(media.id, media.type);
                self._addItem(media, data, user);
            });
            self.channel.activeLock.release();

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
    self.channel.activeLock.lock();
    this.semaphore.queue(function (lock) {
        if (self._delete(data)) {
            self.channel.logger.log("[playlist] " + user.getName() + " deleted " +
                                    plitem.media.title);
        }

        lock.release();
        self.channel.activeLock.release();
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
        this.channel.modules.library.cacheMedia(item.media);
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
    self.channel.activeLock.lock();
    self.semaphore.queue(function (lock) {
        if (!self.items.remove(data.from)) {
            self.channel.activeLock.release();
            return lock.release();
        }

        if (data.after === "prepend") {
            if (!self.items.prepend(from)) {
                self.channel.activeLock.release();
                return lock.release();
            }
        } else if (data.after === "append") {
            if (!self.items.append(from)) {
                self.channel.activeLock.release();
                return lock.release();
            }
        } else {
            if (!self.items.insertAfter(from, data.after)) {
                self.channel.activeLock.release();
                return lock.release();
            }
        }

        self.channel.broadcastAll("moveVideo", data);

        self.channel.logger.log("[playlist] " + user.getName() + " moved " +
                                from.media.title +
                                (after ? " after " + after.media.title : ""));
        lock.release();
        self.channel.activeLock.release();
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
        this.channel.logger.log("[playlist] " + user.getName() + " skipped " + title);

        if (old && old.temp) {
            this._delete(old.uid);
        }
    }
};

PlaylistModule.prototype.handlePlayNext = function (user) {
    if (!this.channel.modules.permissions.canSkipVideo(user)) {
        return;
    }

    var title = "";
    if (this.current) {
        title = this.current.media.title;
    }

    this.channel.logger.log("[playlist] " + user.getName() + " skipped" + title);
    this._playNext();
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
        this.channel.logger.log("[mod] " + user.getName() + " removed leader from " + old.getName());
    }

    if (!name) {
        this.channel.broadcastAll("setLeader", "");

        this.channel.logger.log("[playlist] Resuming autolead");
        if (this.current !== null) {
            this.current.media.paused = false;

            if (!this._leadInterval) {
                this._lastUpdate = Date.now();
                this._leadInterval = setInterval(this._leadLoop.bind(this), 1000);
                this._leadLoop();
            }
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
    var next = item.next || this.items.first;

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

    if (self.current === item && item === next) {
        self.current = null;
    } else if (self.current === item) {
        self.current = next;
        self.startPlayback();
    }

    return success;
};

PlaylistModule.prototype._addItem = function (media, data, user, cb) {
    var self = this;
    var allowDuplicates = false;
    if (this.channel.modules.options && this.channel.modules.options.get("allow_dupes")) {
        allowDuplicates = true;
    }

    var qfail = function (msg) {
        user.socket.emit("queueFail", {
            msg: msg,
            link: data.link
        });
        if (cb) {
            cb();
        }
    };

    if (data.duration) {
        media.seconds = data.duration;
        media.duration = util.formatTime(media.seconds);
    }

    if (data.maxlength > 0 && media.seconds > data.maxlength) {
        return qfail("Video exceeds the maximum length set by the channel admin: " +
                     data.maxlength + " seconds");
    }

    if (this.items.length >= MAX_ITEMS) {
        return qfail("Playlist limit reached (" + MAX_ITEMS + ")");
    }

    var existing = this.items.findVideoId(media.id);
    if (existing && !allowDuplicates && (data.pos === "end" || existing === this.current)) {
        return qfail("This item is already on the playlist");
    }

    var usersItems = this.items.findAll(function (item) {
        return item.queueby.toLowerCase() === user.getLowerName();
    });

    if (this.channel.modules.options &&
        this.channel.modules.options.get("playlist_max_per_user") &&
        usersItems.length >= this.channel.modules.options.get("playlist_max_per_user")) {

        if (!this.channel.modules.permissions.canExceedMaxItemsPerUser(user)) {
            return qfail("Channel limit exceeded: maximum number of videos per user");
        }
    }

    /* Warn about blocked countries */
    if (media.meta.restricted) {
        user.socket.emit("queueWarn", {
            msg: "Video is blocked in the following countries: " + media.meta.restricted,
            link: data.link
        });
    }

    /* Warn about high bitrate for raw files */
    if (media.type === "fi" && media.meta.bitrate > 1000) {
        user.socket.emit("queueWarn", {
            msg: "This video has a bitrate over 1000kbps.  Clients with slow " +
                 "connections may experience lots of buffering."
        });
    }

    /* Warn about possibly unsupported formats */
    if (media.type === "fi" && media.meta.codec &&
                               media.meta.codec.indexOf("/") !== -1 &&
                               media.meta.codec !== "mov/h264" &&
                               media.meta.codec !== "flv/h264") {
        user.socket.emit("queueWarn", {
            msg: "The codec <code>" + media.meta.codec + "</code> is not supported " +
                 "by all browsers, and is not supported by the flash fallback layer.  " +
                 "This video may not play for some users."
        });
    }

    var item = new PlaylistItem(media, {
        uid: self._nextuid++,
        temp: data.temp,
        queueby: data.queueby
    });

    if (data.title && (media.type === "cu" || media.type === "fi")) {
        media.setTitle(data.title);
    }

    var success = function () {
        var packet = {
            item: item.pack(),
            after: item.prev ? item.prev.uid : "prepend"
        };

        self.meta.count++;
        self.meta.rawTime += media.seconds;
        self.meta.time = util.formatTime(self.meta.rawTime);
        var m = item.media;
        self.channel.logger.log("[playlist] " + (data.queueby || "(anonymous)") +
            " added " + m.title + " (" + m.type + ":" + m.id + ")");

        var perms = self.channel.modules.permissions;
        self.channel.users.forEach(function (u) {
            if (perms.canSeePlaylist(u)) {
                u.socket.emit("queue", packet);
            }

            u.socket.emit("setPlaylistMeta", self.meta);
        });

        if (data.shouldAddToLibrary && !util.isLive(media.type)) {
            if (self.channel.modules.library) {
                self.channel.modules.library.cacheMedia(media);
            }
        }

        if (self.items.length === 1) {
            self.current = item;
            self.startPlayback();
        }

        if (cb) {
            cb();
        }
    };

    if (data.pos === "end" || this.current == null) {
        this.items.append(item);
        return success();
    } else {
        if (this.items.insertAfter(item, this.current.uid)) {
            if (existing && !allowDuplicates) {
                item.temp = existing.temp;
                this._delete(existing.uid);
            }
            return success();
        } else {
            return qfail("Playlist failure");
        }
    }
};

function isExpired(media) {
    if (media.meta.expiration && media.meta.expiration < Date.now()) {
        return true;
    } else if (media.type === "gd") {
        return !media.meta.object;
    } else if (media.type === "vi") {
        return !media.meta.direct;
    }
}

PlaylistModule.prototype.startPlayback = function (time) {
    var self = this;

    if (!self.current || !self.current.media) {
        return false;
    }

    var media = self.current.media;
    media.reset();

    if (self.leader != null) {
        media.paused = false;
        media.currentTime = time || 0;
        self.channel.checkModules("onPreMediaChange", [self.current.media],
            function () {
                /*
                 * onPreMediaChange doesn't care about the callback result.
                 * Its purpose is to allow modification of playback data before
                 * users are sent a changeMedia
                 */
                if (!self.current || !self.current.media) {
                    return;
                }

                self.sendChangeMedia(self.channel.users);
                self.channel.notifyModules("onMediaChange", [self.current.media]);
            }
        );
        return;
    }

    /* Lead-in time of 3 seconds to allow clients to buffer */
    time = time || (media.seconds > 0 ? -3 : 0);
    media.paused = time < 0;
    media.currentTime = time;

    /* Module was already leading, stop the previous timer */
    if (self._leadInterval) {
        clearInterval(self._leadInterval);
        self._leadInterval = false;
    }

    self.channel.checkModules("onPreMediaChange", [self.current.media],
        function () {
            /*
             * onPreMediaChange currently doesn't care about the callback result.
             * Its purpose is to allow modification of playback data before
             * users are sent a changeMedia
             */
            if (!self.current || !self.current.media) {
                return;
            }

            self.sendChangeMedia(self.channel.users);
            self.channel.notifyModules("onMediaChange", [self.current.media]);

            /* Only start the timer if the media item is not live, i.e. has a duration */
            /*
             * 2015-01-22: Don't start the timer if there is an active leader or if
             * the timer is already running.  Both are possible since checkModules()
             * is asynchronous
             */
            if (media.seconds > 0 && !self.leader && !self._leadInterval) {
                self._lastUpdate = Date.now();
                self._leadInterval = setInterval(function() {
                    self._leadLoop();
                }, 1000);
            }
        }
    );
}

const UPDATE_INTERVAL = Config.get("playlist.update-interval");

PlaylistModule.prototype._leadLoop = function() {
    if (this.current == null) {
        return;
    }

    if (!this.channel || this.channel.dead) {
        if (this._leadInterval) {
            clearInterval(this._leadInterval);
            this._leadInterval = false;
        }
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

PlaylistModule.prototype.refreshGoogleDocs = function (cb) {
    var self = this;

    if (self.dead || !self.channel || self.channel.dead) {
        return;
    }

    var abort = function () {
        clearInterval(self._gdRefreshTimer);
        self._gdRefreshTimer = false;
        if (self.current) {
            self.current.media.meta.object = self.current.media.meta.object || null;
            self.current.media.meta.failed = true;
        }
        if (cb) {
            cb();
        }
    };

    if (!this.current || this.current.media.type !== "gd") {
        return abort();
    }

    self.channel.activeLock.lock();
    InfoGetter.getMedia(this.current.media.id, "gd", function (err, media) {
        if (err) {
            Logger.errlog.log("Google Docs autorefresh failed: " + err);
            Logger.errlog.log("ID was: " + self.current.media.id);
            if (self.current) {
                self.current.media.meta.object = self.current.media.meta.object || null;
                self.current.media.meta.failed = true;
            }
            if (cb) {
                cb();
            }
            self.channel.activeLock.release();
        } else {
            if (!self.current || self.current.media.type !== "gd") {
                self.channel.activeLock.release();
                return abort();
            }

            self.current.media.meta = media.meta;
            self.current.media.meta.expiration = Date.now() + 3600000;
            self.channel.logger.log("[playlist] Auto-refreshed Google Doc video");
            cb && cb();
            self.channel.activeLock.release();
        }
    });
};

PlaylistModule.prototype._playNext = function () {
    if (!this.current) {
        return;
    }

    var next = this.current.next || this.items.first;

    if (this.current.temp) {
        /* The _delete handler will take care of starting the next video */
        this._delete(this.current.uid);
    } else if (next) {
        this.current = next;
        this.startPlayback();
    }
};

PlaylistModule.prototype.clean = function (test) {
    var self = this;
    var matches = self.items.findAll(test);
    matches.forEach(function (m) {
        self._delete(m.uid);
    });
};

/**
 * == Command Handlers ==
 */

function generateTargetRegex(target) {
    const flagsre = /^(-[img]+\s+)/i
    var m = target.match(flagsre);
    var flags = "";
    if (m) {
        flags = m[0].slice(1,-1);
        target = target.replace(flagsre, "");
    }
    return new RegExp(target, flags);
}

PlaylistModule.prototype.handleClean = function (user, msg, meta) {
    if (!this.channel.modules.permissions.canDeleteVideo(user)) {
        return;
    }

    var args = msg.split(" ");
    var cmd = args.shift();
    var target = generateTargetRegex(args.join(" "));

    var cleanfn;
    if (cmd === "/clean") {
        cleanfn = function (item) { return target.test(item.queueby); };
    } else if (cmd === "/cleantitle") {
        cleanfn = function (item) { return target.exec(item.media.title) !== null; };
    }

    this.clean(cleanfn);
};

/**
 * == User playlist stuff ==
 */
PlaylistModule.prototype.handleListPlaylists = function (user) {
    if (!user.is(Flags.U_REGISTERED)) {
        return user.socket.emit("errorMsg", {
            msg: "Only registered users can use the user playlist function."
        });
    }

    db.listUserPlaylists(user.getName(), function (err, rows) {
        if (err) {
            user.socket.emit("errorMsg", {
                msg: "Database error when attempting to fetch list of playlists"
            });
            return;
        }

        user.socket.emit("listPlaylists", rows);
    });
};

PlaylistModule.prototype.handleClonePlaylist = function (user, data) {
    if (!user.is(Flags.U_REGISTERED)) {
        return user.socket.emit("errorMsg", {
            msg: "Only registered users can use the user playlist function."
        });
    }

    if (!this.channel.modules.permissions.canSeePlaylist(user)) {
        return user.socket.emit("errorMsg", {
            msg: "You are not allowed to save this playlist"
        });
    }

    data.name = data.name.replace(/[^\u0000-\uffff]/g, "?");

    var pl = this.items.toArray();
    var self = this;
    db.saveUserPlaylist(pl, user.getName(), data.name, function (err) {
        if (err) {
            user.socket.emit("errorMsg", {
                msg: "Database error when saving playlist"
            });
            return;
        }

        self.handleListPlaylists(user);
    });
};

PlaylistModule.prototype.handleDeletePlaylist = function (user, data) {
    if (!user.is(Flags.U_REGISTERED)) {
        return user.socket.emit("errorMsg", {
            msg: "Only registered users can use the user playlist function."
        });
    }

    var self = this;
    db.deleteUserPlaylist(user.getName(), data.name, function (err) {
        if (err) {
            user.socket.emit("errorMsg", {
                msg: "Database error when deleting playlist"
            });
            return;
        }

        self.handleListPlaylists(user);
    });
};

PlaylistModule.prototype.handleQueuePlaylist = function (user, data) {
    var perms = this.channel.modules.permissions;

    if (!perms.canAddList(user)) {
        return;
    }

    if (data.pos !== "next" && data.pos !== "end") {
        return;
    }

    if (data.pos === "next" && !perms.canAddNext(user)) {
        return;
    }

    var temp = data.temp || !perms.canAddNonTemp(user);
    var maxlength = 0;
    if (!perms.canExceedMaxLength(user)) {
        if (this.channel.modules.options) {
            maxlength = this.channel.modules.options.get("maxlength");
        }
    }
    var qdata = {
        temp: temp,
        queueby: user.getName(),
        maxlength: maxlength,
        pos: data.pos
    };

    var self = this;
    self.channel.activeLock.lock();
    db.getUserPlaylist(user.getName(), data.name, function (err, pl) {
        if (err) {
            return user.socket.emit("errorMsg", {
                msg: "Playlist load failed: " + err
            });
        }

        try {
            if (data.pos === "next") {
                pl.reverse();
                if (pl.length > 0 && self.meta.count === 0) {
                    pl.unshift(pl.pop());
                }
            }

            /* Ancient playlists don't have full data */
            if (pl.length > 0 && !pl[0].hasOwnProperty("title")) {
                pl.forEach(function (item) {
                    self.handleQueue(user, {
                        id: item.id,
                        type: item.type,
                        pos: data.pos,
                        temp: temp
                    });
                });
                return;
            }

            pl.forEach(function (item) {
                var m = new Media(item.id, item.title, item.seconds, item.type, item.meta);
                self._addItem(m, qdata, user);
            });
            self.channel.activeLock.release();
        } catch (e) {
            Logger.errlog.log("Loading user playlist failed!");
            Logger.errlog.log("PL: " + user.getName() + "-" + data.name);
            Logger.errlog.log(e.stack);
            user.socket.emit("queueFail", {
                msg: "Internal error occurred when loading playlist.",
                link: null
            });
            self.channel.activeLock.release();
        }
    });
};

module.exports = PlaylistModule;
