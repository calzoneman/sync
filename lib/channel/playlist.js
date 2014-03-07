function PlaylistItem(media, uid) {
    this.media = media;
    this.prev = null;
    this.next = null;
    this.uid = uid;
}

PlaylistItem.prototype = {
    getTime: function () {
        return this.media ? this.media.currentTime : 0;
    },

    getID: function () {
        return this.media ? this.media.id : null;
    },

    getType: function () {
        return this.media ? this.media.type : null;
    },
};


function Playlist() {
    this.first = null;
    this.last = null;
    this.length = 0;
    this._uid = 0;
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

    _remove: function (uid) {
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

    clear: function () {
        this.first = null;
        this.last = null;
        this.length = 0;
    },

    shuffle: function () {
        var arr = this.asArray();
        this.clear();
        while (arr.length > 0) {
            var i = Math.floor(Math.random() * arr.length);
            this._append(arr[i]);
            arr.splice(i, 1);
        }
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
};
