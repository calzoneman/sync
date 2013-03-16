/**
 * Copyright 2013 Calvin 'calzoneman' Montgomery
 *
 * Licensed under Creative Commons Attribution-NonCommercial 3.0
 * See http://creativecommons.org/licenses/by-nc/3.0/
 *
 */

var Rank = require('./rank.js');
var Auth = require('./auth.js');
var Channel = require('./channel.js').Channel;
var Server = require('./server.js');
var Database = require('./database.js');

// Represents a client connected via socket.io
var User = function(socket, ip) {
    this.ip = ip;
    this.socket = socket;
    this.loggedIn = false;
    this.rank = Rank.Guest;
    this.channel = null;
    this.playerReady = false;
    this.name = "";

    this.initCallbacks();
};

// Set up socket callbacks
User.prototype.initCallbacks = function() {
    // What a shame
    this.socket.on('disconnect', function() {
        if(this.channel != null)
            this.channel.userLeave(this);
    }.bind(this));

    this.socket.on('joinChannel', function(data) {
        // Channel already loaded
        if(data.name in Server.channels) {
            this.channel = Server.channels[data.name];
            this.channel.userJoin(this);
        }
        // Channel not loaded
        else {
            Server.channels[data.name] = new Channel(data.name);
            this.channel = Server.channels[data.name];
            this.channel.userJoin(this);
        }
    }.bind(this));

    this.socket.on('login', function(data) {
        if(this.name == "")
            this.login(data.name, data.sha256);
    }.bind(this));

    this.socket.on('register', function(data) {
        this.register(data.name, data.sha256);
    }.bind(this));

    this.socket.on('assignLeader', function(data) {
        if(Rank.hasPermission(this, "assignLeader")) {
            if(this.channel != null)
                this.channel.changeLeader(data.name);
        }
    }.bind(this));

    this.socket.on('promote', function(data) {
        if(Rank.hasPermission(this, "promote")) {
            if(this.channel != null) {
                this.channel.promoteUser(this, data.name);
            }
        }
    }.bind(this));

    this.socket.on('demote', function(data) {
        if(Rank.hasPermission(this, "promote")) {
            if(this.channel != null) {
                this.channel.demoteUser(this, data.name);
            }
        }
    }.bind(this));

    this.socket.on('chatMsg', function(data) {
        if(this.name != "" && this.channel != null) {
            this.channel.chatMessage(this, data.msg);
        }
    }.bind(this));

    this.socket.on('playerReady', function() {
        if(this.channel != null) {
            this.channel.sendMediaUpdate(this);
        }
        this.playerReady = true;
    }.bind(this));

    this.socket.on('queue', function(data) {
        if(Rank.hasPermission(this, "queue") ||
            (this.channel != null && !this.channel.qlocked)) {
            if(this.channel != null)
                this.channel.enqueue(data);
        }
    }.bind(this));

    this.socket.on('unqueue', function(data) {
        if(Rank.hasPermission(this, "queue") ||
            (this.channel != null && !this.channel.qlocked)) {
            if(this.channel != null)
                this.channel.unqueue(data);
        }
    }.bind(this));

    this.socket.on('moveMedia', function(data) {
        if(Rank.hasPermission(this, "queue") ||
            (this.channel != null && !this.channel.qlocked)) {
            if(this.channel != null)
                this.channel.moveMedia(data);
        }
    }.bind(this));

    this.socket.on('playNext', function() {
        if(Rank.hasPermission(this, "queue") ||
            (this.channel != null && (
                this.channel.leader == this || !this.channel.qlocked))) {
            if(this.channel.currentPosition + 1 >= this.channel.queue.length) {
                this.channel.currentPosition = -1;
            }
            this.channel.playNext();
        }
    }.bind(this));

    this.socket.on('queueLock', function(data) {
        if(Rank.hasPermission(this, "qlock")) {
            if(this.channel != null) {
                this.channel.setLock(data.locked);
            }
        }
    }.bind(this));

    this.socket.on('mediaUpdate', function(data) {
        if(this.channel != null && this.channel.leader == this) {
            this.channel.update(data);
        }
    }.bind(this));

    this.socket.on('searchLibrary', function(data) {
        if(this.channel != null &&  Rank.hasPermission(this, "search")) {
            this.socket.emit('librarySearchResults', {
                results: this.channel.searchLibrary(data.query)
            });
        }
    }.bind(this));

    this.socket.on('closePoll', function() {
        if(Rank.hasPermission(this, "poll")) {
            if(this.channel != null && this.channel.poll) {
                this.channel.poll = null;
                this.channel.broadcastPollClose();
            }
        }
    }.bind(this));

    this.socket.on('vote', function(data) {
        if(this.channel != null && this.channel.poll) {
            this.channel.poll.vote(this.ip, data.option);
            this.channel.broadcastPollUpdate();
        }
    }.bind(this));

    this.socket.on('adm', function(data) {
        if(Rank.hasPermission(this, "acp")) {
            this.handleAdm(data);
        }
    }.bind(this));
}

// Handle administration
User.prototype.handleAdm = function(data) {
    if(data.cmd == "listloadedchannels") {
        var chans = [];
        for(var chan in Server.channels) {
            var users = [];
            for(var i = 0; i < Server.channels[chan].users.length; i++) {
                users.push(Server.channels[chan].users[i].name);
            }
            chans.push({
                chan: chan,
                users: users
            });
        }
        this.socket.emit('adm', {
            cmd: "listloadedchannels",
            chans: chans
        });
    }
    else if(data.cmd == "listchannels") {
        this.socket.emit('adm', {
            cmd: "listchannels",
            chans: Database.listChannels()
        });
    }
    else if(data.cmd == "listusers") {
        var users = [];
        var dbusers = Database.listUsers();
        if(!dbusers)
            return;
        for(var i = 0; i < dbusers.length; i++) {
            users[i] = {
                name: dbusers[i].uname,
                rank: dbusers[i].global_rank
            };
        }
        this.socket.emit('adm', {
            cmd: "listusers",
            users: users
        });
    }
    else if(data.cmd == "listchannelranks") {
        if(data.chan == undefined)
            return;
        this.socket.emit('adm', {
            cmd: "listchannelranks",
            ranks: Database.listChannelRanks(data.chan)
        });
    }

};

// Attempt to login
User.prototype.login = function(name, sha256) {
    // No password => try guest login
    if(sha256 == "") {
        // Sorry bud, can't take that name
        if(Auth.isRegistered(name)) {
            this.socket.emit('login', {
                success: false,
                error: "That username is already taken"
            });
            return false;
        }
        // YOUR ARGUMENT IS INVALID
        else if(!Auth.validateName(name)) {
            this.socket.emit('login', {
                success: false,
                error: "Invalid username.  Usernames must be 1-20 characters long and consist only of alphanumeric characters and underscores"
            });
        }
        // Woah, success!
        else {
            console.log(this.ip + " signed in as " + name);
            this.name = name;
            this.loggedIn = false;
            this.socket.emit('login', {
                success: true
            });
            this.socket.emit('rank', {
                rank: this.rank
            });
            if(this.channel != null) {
                if(this.rank >= Rank.Moderator)
                    this.channel.sendPlaylist(this);
                this.channel.broadcastNewUser(this);
            }
        }
    }
    else {
        var row;
        if((row = Auth.login(name, sha256))) {
            this.socket.emit('login', {
                success: true
            });
            console.log(this.ip + " logged in as " + name);
            // Sweet, let's look up our rank
            var chanrank = (this.channel != null) ? this.channel.getRank(name)
                                                  : Rank.Guest;
            this.rank = (chanrank > row.global_rank) ? chanrank
                                                     : row.global_rank;
            this.socket.emit('rank', {
                rank: this.rank
            });
            this.name = name;
            if(this.channel != null) {
                if(this.rank >= Rank.Moderator)
                    this.channel.sendPlaylist(this);
                this.channel.broadcastNewUser(this);
            }
        }
        // Wrong password
        else {
            this.socket.emit('login', {
                success: false,
                error: "Invalid username/password pair"
            });
            return false;
        }
    }
}

// Attempt to register a user account
User.prototype.register = function(name, sha256) {
    if(sha256 == "") {
        // Sorry bud, password required
        this.socket.emit('register', {
            success: false,
            error: "You must provide a password"
        });
        return false;
    }
    else if(Auth.isRegistered(name)) {
        this.socket.emit('register', {
            success: false,
            error: "That username is already taken"
        });
        return false;
    }
    else if(!Auth.validateName(name)) {
        this.socket.emit('register', {
            success: false,
            error: "Invalid username.  Usernames must be 1-20 characters long and consist only of alphanumeric characters and underscores"
        });
    }
    else if(Auth.register(name, sha256)) {
        console.log(this.ip + " registered " + name);
        this.socket.emit('register', {
            success: true
        });
        this.login(name, sha256);
    }
    else {
        this.socket.emit('register', {
            success: false,
            error: "[](/ppshrug) Registration Failed."
        });
    }
}

exports.User = User;
