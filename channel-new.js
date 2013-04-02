
/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

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
        pagetitle: this.name,
        customcss: ""
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
                this.queue.push(new Media(e.id, e.title, e.seconds, e.type));
            }
            this.sendAll("playlist", {
                pl: this.queue
            });
            this.position = data.position - 1;
            if(this.position < -1)
                this.position = -1;
            if(this.queue.length > 0)
                this.playNext();
            this.opts = data.opts;
            if(data.filters) {
                this.filters = new Array(data.filters.length);
                for(var i = 0; i < data.filters.length; i++) {
                    this.filters[i] = [new RegExp(data.filters[i][0]),
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

Channel.prototype.getRank = function(user) {
    if(!this.registered) {
        return Rank.Guest;
    }
    return Database.lookupChannelRank(this.name, user.name);
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
