var ChannelModule = require("./module"); var ULList = require("../ullist");
var AsyncQueue = require("../asyncqueue");
var Media = require("../media");
var util = require("../utilities");
var InfoGetter = require("../get-info");
var Config = require("../config");
var Flags = require("../flags");
var db = require("../database");
var CustomEmbedFilter = require("../customembed").filter;
var XSS = require("../xss");
import { Counter } from 'prom-client';

const LOGGER = require('@calzoneman/jsli')('playlist');

const MAX_ITEMS = Config.get("playlist.max-items");
// Limit requestPlaylist to once per 60 seconds
const REQ_PLAYLIST_THROTTLE = {
    burst: 1,
    sustained: 0,
    cooldown: 60
};


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

function PlaylistModule(_channel) {
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
    this._refreshing = false;

    if (this.channel.modules.chat) {
        this.channel.modules.chat.registerCommand("/clean", this.handleClean.bind(this));
        this.channel.modules.chat.registerCommand("/cleantitle", this.handleClean.bind(this));
    }

    this.supportsDirtyCheck = true;
    this._positionDirty = false;
    this._listDirty = false;
}

PlaylistModule.prototype = Object.create(ChannelModule.prototype);

Object.defineProperty(PlaylistModule.prototype, "dirty", {
    get() {
        return this._positionDirty || this._listDirty;
    },

    set(val) {
        this._positionDirty = this._listDirty = val;
    }
});

PlaylistModule.prototype.load = function (data) {
    var self = this;
    let { playlist, playlistPosition } = data;

    if (typeof playlist !== "object") {
        return;
    }

    if (!playlist.hasOwnProperty("pl")) {
        LOGGER.warn(
            "Bad playlist for channel %s",
            self.channel.uniqueName
        );
        return;
    }

    if (!playlistPosition || !playlist.externalPosition) {
        // Old style playlist
        playlistPosition = {
            index: playlist.pos,
            time: playlist.time
        };
    }

    let i = 0;
    playlist.pl.forEach(function (item) {
        if (item.media.type === "cu" && item.media.id.indexOf("cu:") !== 0) {
            try {
                item.media = CustomEmbedFilter(item.media.id);
            } catch (e) {
                return;
            }
        } else if (item.media.type === "gd") {
            delete item.media.meta.gpdirect;
        } else if (["vm", "jw", "mx", "im"].includes(item.media.type)) {
            // JW has been deprecated for a long time
            // VM shut down in December 2017
            // Mixer shut down in July 2020
            // Dunno when imgur album embeds stopped working but they don't work either
            LOGGER.warn(
                "Dropping playlist item with deprecated type %s",
                item.media.type
            );
            return;
        } else if (item.media.meta.embed && item.media.meta.embed.tag !== 'iframe') {
            LOGGER.warn("Dropping playlist item with flash embed");
            return;
        }

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
        if (playlistPosition.index === i) {
            self.current = newitem;
        }
        i++;
    });

    // Sanity check, in case the current item happened to be deleted by
    // one of the checks above
    if (!self.current && self.meta.count > 0) {
        self.current = self.items.first;
        playlistPosition.time = -3;
    }

    self.meta.time = util.formatTime(self.meta.rawTime);
    self.startPlayback(playlistPosition.time);
    self.dirty = false;
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

    data.playlistPosition = {
        index: pos,
        time
    };

    if (this._listDirty) {
        data.playlist = { pl: arr, pos, time, externalPosition: true };
    }
};

PlaylistModule.prototype.unload = function () {
    if (this._leadInterval) {
        clearInterval(this._leadInterval);
        this._leadInterval = false;
    }

    this.channel = null;
};

PlaylistModule.prototype.packInfo = function (data, isAdmin) {
    if (this.current) {
        data.mediatitle = this.current.media.title;
        if (isAdmin) {
            data.mediaLink = util.formatLink(
                this.current.media.id,
                this.current.media.type,
                this.current.media.meta
            );
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
    user.socket.on("requestPlaylist", this.handleRequestPlaylist.bind(this, user));
    user.waitFlag(Flags.U_HAS_CHANNEL_RANK, function () {
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

PlaylistModule.prototype.resumeAutolead = function () {
    this.channel.broadcastAll("setLeader", "");

    this.channel.logger.log("[playlist] Resuming autolead");
    if (this.current !== null) {
        // Ensure the video is unpaused before resuming autolead.
        // In the past, people have reported stuck playlists because
        // they assigned leader, paused, then removed leader.
        this.current.media.paused = false;
        this.sendMediaUpdate(this.channel.users);

        if (!this._leadInterval && this.current.media.seconds > 0) {
            this._lastUpdate = Date.now();
            this._leadInterval = setInterval(this._leadLoop.bind(this), 1000);
            this._leadLoop();
        }
    }
};

PlaylistModule.prototype.onUserPart = function (user) {
    if (this.leader === user) {
        this.leader = null;
        this.resumeAutolead();
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

const changeMediaCounter = new Counter({
    name: 'cytube_playlist_plays_total',
    help: 'Counter for number of playlist items played',
    labelNames: ['shortCode']
});
PlaylistModule.prototype.sendChangeMedia = function (users) {
    if (!this.current || !this.current.media || this._refreshing) {
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
        changeMediaCounter.labels(m.type).inc(1, new Date());
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

    var link = util.formatLink(id, type, null);
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
            link: link,
            id: id
        });
        return;
    } else if (util.isLive(type) && !perms.canAddLive(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add live media",
            link: link,
            id: id
        });
        return;
    } else if (type === "cu" && !perms.canAddCustom(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add custom embeds",
            link: link,
            id: id
        });
        return;
    } else if ((type === "fi" || type === "cm") && !perms.canAddRawFile(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add raw video files",
            link: link,
            id: id
        });
        return;
    }

    var temp = data.temp || !perms.canAddNonTemp(user);
    var queueby = user.getName();

    var duration = undefined;
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
            link: link,
            id: id
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
            link: data.link,
            id: data.id
        });
    };

    const self = this;
    this.channel.refCounter.ref("PlaylistModule::queueStandard");
    this.semaphore.queue(function (lock) {
        InfoGetter.getMedia(data.id, data.type, function (err, media) {
            if (err) {
                error(XSS.sanitizeText(String(err)));
                self.channel.refCounter.unref("PlaylistModule::queueStandard");
                return lock.release();
            }

            self._addItem(media, data, user, function () {
                lock.release();
                self.channel.refCounter.unref("PlaylistModule::queueStandard");
            });
        });
    });
};

PlaylistModule.prototype.queueYouTubePlaylist = function (user, data) {
    var error = function (what) {
        user.socket.emit("queueFail", {
            msg: what,
            link: data.link,
            id: data.id
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

            self.channel.refCounter.ref("PlaylistModule::queueYouTubePlaylist");

            if (self.channel.modules.library && data.shouldAddToLibrary) {
                self.channel.modules.library.cacheMediaList(vids);
                data.shouldAddToLibrary = false;
            }

            vids.forEach(function (media) {
                data.link = util.formatLink(media.id, media.type);
                self._addItem(media, data, user);
            });

            self.channel.refCounter.unref("PlaylistModule::queueYouTubePlaylist");

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
    self.channel.refCounter.ref("PlaylistModule::handleDelete");
    this.semaphore.queue(function (lock) {
        if (self._delete(data)) {
            self.channel.logger.log("[playlist] " + user.getName() + " deleted " +
                                    plitem.media.title);
        }

        lock.release();
        self.channel.refCounter.unref("PlaylistModule::handleDelete");
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
    this._listDirty = true;

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

    const self = this;
    self.channel.refCounter.ref("PlaylistModule::handleMoveMedia");
    self.semaphore.queue(function (lock) {
        if (!self.items.remove(data.from)) {
            self.channel.refCounter.unref("PlaylistModule::handleMoveMedia");
            return lock.release();
        }

        if (data.after === "prepend") {
            if (!self.items.prepend(from)) {
                self.channel.refCounter.unref("PlaylistModule::handleMoveMedia");
                return lock.release();
            }
        } else if (data.after === "append") {
            if (!self.items.append(from)) {
                self.channel.refCounter.unref("PlaylistModule::handleMoveMedia");
                return lock.release();
            }
        } else {
            if (!self.items.insertAfter(from, data.after)) {
                self.channel.refCounter.unref("PlaylistModule::handleMoveMedia");
                return lock.release();
            }
        }

        self.channel.broadcastAll("moveVideo", data);

        self.channel.logger.log("[playlist] " + user.getName() + " moved " +
                                from.media.title +
                                (after ? " after " + after.media.title : ""));
        self._listDirty = true;
        lock.release();
        self.channel.refCounter.unref("PlaylistModule::handleMoveMedia");
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

        if (old && old.temp && old !== to) {
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

    this.channel.logger.log("[playlist] " + user.getName() + " skipped " + title);
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
    this._listDirty = true;
    this._positionDirty = true;
};

PlaylistModule.prototype.handleShuffle = function (user) {
    if (!this.channel.modules.permissions.canShufflePlaylist(user)) {
        return;
    }

    this.channel.logger.log("[playlist] " + user.getName() + " shuffled the playlist");

    var pl = this.items.toArray(false);
    let currentUid = this.current ? this.current.uid : null;
    let currentTime = this.current ? this.current.media.currentTime : undefined;
    this.items.clear();
    this.semaphore.reset();
    while (pl.length > 0) {
        var i = Math.floor(Math.random() * pl.length);
        var item = new PlaylistItem(pl[i].media, {
            uid: this._nextuid++,
            temp: pl[i].temp,
            queueby: pl[i].queueby
        });

        if (pl[i].uid === currentUid) {
            this.items.prepend(item);
        } else {
            this.items.append(item);
        }

        pl.splice(i, 1);
    }
    this._listDirty = true;
    this._positionDirty = true;

    this.current = this.items.first;
    pl = this.items.toArray(true);
    var perms = this.channel.modules.permissions;
    this.channel.users.forEach(function (u) {
        if (perms.canSeePlaylist(u)) {
            u.socket.emit("playlist", pl);
        }
    });
    this.startPlayback(currentTime);
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
            old.emit("effectiveRankChange", old.account.effectiveRank, 1.5);
            old.socket.emit("rank", old.account.effectiveRank);
        }

        this.channel.broadcastAll("setUserRank", {
            name: old.getName(),
            rank: old.account.effectiveRank
        });
        this.channel.logger.log("[mod] " + user.getName() + " removed leader from " + old.getName());
    }

    if (!name) {
        this.resumeAutolead();
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
                this.leader.emit("effectiveRankChange", 1.5, this.leader.account.oldRank);
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
    if (util.isLive(media.type)) {
        return;
    }

    if (media.id !== data.id || isNaN(data.currentTime)) {
        return;
    }

    media.currentTime = data.currentTime;
    media.paused = Boolean(data.paused);
    var update = media.getTimeUpdate();
    this._positionDirty = true;

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

    self._listDirty = true;

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
            link: data.link,
            id: data.id
        });
        if (cb) {
            cb();
        }
    };

    if (data.duration) {
        media.seconds = data.duration;
        media.duration = util.formatTime(media.seconds);
    } else if (media.seconds === 0 && !this.channel.modules.permissions.canAddLive(user)) {
        // Issue #766
        qfail("You don't have permission to add livestreams");
        return;
    }

    if (isNaN(media.seconds)) {
        LOGGER.warn("Detected NaN duration for %j", media);
        return qfail("Internal error: could not determine media duration");
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

    if (this.channel.modules.options &&
        this.channel.modules.options.get("playlist_max_duration_per_user") > 0) {

        const limit = this.channel.modules.options.get("playlist_max_duration_per_user");
        const totalDuration = usersItems.map(item => item.media.seconds).reduce((a, b) => a + b, 0) + media.seconds;
        if (isNaN(totalDuration)) {
            LOGGER.error("playlist_max_duration_per_user check calculated NaN: " + require('util').inspect(usersItems));
        } else if (totalDuration >= limit && !this.channel.modules.permissions.canExceedMaxDurationPerUser(user)) {
            return qfail("Channel limit exceeded: maximum total playlist time per user");
        }
    }

    if (media.meta.ytRating === "ytAgeRestricted") {
        return qfail("Cannot add age restricted videos. See: https://github.com/calzoneman/sync/wiki/Frequently-Asked-Questions#why-dont-age-restricted-youtube-videos-work");
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

        self._listDirty = true;

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

PlaylistModule.prototype.startPlayback = function (time) {
    var self = this;

    if (!self.current || !self.current.media) {
        return false;
    }

    var media = self.current.media;
    media.reset();
    self._positionDirty = true;

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
};

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

    this._positionDirty = true;

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

/*
 * TODO: investigate how many people are relying on regex
 * capabilities for /clean.  Might be user friendlier to
 * replace it with a glob matcher (or at least remove the
 * -flags)
 */
function generateTargetRegex(target) {
    const flagsre = /^(-[img]+\s+)/i;
    var m = target.match(flagsre);
    var flags = "";
    if (m) {
        flags = m[0].slice(1,-1);
        target = target.replace(flagsre, "");
    }
    return new RegExp(target, flags);
}

PlaylistModule.prototype.handleClean = function (user, msg, _meta) {
    if (!this.channel.modules.permissions.canDeleteVideo(user)) {
        return;
    }

    var args = msg.split(" ");
    var cmd = args.shift();
    if (args.length === 0) {
        return user.socket.emit("errorMsg", {
            msg: "No target given for " + cmd + ".  Usage: /clean <username> or " +
                "/cleantitle <title>"
        });
    }
    var target;
    try {
        target = generateTargetRegex(args.join(" "));
    } catch (error) {
        user.socket.emit("errorMsg", {
            msg: `Invalid target: ${args.join(" ")}`
        });
        return;
    }

    this.channel.logger.log("[playlist] " + user.getName() + " used " + cmd +
            " with target regex: " + target);

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

    const self = this;
    self.channel.refCounter.ref("PlaylistModule::handleQueuePlaylist");
    db.getUserPlaylist(user.getName(), data.name, function (err, pl) {
        if (err) {
            self.channel.refCounter.unref("PlaylistModule::handleQueuePlaylist");
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
        } catch (e) {
            LOGGER.error("Loading user playlist failed!");
            LOGGER.error("PL: " + user.getName() + "-" + data.name);
            LOGGER.error(e.stack);
            user.socket.emit("queueFail", {
                msg: "Internal error occurred when loading playlist.",
                link: null
            });
        } finally {
            self.channel.refCounter.unref("PlaylistModule::handleQueuePlaylist");
        }
    });
};

PlaylistModule.prototype.handleRequestPlaylist = function (user) {
    if (user.reqPlaylistLimiter.throttle(REQ_PLAYLIST_THROTTLE)) {
        user.socket.emit("errorMsg", {
            msg: "Get Playlist URLs is limited to 1 usage every 60 seconds.  " +
                    "Please try again later.",
            code: "REQ_PLAYLIST_LIMIT_REACHED"
        });
    } else {
        this.sendPlaylist([user]);
    }
};

module.exports = PlaylistModule;
