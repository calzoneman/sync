/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

ULList = require("./ullist").ULList;
var AsyncQueue = require("./asyncqueue");
var Media = require("./media").Media;
var AllPlaylists = {};

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
        media: this.media.pack(),
        uid: this.uid,
        temp: this.temp,
        queueby: this.queueby
    };
}

function Playlist(chan) {
    var name = chan.canonical_name;
    if(name in AllPlaylists && AllPlaylists[name]) {
        var pl = AllPlaylists[name];
        if(!pl.dead)
            pl.die();
    }
    this.items = new ULList();
    this.current = null;
    this.next_uid = 0;
    this._leadInterval = false;
    this._lastUpdate = 0;
    this._counter = 0;
    this.leading = true;
    this.callbacks = {
        "changeMedia": [],
        "mediaUpdate": [],
        "remove": [],
    };
    this.fnqueue = new AsyncQueue();
    AllPlaylists[name] = this;

    this.channel = chan;
    this.server = chan.server;
    var pl = this;
    this.on("mediaUpdate", function(m) {
        if (chan.dead) {
            pl.die();
            return;
        }
        chan.sendAll("mediaUpdate", m.timeupdate());
    });
    this.on("changeMedia", function(m) {
        if (chan.dead) {
            pl.die();
            return;
        }
        chan.onVideoChange();
        chan.sendAll("setCurrent", pl.current.uid);
        chan.sendAll("changeMedia", m.fullupdate());
    });
    this.on("remove", function(item) {
        if (chan.dead) {
            pl.die();
            return;
        }
        chan.broadcastPlaylistMeta();
        chan.sendAll("delete", {
            uid: item.uid
        });
    });
}

Playlist.prototype.dump = function() {
    var arr = this.items.toArray();
    var pos = 0;
    for(var i in arr) {
        if(this.current && arr[i].uid == this.current.uid) {
            pos = i;
            break;
        }
    }

    var time = 0;
    if(this.current)
        time = this.current.media.currentTime;

    return {
        pl: arr,
        pos: pos,
        time: time
    };
}

Playlist.prototype.die = function () {
    this.clear();
    if(this._leadInterval) {
        clearInterval(this._leadInterval);
        this._leadInterval = false;
    }
    if(this._qaInterval) {
        clearInterval(this._qaInterval);
        this._qaInterval = false;
    }
    //for(var key in this)
    //    delete this[key];
    this.dead = true;
}

Playlist.prototype.load = function(data, callback) {
    this.clear();
    for(var i in data.pl) {
        var e = data.pl[i].media;
        var m = new Media(e.id, e.title, e.seconds, e.type);
        var it = this.makeItem(m);
        it.temp = data.pl[i].temp;
        it.queueby = data.pl[i].queueby;
        this.items.append(it);
        if(i == parseInt(data.pos)) {
            this.current = it;
        }
    }

    if(callback)
        callback();
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

Playlist.prototype.add = function(item, pos) {
    var self = this;
    if(this.items.length >= 4000) {
        return "Playlist limit reached (4,000)";
    }

    var it = this.items.findVideoId(item.media.id);
    if(it) {
        if(pos === "append" || it == this.current) {
            return "This item is already on the playlist";
        }

        self.remove(it.uid);
        self.channel.sendAll("delete", {
            uid: it.uid
        });
        self.channel.broadcastPlaylistMeta();
    }

    if(pos == "append") {
        if(!this.items.append(item)) {
            return "Playlist failure";
        }
    } else if(pos == "prepend") {
        if(!this.items.prepend(item)) {
            return "Playlist failure";
        }
    } else {
        if(!this.items.insertAfter(item, pos)) {
            return "Playlist failure";
        }
    }

    if(this.items.length == 1) {
        this.current = item;
        this.startPlayback();
    }

    return false;
}

Playlist.prototype.addMedia = function (data) {
    var pos = data.pos;
    if (pos === "next") {
        if (this.current !== null)
            pos = this.current.uid;
        else
            pos = "append";
    }

    var m = new Media(data.id, data.title, data.seconds, data.type);
    var item = this.makeItem(m);
    item.queueby = data.queueby;
    item.temp = data.temp;
    return {
        item: item,
        error: this.add(item, pos)
    };
};

Playlist.prototype.remove = function (uid) {
    var self = this;
    var item = self.items.find(uid);
    if (item && self.items.remove(uid)) {
        if (item === self.current) {
            self._next();
        }
        return true;
    } else {
        return false;
    }
}

Playlist.prototype.move = function (from, after) {
    var it = this.items.find(from);
    if (!this.items.remove(from))
        return false;

    if (after === "prepend") {
        if (!this.items.prepend(it))
            return false;
    } else if (after === "append") {
        if (!this.items.append(it))
            return false;
    } else if (!this.items.insertAfter(it, after)) {
        return false;
    }

    return true;
}

Playlist.prototype.next = function() {
    if(!this.current)
        return;

    var it = this.current;

    if (it.temp) {
        if (this.remove(it.uid)) {
            this.on("remove")(it);
        }
    } else {
        this._next();
    }

    return this.current;
}

Playlist.prototype._next = function() {
    if(!this.current)
        return;
    this.current = this.current.next;
    if(this.current === null && this.items.first !== null)
        this.current = this.items.first;

    if(this.current) {
        this.startPlayback();
    }
}

Playlist.prototype.jump = function(uid) {
    if(!this.current)
        return false;

    var jmp = this.items.find(uid);
    if(!jmp)
        return false;

    var it = this.current;

    this.current = jmp;

    if(this.current) {
        this.startPlayback();
    }

    if(it.temp) {
        if (this.remove(it.uid)) {
            this.on("remove")(it);
        }
    }

    return this.current;
}

Playlist.prototype.clear = function() {
    this.items.clear();
    this.next_uid = 0;
    this.current = null;
    clearInterval(this._leadInterval);
}

Playlist.prototype.count = function (id) {
    var count = 0;
    this.items.forEach(function (i) {
        if(i.media.id === id)
            count++;
    });
    return count;
}

Playlist.prototype.lead = function(lead) {
    this.leading = lead;
    var pl = this;
    if(!this.leading && this._leadInterval) {
        clearInterval(this._leadInterval);
        this._leadInterval = false;
    }
    else if(this.leading && !this._leadInterval) {
        this._lastUpdate = Date.now();
        this._leadInterval = setInterval(function() {
            pl._leadLoop();
        }, 1000);
    }
}

Playlist.prototype.startPlayback = function (time) {
    if(!this.current || !this.current.media)
        return false;
    if (!this.leading) {
        this.current.media.paused = false;
        this.current.media.currentTime = time || 0;
        this.on("changeMedia")(this.current.media);
        return;
    }

    time = time || -3;
    this.current.media.paused = time < 0;
    this.current.media.currentTime = time;

    var pl = this;
    if(this._leadInterval) {
        clearInterval(this._leadInterval);
        this._leadInterval = false;
    }
    this.on("changeMedia")(this.current.media);
    if(!isLive(this.current.media.type)) {
        this._lastUpdate = Date.now();
        this._leadInterval = setInterval(function() {
            pl._leadLoop();
        }, 1000);
    }
}

function isLive(type) {
    return type == "li" // Livestream.com
        || type == "tw" // Twitch.tv
        || type == "jt" // Justin.tv
        || type == "rt" // RTMP
        || type == "jw" // JWPlayer
        || type == "us" // Ustream.tv
        || type == "im" // Imgur album
        || type == "cu";// Custom embed
}

const UPDATE_INTERVAL = 5;

Playlist.prototype._leadLoop = function() {
    if(this.current == null)
        return;

    if(this.channel.name == "") {
        this.die();
        return;
    }

    var dt = (Date.now() - this._lastUpdate) / 1000.0;
    var t = this.current.media.currentTime;

    // Transition from lead-in
    if (t < 0 && (t + dt) >= 0) {
        this.current.media.currentTime = 0;
        this.current.media.paused = false;
        this._counter = 0;
        this._lastUpdate = Date.now();
        this.on("mediaUpdate")(this.current.media);
        return;
    }

    this.current.media.currentTime += dt;
    this._lastUpdate = Date.now();
    this._counter++;

    if(this.current.media.currentTime >= this.current.media.seconds + 2) {
        this.next();
    }
    else if(this._counter % UPDATE_INTERVAL == 0) {
        this.on("mediaUpdate")(this.current.media);
    }
}

/*
    Delete items from the playlist for which filter(item) returns
    a truthy value

    based on code contributed by http://github.com/unbibium
*/
Playlist.prototype.clean = function (filter) {
    var self = this;
    var matches = self.items.findAll(filter);
    var count = 0;
    var deleteNext = function () {
        if (count < matches.length) {
            var uid = matches[count].uid;
            count++;
            if (self.remove(uid)) {
                self.channel.sendAll("delete", {
                    uid: uid
                });
            }
            deleteNext();
        } else {
            // refresh meta only once, at the end
            self.channel.broadcastPlaylistMeta();
        }
    };
    // start initial callback
    deleteNext();
};

module.exports = Playlist;
