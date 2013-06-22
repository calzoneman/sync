var Server = require("./server");
var Auth = require("./auth");
var Database = require("./database");
var ActionLog = require("./actionlog");

module.exports = {
    init: function(user) {
        ActionLog.record(user.ip, user.name, "acp-init");
        user.socket.on("acp-announce", function(data) {
            ActionLog.record(user.ip, user.name, ["acp-announce", data]);
            Server.announcement = data;
            Server.io.sockets.emit("announcement", data);
        });

        user.socket.on("acp-announce-clear", function() {
            ActionLog.record(user.ip, user.name, "acp-announce-clear");
            Server.announcement = null;
        });

        user.socket.on("acp-global-ban", function(data) {
            ActionLog.record(user.ip, user.name, ["acp-global-ban", data.ip]);
            Database.globalBanIP(data.ip, data.note);
            user.socket.emit("acp-global-banlist", Database.refreshGlobalBans());
        });

        user.socket.on("acp-global-unban", function(ip) {
            ActionLog.record(user.ip, user.name, ["acp-global-unban", data.ip]);
            Database.globalUnbanIP(ip);
            user.socket.emit("acp-global-banlist", Database.refreshGlobalBans());
        });

        user.socket.emit("acp-global-banlist", Database.refreshGlobalBans());

        user.socket.on("acp-lookup-user", function(name) {
            var db = Database.getConnection();
            if(!db) {
                return;
            }

            var query = Database.createQuery(
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
                var hash = Database.generatePasswordReset(user.ip, data.name, data.email);
                ActionLog.record(user.ip, user.name, ["acp-reset-password", data.name]);
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

            var db = Database.getConnection();
            if(!db)
                return;

            ActionLog.record(user.ip, user.name, ["acp-set-rank", data]);
            var query = Database.createQuery(
                "UPDATE registrations SET global_rank=? WHERE uname=?",
                [data.name, data.rank]
            );

            var res = db.querySync(query);
            if(!res)
                return;

            user.socket.emit("acp-set-rank", data);
        });

        user.socket.on("acp-list-loaded", function() {
            var chans = [];
            for(var c in Server.channels) {
                var chan = Server.channels[c];
                if(!chan)
                    continue;

                chans.push({
                    name: c,
                    title: chan.opts.pagetitle,
                    usercount: chan.users.length,
                    mediatitle: chan.media ? chan.media.title : "-",
                    is_public: chan.opts.show_public,
                    registered: chan.registered
                });
            }

            user.socket.emit("acp-list-loaded", chans);
        });

        user.socket.on("acp-channel-unload", function(data) {
            if(data.name in Server.channels) {
                var c = Server.channels[data.name];
                if(!c)
                    return;
                ActionLog.record(user.ip, user.name, "acp-channel-unload");
                c.initialized = data.save;
                c.users.forEach(function(u) {
                    c.kick(u, "Channel shutting down");
                });
                Server.unload(c);
            }
        });

        user.socket.on("acp-actionlog-clear", function() {
            ActionLog.clear();
            ActionLog.record(user.ip, user.name, "acp-actionlog-clear");
        });
    }
}
