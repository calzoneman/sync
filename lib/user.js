/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Channel = require("./channel.js").Channel;
var Logger = require("./logger.js");
var $util = require("./utilities");
var ActionLog = require("./actionlog");
var Server = require("./server");
var ACP = require("./acp");
var InfoGetter = require("./get-info");

// Represents a client connected via socket.io
var User = function (socket) {
    this.ip = socket._ip;
    this.server = Server.getServer();
    this.socket = socket;
    this.loggedIn = false;
    this.loggingIn = false;
    this.saverank = false;
    this.rank = -1
    this.global_rank = -1;
    this.channel = null;
    this.name = "";
    this.meta = {
        afk: false,
        icon: false
    };
    this.muted = false;
    this.throttle = {};
    this.flooded = {};
    this.queueLimiter = $util.newRateLimiter();
    this.profile = {
        image: "",
        text: ""
    };
    this.awaytimer = false;
    this.autoAFK();

    this.initCallbacks();
    if (this.server.announcement !== null) {
        this.socket.emit("announcement", this.server.announcement);
    }
};

User.prototype.inChannel = function () {
    return this.channel !== null && !this.channel.dead;
};

// Throttling/cooldown
User.prototype.noflood = function (name, hz) {
    var time = new Date().getTime();
    if (!(name in this.throttle)) {
        this.throttle[name] = [time];
        return false;
    } else if (name in this.flooded && time < this.flooded[name]) {
        this.socket.emit("noflood", {
            action: name,
            msg: "You're still on cooldown!"
        });
        return true;
    } else {
        this.throttle[name].push(time);
        var diff = (time - this.throttle[name][0]) / 1000.0;
        // Twice might be an accident, more than that is probably spam
        if (this.throttle[name].length > 2) {
            var rate = this.throttle[name].length / diff;
            this.throttle[name] = [time];
            if (rate > hz) {
                this.flooded[name] = time + 5000;
                this.socket.emit("noflood", {
                    action: name,
                    msg: "Stop doing that so fast!  Cooldown: 5s"
                });
                return true;
            }
            return false;
        }
    }
};

User.prototype.setAFK = function (afk) {
    if (!this.inChannel())
        return;
    if (this.meta.afk === afk)
        return;
    var chan = this.channel;
    this.meta.afk = afk;
    if (afk) {
        if (chan.voteskip)
            chan.voteskip.unvote(this.ip);
    } else {
        this.autoAFK();
    }
    chan.checkVoteskipPass();
    chan.sendAll("setAFK", {
        name: this.name,
        afk: afk
    });
};

User.prototype.autoAFK = function () {
    var self = this;
    if (self.awaytimer)
        clearTimeout(self.awaytimer);

    if (!self.inChannel() || self.channel.opts.afk_timeout === 0)
        return;

    self.awaytimer = setTimeout(function () {
        self.setAFK(true);
    }, self.channel.opts.afk_timeout * 1000);
};

User.prototype.kick = function (reason) {
    this.socket.emit("kick", { reason: reason });
    this.socket.disconnect(true);
};

User.prototype.initCallbacks = function () {
    var self = this;
    self.socket.on("disconnect", function () {
        self.awaytimer && clearTimeout(self.awaytimer);
        if (self.inChannel())
            self.channel.userLeave(self);
    });

    self.socket.on("joinChannel", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel())
            return;
        if (typeof data.name != "string") {
            self.kick("Bad joinChannel packet");
            return;
        }
        if (!data.name.match(/^[\w-_]{1,30}$/)) {
            self.socket.emit("errorMsg", {
                msg: "Invalid channel name.  Channel names may consist of"+
                     " 1-30 characters in the set a-z, A-Z, 0-9, -, and _"
            });
            self.kick("Invalid channel name");
            return;
        }
        data.name = data.name.toLowerCase();
        self.channel = self.server.getChannel(data.name);
        if (self.loggedIn) {
            self.channel.getRank(self.name, function (err, rank) {
                if (!err && rank > self.rank)
                    self.rank = rank;
            });
        }
        self.channel.userJoin(self);
        self.autoAFK();
    });

    self.socket.on("login", function (data) {
        data = (typeof data !== "object") ? {} : data;
        var name = (typeof data.name === "string") ? data.name : "";
        var pw = (typeof data.pw === "string") ? data.pw : "";
        var session = (typeof data.session === "string") ? data.session : "";
        if (pw.length > 100)
            pw = pw.substring(0, 100);

        if (self.loggedIn)
            return;

        if (self.loggingIn) {
            var j = 0;
            // Wait until current login finishes
            var i = setInterval(function () {
                j++;
                if (!self.loggingIn) {
                    clearInterval(i);
                    if (!self.loggedIn)
                        self.login(name, pw, session);
                    return;
                }
                // Just in case to prevent the interval from going wild
                if (j >= 4)
                    clearInterval(i);
            }, 1000);
        } else {
            self.login(name, pw, session);
        }
    });

    self.socket.on("assignLeader", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryChangeLeader(self, data);
        }
    });

    self.socket.on("setChannelRank", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.trySetRank(self, data);
        }
    });

    self.socket.on("unban", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryUnban(self, data);
        }
    });

    self.socket.on("chatMsg", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            if (typeof data.msg !== "string") {
                self.socket.emit("kick", {
                    reason: "Invalid chatMsg packet"
                });
                self.socket.disconnect(true);
                return;
            }
            if (data.msg.indexOf("/afk") !== 0) {
                self.setAFK(false);
                self.autoAFK();
            }
            self.channel.tryChat(self, data);
        }
    });

    self.socket.on("newPoll", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryOpenPoll(self, data);
        }
    });

    self.socket.on("playerReady", function () {
        if (self.inChannel()) {
            self.channel.sendMediaUpdate(self);
        }
    });

    self.socket.on("requestPlaylist", function () {
        if (self.inChannel()) {
            self.channel.sendPlaylist(self);
        }
    });

    self.socket.on("queue", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryQueue(self, data);
        }
    });

    self.socket.on("setTemp", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.trySetTemp(self, data);
        }
    });

    self.socket.on("delete", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryDequeue(self, data);
        }
    });

    self.socket.on("uncache", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryUncache(self, data);
        }
    });

    self.socket.on("moveMedia", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryMove(self, data);
        }
    });

    self.socket.on("jumpTo", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryJumpTo(self, data);
        }
    });

    self.socket.on("playNext", function () {
        if (self.inChannel()) {
            self.channel.tryPlayNext(self);
        }
    });

    self.socket.on("clearPlaylist", function () {
        if (self.inChannel()) {
            self.channel.tryClearqueue(self);
        }
    });

    self.socket.on("shufflePlaylist", function () {
        if (self.inChannel()) {
            self.channel.tryShufflequeue(self);
        }
    });

    self.socket.on("togglePlaylistLock", function () {
        if (self.inChannel()) {
            self.channel.tryToggleLock(self);
        }
    });

    self.socket.on("mediaUpdate", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryUpdate(self, data);
        }
    });

    self.socket.on("searchMedia", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            if (typeof data.query !== "string") {
                self.kick("Bad searchMedia packet");
                return;
            }
            if (data.source === "yt") {
                var searchfn = InfoGetter.Getters.ytSearch;
                searchfn(data.query.split(" "), function (e, vids) {
                    if (!e) {
                        self.socket.emit("searchResults", {
                            source: "yt",
                            results: vids
                        });
                    }
                });
            } else {
                self.channel.search(data.query, function (vids) {
                    self.socket.emit("searchResults", {
                        source: "library",
                        results: vids
                    });
                });
            }
        }
    });

    self.socket.on("closePoll", function () {
        if (self.inChannel()) {
            self.channel.tryClosePoll(self);
        }
    });

    self.socket.on("vote", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryVote(self, data);
        }
    });

    self.socket.on("registerChannel", function (data) {
        if (!self.inChannel()) {
            self.socket.emit("channelRegistration", {
                success: false,
                error: "You're not in any channel!"
            });
        } else {
            self.channel.tryRegister(self);
        }
    });

    self.socket.on("unregisterChannel", function () {
        if (!self.inChannel()) {
            return;
        }
        if (self.rank < 10) {
            self.kick("Attempted unregisterChannel with insufficient permission");
            return;
        }
        self.channel.unregister(self);
    });

    self.socket.on("setOptions", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryUpdateOptions(self, data);
        }
    });

    self.socket.on("setPermissions", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryUpdatePermissions(self, data);
        }
    });

    self.socket.on("setChannelCSS", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.trySetCSS(self, data);
        }
    });

    self.socket.on("setChannelJS", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.trySetJS(self, data);
        }
    });

    self.socket.on("updateFilter", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryUpdateFilter(self, data);
        }
    });

    self.socket.on("removeFilter", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryRemoveFilter(self, data);
        }
    });

    self.socket.on("moveFilter", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryMoveFilter(self, data);
        }
    });

    self.socket.on("setMotd", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryUpdateMotd(self, data);
        }
    });

    self.socket.on("requestLoginHistory", function () {
        if (self.inChannel()) {
            self.channel.sendLoginHistory(self);
        }
    });

    self.socket.on("requestBanlist", function () {
        if (self.inChannel()) {
            self.channel.sendBanlist(self);
        }
    });

    self.socket.on("requestChatFilters", function () {
        if (self.inChannel()) {
            self.channel.sendChatFilters(self);
        }
    });

    self.socket.on("requestChannelRanks", function () {
        if (self.inChannel()) {
            if (self.noflood("requestChannelRanks", 0.25))
                return;
            self.channel.sendChannelRanks(self);
        }
    });

    self.socket.on("voteskip", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryVoteskip(self);
        }
    });

    self.socket.on("listPlaylists", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.name === "" || self.rank < 1) {
            self.socket.emit("listPlaylists", {
                pllist: [],
                error: "You must be logged in to manage playlists"
            });
            return;
        }

        self.server.db.listUserPlaylists(self.name, function (err, list) {
            if (err)
                list = [];
            for(var i = 0; i < list.length; i++) {
                list[i].time = $util.formatTime(list[i].time);
            }
            self.socket.emit("listPlaylists", {
                pllist: list
            });
        });
    });

    self.socket.on("savePlaylist", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (typeof data.name !== "string") {
            self.kick("Bad savePlaylist packet");
            return;
        }
        if (self.rank < 1) {
            self.socket.emit("savePlaylist", {
                success: false,
                error: "You must be logged in to manage playlists"
            });
            return;
        }

        if (!self.inChannel()) {
            self.socket.emit("savePlaylist", {
                success: false,
                error: "Not in a channel"
            });
            return;
        }

        if (typeof data.name != "string") {
            return;
        }

        var pl = self.channel.playlist.items.toArray();
         self.server.db.saveUserPlaylist(pl, self.name, data.name,
                                         function (err, res) {
            if (err) {
                self.socket.emit("savePlaylist", {
                    success: false,
                    error: err
                });
                return;
            }
            
            self.socket.emit("savePlaylist", {
                success: true
            });

            self.server.db.listUserPlaylists(self.name,
                                             function (err, list) {
                if (err)
                    list = [];
                for(var i = 0; i < list.length; i++) {
                    list[i].time = $util.formatTime(list[i].time);
                }
                self.socket.emit("listPlaylists", {
                    pllist: list
                });
            });
        });
    });

    self.socket.on("queuePlaylist", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (self.inChannel()) {
            self.channel.tryQueuePlaylist(self, data);
        }
    });

    self.socket.on("deletePlaylist", function (data) {
        data = (typeof data !== "object") ? {} : data;
        if (typeof data.name != "string") {
            self.kick("Bad deletePlaylist packet");
            return;
        }

        self.server.db.deleteUserPlaylist(self.name, data.name,
                                          function () {
            self.server.db.listUserPlaylists(self.name,
                                             function (err, list) {
                if (err)
                    list = [];
                for(var i = 0; i < list.length; i++) {
                    list[i].time = $util.formatTime(list[i].time);
                }
                self.socket.emit("listPlaylists", {
                    pllist: list
                });
            });
        });
    });

    self.socket.on("readChanLog", function () {
        if (self.inChannel()) {
            self.channel.tryReadLog(self);
        }
    });

    self.socket.on("acp-init", function () {
        if (self.global_rank >= 255)
            ACP.init(self);
    });

    self.socket.on("borrow-rank", function (rank) {
        if (self.global_rank < 255)
            return;
        if (rank > self.global_rank)
            return;

        self.rank = rank;
        self.socket.emit("rank", rank);
        if (self.inChannel())
            self.channel.broadcastUserUpdate(self);

    });
};

var lastguestlogin = {};
User.prototype.guestLogin = function (name) {
    var self = this;

    if (self.ip in lastguestlogin) {
        var diff = (Date.now() - lastguestlogin[self.ip])/1000;
        if (diff < self.server.cfg["guest-login-delay"]) {
            self.socket.emit("login", {
                success: false,
                error: "Guest logins are restricted to one per IP address "+
                       "per " + self.server.cfg["guest-login-delay"] +
                       " seconds."
            });
            return false;
        }
    }

    if (!$util.isValidUserName(name)) {
        self.socket.emit("login", {
            success: false,
            error: "Invalid username.  Usernames must be 1-20 characters "+
                   "long and consist only of characters a-z, A-Z, 0-9, -, "+
                   "and _"
        });
        return;
    }

    // Set the loggingIn flag to avoid race conditions with the callback
    self.loggingIn = true;
    self.server.db.isUsernameTaken(name, function (err, taken) {
        self.loggingIn = false;
        if (err) {
            self.socket.emit("login", {
                success: false,
                error: "Internal error: " + err
            });
            return;
        }

        if (taken) {
            self.socket.emit("login", {
                success: false,
                error: "That username is registered and protected."
            });
            return;
        }

        if (self.inChannel()) {
            var lname = name.toLowerCase();
            for(var i = 0; i < self.channel.users.length; i++) {
                if (self.channel.users[i].name.toLowerCase() === lname) {
                    self.socket.emit("login", {
                        success: false,
                        error: "That name is already in use on this channel"
                    });
                    return;
                }
            }
        }
        lastguestlogin[self.ip] = Date.now();
        self.rank = 0;
        Logger.syslog.log(self.ip + " signed in as " + name);
        self.server.db.recordVisit(self.ip, name);
        self.name = name;
        self.loggedIn = false;
        self.socket.emit("login", {
            success: true,
            name: name
        });
        self.socket.emit("rank", self.rank);
        if (self.inChannel()) {
            self.channel.logger.log(self.ip + " signed in as " + name);
            self.channel.broadcastNewUser(self);
        }
    });
};

// Attempt to login
User.prototype.login = function (name, pw, session) {
    var self = this;
    // No password => try guest login
    if (pw === "" && session === "") {
        this.guestLogin(name);
    } else {
        self.loggingIn = true;
        self.server.db.userLogin(name, pw, session, function (err, row) {
            if (err) {
                self.loggingIn = false;
                ActionLog.record(self.ip, name, "login-failure",
                                             err);
                self.socket.emit("login", {
                    success: false,
                    error: err
                });
                return;
            }
            if (self.inChannel()) {
                var n = name.toLowerCase();
                for(var i = 0; i < self.channel.users.length; i++) {
                    if (self.channel.users[i].name.toLowerCase() === n) {
                        if (self.channel.users[i] === self) {
                            Logger.errlog.log("Wat: user.login() but user "+
                                              "already logged in on channel");
                            break;
                        }
                        self.channel.kick(self.channel.users[i], 
                                          "Duplicate login");
                    }
                }
            }
            // Record logins for administrator accounts
            if (self.global_rank >= 255)
                ActionLog.record(self.ip, name, "login-success");
            self.loggedIn = true;
            self.loggingIn = false;
            self.socket.emit("login", {
                success: true,
                session: row.session_hash,
                name: name
            });
            Logger.syslog.log(self.ip + " logged in as " + name);
            self.server.db.recordVisit(self.ip, name);
            self.profile = {
                image: row.profile_image,
                text: row.profile_text
            };
            self.global_rank = row.global_rank;
            var afterRankLookup = function () {
                self.socket.emit("rank", self.rank);
                self.name = name;
                if (self.inChannel()) {
                    self.channel.logger.log(self.ip + " logged in as " +
                                            name);
                    self.channel.broadcastNewUser(self);
                }
            };
            if (self.inChannel()) {
                self.channel.getRank(name, function (err, rank) {
                    if (!err) {
                        self.saverank = true;
                        self.rank = rank;
                    } else {
                        // If there was an error in retrieving the rank,
                        // don't overwrite it with a bad value
                        self.saverank = false;
                        self.rank = self.global_rank;
                    }
                    afterRankLookup();
                });
            } else {
                self.rank = self.global_rank;
                afterRankLookup();
            }
        });
    }
};

module.exports = User;
