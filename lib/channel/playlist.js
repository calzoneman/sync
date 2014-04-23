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
    duration: "number,optional"
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
    data.pos = parseInt(data.pos);
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
        if (data.pos === i) {
            self.current = newitem;
        }
        i++;
    });

    self.meta.time = util.formatTime(self.meta.rawTime);
    self.startPlayback(playlist.time);
};

PlaylistModule.prototype.save = function (data) {
    var arr = this.items.toArray();
    console.log('save', arr);
    var pos = 0;
    for(var i in arr) {
        if(this.current && arr[i].uid == this.current.uid) {
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

PlaylistModule.prototype.onUserPostJoin = function (user) {
    this.sendPlaylist([user]);
    user.socket.typecheckedOn("queue", TYPE_QUEUE, this.handleQueue.bind(this, user));
    user.socket.on("delete", this.handleDelete.bind(this, user));
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
    users.forEach(function (u) {
        u.socket.emit("setCurrent", uid);
        u.socket.emit("changeMedia", update);
    });

    var m = this.current.media;
    this.channel.logger.log("[playlist] Now playing: " + m.title +
                            " (" + m.type + ":" + m.id + ")");
};

PlaylistModule.prototype.sendMediaUpdate = function (users) {
    if (!this.current || !this.current.media) {
        return;
    }

    var update = this.current.media.getTimeUpdate();
    users.forEach(function (u) {
        u.socket.emit("mediaUpdate", update);
    });
};

/**
 * == Handlers for playlist manipulation ==
 */

PlaylistModule.prototype.handleQueue = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (typeof data.id !== "string" && data.id !== false) {
        return;
    }
    var id = data.id;

    if (typeof data.type !== "string") {
        return;
    }
    var type = data.type;

    if (data.pos !== "next" && data.pos !== "end") {
        return;
    }

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

    if (data.type === "yp" && !perms.canAddList(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add playlists",
            link: link
        });
        return;
    }

    if (util.isLive(type) && !perms.canAddLive(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add live media",
            link: link
        });
        return;
    }

    if (type === "cu" && !perms.canAddCustom(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add custom embeds",
            link: link
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
            link: link
        });
        return;
    }

    // TODO maxlength
    data = {
        id: data.id,
        type: data.type,
        pos: data.pos,
        title: data.title,
        link: link,
        temp: temp,
        queueby: queueby,
        duration: duration
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
    var self = this;
    var qfail = function (msg) {
        user.socket.emit("queueFail", {
            msg: msg,
            link: data.link
        });
        return lock.release();
    };

    if (data.maxlength && media.seconds > data.maxlength) {
        return qfail("Maximum length exceeded: " + data.maxlength + " seconds");
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
            // TODO cache
        }

        if (self.items.length === 1) {
            self.current = item;
            self.startPlayback();
        }

        lock.release();
    };

    if (data.title && media.type === "cu") {
        media.title = data.title;
    }

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
        this.playNext();
    } else if(this._counter % UPDATE_INTERVAL == 0) {
        this.sendMediaUpdate(this.channel.users);
    }
};

PlaylistModule.prototype.playNext = function () {
    if (!this.current) {
        return;
    }

    var next = this.current.next;

    if (this.current.temp) {
        this._delete(this.current.uid);
    }

    if (next) {
        this.current = next;
        this.startPlayback();
    }
};

module.exports = PlaylistModule;
