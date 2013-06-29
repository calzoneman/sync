function PlaylistItem(media, uid) {
    this.media = media;
    this.uid = uid;
    this.temp = false;
    this.queueby = "";
    this.prev = null;
    this.next = null;
}

PlaylistItem.prototype.pack = function() {
    return {
        media: this.media,
        uid: this.uid,
        temp: this.temp,
        queueby: this.queueby
    };
}

function Playlist(items) {
    this.next_uid = 0;
    this.first = null;
    this.last = null;
    this.current = null;
    this.length = 0;

    if(items !== undefined) {
        items.forEach(function(it) {
            this.append(it);
        });
    }
}

Playlist.prototype.makeItem = function(media) {
    return new PlaylistItem(media, this.next_uid++);
}

Playlist.prototype.find = function(uid) {
    if(this.first === null)
        return false;
    var item = this.first;
    var iter = this.first;
    while(iter != null && item.uid != uid) {
        item = iter;
        iter = iter.next;
    }

    if(item && item.uid == uid)
        return item;
    else
        return false;
}

Playlist.prototype.prepend = function(plitem) {
    if(this.first !== null) {
        plitem.next = this.first;
        this.first.prev = plitem;
    }
    // prepending to empty list
    else {
        this.current = plitem;
        this.last = plitem;
    }
    this.first = plitem;
    this.first.prev = null;
    this.length++;
    return true;
}

Playlist.prototype.append = function(plitem) {
    if(this.last != null) {
        plitem.prev = this.last;
        this.last.next = plitem;
    }
    // appending to empty list
    else {
        this.first = plitem;
        this.current = plitem;
    }
    this.last = plitem;
    this.last.next = null;
    this.length++;
    return true;
}

Playlist.prototype.insertAfter = function(plitem, uid) {
    var item = this.find(uid);

    if(item) {
        plitem.next = item.next;
        plitem.prev = item;
        item.next = plitem;
        if(item == this.last) {
            this.last = plitem;
        }
        this.length++;
        return true;
    }

    return false;
}

Playlist.prototype.remove = function(uid, next) {
    var item = this.find(uid);
    if(!item)
        return false;

    if(item == this.first)
        this.first = item.next;
    if(item == this.last)
        this.last = item.prev;

    if(item.prev)
        item.prev.next = item.next;
    if(item.next)
        item.next.prev = item.prev;

    if(this.current == item && next)
        this._next();

    this.length--;
    return true;
}

Playlist.prototype.next = function() {
    if(!this.current)
        return;

    var it = this.current;
    this._next();

    if(it.temp) {
        this.remove(it.uid, true);
    }

    return this.current;
}

Playlist.prototype._next = function() {
    if(!this.current)
        return;
    this.current = this.current.next;
    if(this.current === null && this.first !== null)
        this.current = this.first;

    if(this.current) {
        this.current.media.paused = false;
        this.current.media.currentTime = -1;
    }
}

Playlist.prototype.jump = function(uid) {
    if(!this.current)
        return false;

    var jmp = this.find(uid);
    if(!jmp)
        return false;

    var it = this.current;

    this.current = jmp;

    if(this.current) {
        this.current.media.paused = false;
        this.current.media.currentTime = -1;
    }

    if(it.temp) {
        this.remove(it.uid);
    }

    return this.current;
}

Playlist.prototype.toArray = function() {
    var arr = [];
    var item = this.first;
    while(item != null) {
        arr.push(item.pack());
        item = item.next;
    }
    return arr;
}

Playlist.prototype.clear = function() {
    this.first = null;
    this.last = null;
    this.current = null;
    this.length = 0;
    this.next_uid = 0;
}

module.exports = Playlist;
