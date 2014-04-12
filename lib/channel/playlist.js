var ChannelModule = require("./module");

function PlaylistModule(channel) {
    ChannelModule.apply(this, arguments);
}

PlaylistModule.prototype = Object.create(ChannelModule.prototype);

PlaylistModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("queue", this.handleQueue.bind(this, user));
};

PlaylistModule.prototype.handleQueue = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (typeof data.id !== "string" && data.id !== false) {
        return;
    }
    var id = data.id;

    if (typeof data.type !== "string") {
        return;
    }
    var type = data.type;

    if (data.pos !== "next" && data.pos !== "end") {
        return;
    }

    if (typeof data.title !== "string" || data.type !== "cu") {
        data.title = false;
    }

    var link = util.formatLink(id, type);
    var perms = this.channel.modules.permissions;

    if (!perms.canAddVideo(user, data)) {
        return;
    }

    if (data.pos === "next" && !perms.canAddNext(user)) {
        return;
    }

    if (data.type === "yp" && !perms.canAddList(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add playlists",
            link: link
        });
        return;
    }

    if (util.isLive(type) && !perms.canAddLive(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add live media",
            link: link
        });
        return;
    }

    if (type === "cu" && !perms.canAddCustom(user)) {
        user.socket.emit("queueFail", {
            msg: "You don't have permission to add custom embeds",
            link: link
        });
        return;
    }

    var temp = data.temp || !perms.canAddNonTemp(user);
    var queueby = user.name;
    var duration = undefined;
    if (util.isLive(type) && typeof data.duration === "number") {
        duration = !isNaN(data.duration) ? data.duration : undefined;
    }

    var limit = {
        burst: 3,
        sustained: 1
    };

    if (user.account.effectiveRank >= 2) {
        limit = {
            burst: 10,
            sustained: 2
        };
    }

    if (user.queueLimiter.throttle(limit)) {
        user.socket.emit("queueFail", {
            msg: "You are adding videos too quickly",
            link: link
        });
        return;
    }
};
