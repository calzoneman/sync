/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Logger = require("./logger");
var Server = require("./server");
var ActionLog = require("./actionlog");

module.exports = {
    init: function (user) {
        var sv = Server.getServer();
        var db = sv.db;
        ActionLog.record(user.ip, user.name, "acp-init");
        user.socket.on("acp-announce", function(data) {
            ActionLog.record(user.ip, user.name, "acp-announce", data);
            sv.announcement = data;
            sv.io.sockets.emit("announcement", data);
            if (sv.cfg["enable-ssl"])
                sv.ioSecure.sockets.emit("announcement", data);
        });

        user.socket.on("acp-announce-clear", function() {
            ActionLog.record(user.ip, user.name, "acp-announce-clear");
            sv.announcement = null;
        });

        user.socket.on("acp-global-ban", function(data) {
            ActionLog.record(user.ip, user.name, "acp-global-ban",                                       data.ip);
            db.setGlobalIPBan(data.ip, data.note, function (err, res) {
                db.listGlobalIPBans(function (err, res) {
                    res = res || [];
                    user.socket.emit("acp-global-banlist", res);
                });
            });
        });

        user.socket.on("acp-global-unban", function(ip) {
            ActionLog.record(user.ip, user.name, "acp-global-unban", ip);
            db.clearGlobalIPBan(ip, function (err, res) {
                db.listGlobalIPBans(function (err, res) {
                    res = res || [];
                    user.socket.emit("acp-global-banlist", res);
                });
            });
        });

        db.listGlobalIPBans(function (err, res) {
            res = res || [];
            user.socket.emit("acp-global-banlist", res);
        });

        user.socket.on("acp-lookup-user", function(name) {
            db.searchUser(name, function (err, res) {
                res = res || [];
                user.socket.emit("acp-userdata", res);
            });
        });

        user.socket.on("acp-lookup-channel", function (data) {
            db.searchChannel(data.field, data.value, function (e, res) {
                res = res || [];
                user.socket.emit("acp-channeldata", res);
            });
        });

        user.socket.on("acp-reset-password", function(data) {
            db.getGlobalRank(data.name, function (err, rank) {
                if(err || rank >= user.global_rank)
                    return;

                db.genPasswordReset(user.ip, data.name, data.email,
                                    function (err, hash) {
                    var pkt = {
                        success: !err
                    };

                    if(err) {
                        pkt.error = err;
                    } else {
                        pkt.hash = hash;
                    }

                    user.socket.emit("acp-reset-password", pkt);
                    ActionLog.record(user.ip, user.name, 
                                     "acp-reset-password", data.name);
                });
            });
        });

        user.socket.on("acp-set-rank", function(data) {
            if(data.rank < 1 || data.rank >= user.global_rank)
                return;

            db.getGlobalRank(data.name, function (err, rank) {
                if(err || rank >= user.global_rank)
                    return;

                db.setGlobalRank(data.name, data.rank,
                                 function (err, res) {
                    ActionLog.record(user.ip, user.name, "acp-set-rank",
                                     data);
                    if(!err)
                        user.socket.emit("acp-set-rank", data);
                });
            });
        });

        user.socket.on("acp-list-loaded", function() {
            var chans = [];
            var all = sv.channels;
            for(var c in all) {
                var chan = all[c];

                chans.push({
                    name: chan.name,
                    title: chan.opts.pagetitle,
                    usercount: chan.users.length,
                    mediatitle: chan.playlist.current ? chan.playlist.current.media.title : "-",
                    is_public: chan.opts.show_public,
                    registered: chan.registered
                });
            }

            user.socket.emit("acp-list-loaded", chans);
        });

        user.socket.on("acp-channel-unload", function(data) {
            if(sv.isChannelLoaded(data.name)) {
                var c = sv.getChannel(data.name);
                if(!c)
                    return;
                ActionLog.record(user.ip, user.name, "acp-channel-unload");
                c.initialized = data.save;
                // copy the list of users to prevent concurrent
                // modification
                var users = Array.prototype.slice.call(c.users);
                users.forEach(function (u) {
                    c.kick(u, "Channel shutting down");
                });

                // At this point c should be unloaded
                // if it's still loaded, kill it
                if(sv.isChannelLoaded(data.name))
                    sv.unloadChannel(sv.getChannel(data.name));
            }
        });

        user.socket.on("acp-actionlog-list", function () {
            ActionLog.listActionTypes(function (err, types) {
                if(!err)
                    user.socket.emit("acp-actionlog-list", types);
            });
        });

        user.socket.on("acp-actionlog-clear", function(data) {
            ActionLog.clear(data);
            ActionLog.record(user.ip, user.name, "acp-actionlog-clear", data);
        });

        user.socket.on("acp-actionlog-clear-one", function(data) {
            ActionLog.clearOne(data);
            ActionLog.record(user.ip, user.name, "acp-actionlog-clear-one", data);
        });

        user.socket.on("acp-view-stats", function () {
            db.listStats(function (err, res) {
                if(!err)
                    user.socket.emit("acp-view-stats", res);
            });
        });
    }
}
