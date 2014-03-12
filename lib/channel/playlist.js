function PlaylistItem(media, uid, opts) {
    if (!opts) {
        opts = {};
    }
    this.media = media;
    this.prev = null;
    this.next = null;
    this.uid = uid;
    this.temp = opts.temp || false;
    this.queueby = opts.queueby || "";
}

PlaylistItem.prototype = {
    getTime: function () {
        return this.media ? this.media.currentTime : 0;
    },

    getId: function () {
        return this.media ? this.media.id : null;
    },

    getType: function () {
        return this.media ? this.media.type : null;
    },
};


function Playlist(channel) {
    this.first = null;
    this.last = null;
    this.current = null;
    this.length = 0;
    this._uid = 0;
    this._leadInterval = false;
    this._lastUpdate = 0;
    this._counter = 0;
    this.serverLead = false;
    this.channel = channel;
}

Playlist.prototype = {
    find: function (uid) {
        if (this.first === null) {
            return null;
        }

        var item = this.first;
        var iter = this.first;
        while (iter !== null && item.uid !== uid) {
            item = iter;
            iter = iter.next;
        }

        if (item !== null && item.uid === uid) {
            return item;
        } else {
            return null;
        }
    },

    findVideoId: function (id) {
        var item = this.first;
        var iter = this.first;
        while (iter !== null && item.getId() !== id) {
            item = iter;
            iter = iter.next;
        }

        if (item !== null && item.getId() === id) {
            return item;
        } else {
            return null;
        }
    },

    serialize: function () {
        var arr = this.asArray();
        var pos = 0;
        while (this.current && arr[pos].uid !== this.current.uid) {
            pos++;
        }

        var time = 0;
        if (this.current) {
            time = this.current.getTime();
        }

        return {
            pl: arr,
            pos: pos,
            time: time
        };
    },

    load: function (data) {
        this.clear();
        var pos = 0;
        data.pos = parseInt(data.pos);
        data.pl.forEach(function (item) {
            var m = item.media;
            m = new Media(m.id, m.title, m.seconds, m.type, m.meta);
            var i = this._makeItem(m, item);
            this._append(i);
            if (pos === data.pos) {
                this.current = i;
            }
        }
    },

    die: function () {
        this.clear();
        if (this._leadInterval) {
            clearInterval(this._leadInterval);
            this._leadInterval = false;
        }
        this.dead = true;
    },

    _makeItem: function (media, opts) {
        var uid = this._uid++;
        return new PlaylistItem(media, uid, opts);
    },

    _prepend: function (item) {
        if (this.first !== null) {
            item.next = this.first;
            this.first.prev = item;
        } else {
            this.last = item;
        }

        this.first = item;
        this.first.prev = null;
        this.length++;
        return true;
    },

    _append: function (item) {
        if (this.last !== null) {
            item.prev = this.last;
            this.last.next = item;
        } else {
            this.first = item;
        }

        this.last = item;
        this.last.next = null;
        this.length++;
        return true;
    },

    _insertAfter: function (item, uid) {
        var after = this.find(uid);
        if (!after) {
            return false;
        }

        item.next = after.next;
        if (item.next !== null) {
            item.next.prev = item;
        }
        item.prev = after;
        after.next = item;

        if (after === this.last) {
            this.last = item;
        }

        this.length++;
        return true;
    },

    _insertBefore: function (item, uid) {
        var before = this.find(uid);

        if (!before) {
            return false;
        }

        item.next = before;
        item.prev = before.prev;
        if (item.prev) {
            item.prev.next = item;
        }
        before.prev = item;

        if (before === this.first) {
            this.first = item;
        }

        this.length++;
        return true;
    },

    remove: function (uid) {
        var item = this.find(uid);
        if (!item) {
            return false;
        }

        if (item === this.first) {
            this.first = item.next;
        }
        if (item === this.last) {
            this.last = item.prev;
        }

        if (item.prev !== null) {
            item.prev.next = item.next;
        }
        if (item.next !== null) {
            item.next.prev = item.prev;
        }

        this.length--;
        return true;
    },

    move: function (from, after) {
        var src = this.find(from);
        if (!src) {
            return false;
        } else if (!this.remove(from)) {
            return false;
        }

        if (after === "prepend") {
            return this._prepend(src);
        } else if (after === "append") {
            return this._append(src);
        } else {
            return this._insertAfter(src, after);
        }
    },

    clear: function () {
        this.first = null;
        this.last = null;
        this.length = 0;
        this.channel.sendPlaylist(this.channel.users);
    },

    shuffle: function () {
        var arr = this.asArray();
        this.clear();
        while (arr.length > 0) {
            var i = Math.floor(Math.random() * arr.length);
            this._append(arr[i]);
            arr.splice(i, 1);
        }
        this.channel.sendPlaylist(this.channel.users);
    },

    pack: function () {
        return this.asArray().map(function (item) { return item.pack(); });
    },

    asArray: function () {
        var arr = new Array(this.length);
        var item = this.first;
        var i = 0;
        while (item !== null) {
            arr[i++] = item;
            item = item.next;
        }
        return arr;
    },

    findAll: function (matcher) {
        return this.asArray().filter(matcher);
    },

    playNext: function () {
        if (this.current === null) {
            return;
        }

        var last = this.current;
        this.current = this.current.next;
        if (this.current === null) {
            this.current = this.first;
        }

        if (last.temp) {
            var self = this;
            setImmediate(function () {
                self.remove(last.uid);
            });
        }
    },

    jump: function (uid) {
        var to = this.find(uid);
        if (to === null) {
            return;
        }

        var last = this.current;
        this.current = to;
        if (last.temp) {
            var self = this;
            setImmediate(function () {
                self.remove(last.uid);
            });
        }
    },

    _add: function (item, pos, cb) {
        // TODO config limit
        if (this.items.length >= 4000) {
            return cb("Playlist limit reached (4,000)");
        }

        var existing = this.items.findVideoId(item.getId());
        if (existing) {
            if (pos === "append" || it === this.current) {
                return cb("This item is already on the playlist");
            }

            this.remove(it);
            this.channel.sendAll("delete", { uid: it.uid });
            this.channel.updatePlaylistMeta();
            this.channel.sendPlaylistMeta(this.channel.users);
        }

        if (pos === "append") {
            if (!this._append(item)) {
                return cb("Playlist failure");
            }
        } else if (pos === "prepend") {
            if (!this._prepend(item)) {
                return cb("Playlist failure");
            }
        } else {
            if (!this._insertAfter(item, pos)) {
                return cb("Playlist failure");
            }
        }

        if (this.length === 1) {
            this.current = item;
            this.startPlayback();
        }

        cb(null, item);
    },

    addMedia: function (data, cb) {
        var pos = data.pos;
        if (pos === "next") {
            if (this.current !== null) {
                pos = this.current.uid;
            } else {
                pos = "append";
            }
        }

        var m = new Media(data.id, data.title, data.seconds, data.type, data.meta);
        var item = this._makeItem(m, { queueby: data.queueby, temp: data.temp });

        this._add(item, cb);
    },

    startPlayback: function (starttime) {
        var self = this;

        if (!self.current || !self.current.media) {
            return false;
        }

        if (self.current.getType() === "vi" && !self.current.media.meta.direct &&
            Config.get("vimeo-workaround")) {
            vimeoWorkaround(self.current.getId(), function (direct) {
                if (self.dead || self.current === null) {
                    return;
                }

                self.current.media.meta.direct = direct;
                self.startPlayback(starttime);
            });
            return;
        }

        // TODO refresh google drive link?
        if (!self.leading) {
            self.current.media.paused = false;
            self.current.media.currentTime = startTime || false;
            // TODO changeMedia
        }
    },
};
