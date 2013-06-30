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

function Playlist(chan) {
    this.next_uid = 0;
    this.first = null;
    this.last = null;
    this.current = null;
    this.length = 0;
    this._leadInterval = false;
    this._lastUpdate = 0;
    this._counter = 0;
    this.leading = true;
    this.callbacks = {
        "changeMedia": [],
        "mediaUpdate": [],
        "remove": [],
    };

    if(chan) {
        var pl = this;
        this.on("mediaUpdate", function(m) {
            chan.sendAll("mediaUpdate", m.timeupdate());
        });
        this.on("changeMedia", function(m) {
            chan.sendAll("setCurrent", pl.current.uid);
            chan.sendAll("changeMedia", m.fullupdate());
        });
        this.on("remove", function(item) {
            chan.sendAll("delete", {
                uid: item.uid
            });
        });
    }
}

Playlist.prototype.on = function(ev, fn) {
    if(typeof fn === "undefined") {
        var pl = this;
        return function() {
            for(var i = 0; i < pl.callbacks[ev].length; i++) {
                pl.callbacks[ev][i].apply(this, arguments);
            }
        }
    }
    else if(typeof fn === "function") {
        this.callbacks[ev].push(fn);
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
        this.startPlayback();
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
        this.startPlayback();
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

    this.on("remove")(item);

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
        this.startPlayback();
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
        this.startPlayback();
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
    clearInterval(this._leadInterval);
}

Playlist.prototype.lead = function(lead) {
    this.leading = lead;
    var pl = this;
    if(!this.leading && this._leadInterval) {
        clearInterval(this._leadInterval);
        this._leadInterval = false;
    }
    else if(this.leading && !this._leadInterval) {
        this._leadInterval = setInterval(function() {
            pl._leadLoop();
        }, 1000);
    }
}

Playlist.prototype.startPlayback = function() {
    this.current.media.paused = true;
    this.current.media.currentTime = -2;
    var pl = this;
    setTimeout(function() {
        if(!pl.current)
            return;
        pl.current.media.paused = false;
        pl.on("mediaUpdate")(pl.current.media);
    }, 2000);
    if(this.leading && !this._leadInterval && !isLive(this.current.media.type)) {
        this._leadInterval = setInterval(function() {
            pl._leadLoop();
        }, 1000);
    }
    else if(!this.leading && this._leadInterval) {
        clearInterval(this._leadInterval);
        this._leadInterval = false;
    }
    this.on("changeMedia")(this.current.media);
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

const UPDATE_INTERVAL = 5;

Playlist.prototype._leadLoop = function() {
    if(this.current == null)
        return;

    this.current.media.currentTime += (Date.now() - this._lastUpdate) / 1000.0;
    this._lastUpdate = Date.now();
    this._counter++;
    console.log("lead", this._counter);

    if(this.current.media.currentTime >= this.current.media.seconds + 2) {
        this.next();
    }
    else if(this._counter % UPDATE_INTERVAL == 0) {
        this.on("mediaUpdate")(this.current.media);
    }
}

module.exports = Playlist;
