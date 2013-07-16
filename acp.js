/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Auth = require("./auth");
var ActionLog = require("./actionlog");

module.exports = function (Server) {
    return {
        init: function(user) {
            ActionLog.record(user.ip, user.name, "acp-init");
            user.socket.on("acp-announce", function(data) {
                ActionLog.record(user.ip, user.name, "acp-announce", data);
                Server.announcement = data;
                Server.io.sockets.emit("announcement", data);
            });

            user.socket.on("acp-announce-clear", function() {
                ActionLog.record(user.ip, user.name, "acp-announce-clear");
                Server.announcement = null;
            });

            user.socket.on("acp-global-ban", function(data) {
                ActionLog.record(user.ip, user.name, "acp-global-ban", data.ip);
                Server.db.globalBanIP(data.ip, data.note);
                user.socket.emit("acp-global-banlist", Server.db.refreshGlobalBans());
            });

            user.socket.on("acp-global-unban", function(ip) {
                ActionLog.record(user.ip, user.name, "acp-global-unban", ip);
                Server.db.globalUnbanIP(ip);
                user.socket.emit("acp-global-banlist", Server.db.refreshGlobalBans());
            });

            user.socket.emit("acp-global-banlist", Server.db.refreshGlobalBans());

            user.socket.on("acp-lookup-user", function(name) {
                var db = Server.db.getConnection();
                if(!db) {
                    return;
                }

                var query = Server.db.createQuery(
                    "SELECT id,uname,global_rank,profile_image,profile_text,email FROM registrations WHERE uname LIKE ?",
                    ["%"+name+"%"]
                );

                var res = db.querySync(query);
                if(!res)
                    return;

                var rows = res.fetchAllSync();
                user.socket.emit("acp-userdata", rows);
            });

            user.socket.on("acp-reset-password", function(data) {
                if(Auth.getGlobalRank(data.name) >= user.global_rank)
                    return;
                try {
                    var hash = Server.db.generatePasswordReset(user.ip, data.name, data.email);
                    ActionLog.record(user.ip, user.name, "acp-reset-password", data.name);
                }
                catch(e) {
                    user.socket.emit("acp-reset-password", {
                        success: false,
                        error: e
                    });
                    return;
                }
                if(hash) {
                    user.socket.emit("acp-reset-password", {
                        success: true,
                        hash: hash
                    });
                }
                else {
                    user.socket.emit("acp-reset-password", {
                        success: false,
                        error: "Reset failed"
                    });
                }

            });

            user.socket.on("acp-set-rank", function(data) {
                if(data.rank < 1 || data.rank >= user.global_rank)
                    return;

                if(Auth.getGlobalRank(data.name) >= user.global_rank)
                    return;

                var db = Server.db.getConnection();
                if(!db)
                    return;

                ActionLog.record(user.ip, user.name, "acp-set-rank", data);
                var query = Server.db.createQuery(
                    "UPDATE registrations SET global_rank=? WHERE uname=?",
                    [data.rank, data.name]
                );

                var res = db.querySync(query);
                if(!res)
                    return;

                user.socket.emit("acp-set-rank", data);
            });

            user.socket.on("acp-list-loaded", function() {
                var chans = [];
                var all = Server.channels;
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
                if(Server.getChannel(data.name) !== undefined) {
                    var c = Server.getChannel(data.name);
                    if(!c)
                        return;
                    ActionLog.record(user.ip, user.name, "acp-channel-unload");
                    c.initialized = data.save;
                    c.users.forEach(function(u) {
                        c.kick(u, "Channel shutting down");
                    });

                    // At this point c should be unloaded
                    // if it's still loaded, kill it
                    c = Server.getChannel(data.name);
                    if(c !== undefined)
                        Server.unload(c);
                }
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
                var db = Server.db.getConnection();
                if(!db)
                    return;
                var query = "SELECT * FROM stats WHERE 1";
                var results = db.querySync(query);
                if(results)
                    user.socket.emit("acp-view-stats", results.fetchAllSync());
            });
        }
    }
}
