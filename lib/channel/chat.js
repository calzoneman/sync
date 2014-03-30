var User = require("../user");
var XSS = require("../xss");
var ChannelModule = require("./module");
var util = require("../utilities");
var Flags = require("../flags");

const SHADOW_TAG = "[shadow]";
const LINK = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;

function ChatModule(channel) {
    ChannelModule.apply(this, arguments);
    this.buffer = [];
    this.muted = new util.Set();
    this.commandHandlers = {};
}

ChatModule.prototype = Object.create(ChannelModule.prototype);

ChatModule.prototype.load = function (data) {
    this.buffer = [];
    this.muted = new util.Set();

    if ("chatbuffer" in data) {
        for (var i = 0; i < data.chatbuffer.length; i++) {
            this.buffer.append(data.chatbuffer[i]);
        }
    }

    if ("chatmuted" in data) {
        for (var i = 0; i < data.chatmuted.length; i++) {
            this.muted.add(data.chatmuted[i]);
        }
    }
};

ChatModule.prototype.save = function (data) {
    data.chatbuffer = this.buffer;
    data.chatmuted = Array.prototype.slice.call(this.muted);
};

ChatModule.prototype.onUserPostJoin = function (user) {
    if (this.isShadowMuted(user.getName())) {
        user.setFlag(Flags.U_SMUTED | Flags.U_MUTED);
    } else if (this.isMuted(user.getName())) {
        user.setFlag(Flags.U_MUTED);
    }

    user.socket.on("chatMsg", this.handleChatMsg.bind(this, user));
    this.buffer.forEach(function (msg) {
        user.socket.emit("chatMsg", msg);
    });
};

ChatModule.prototype.isMuted = function (name) {
    return this.muted.contains(name.toLowerCase()) ||
           this.muted.contains(SHADOW_TAG + name.toLowerCase());
};

ChatModule.prototype.mutedUsers = function () {
    var self = this;
    return self.channel.users.filter(function (u) {
        return self.isMuted(u.getName());
    });
};

ChatModule.prototype.isShadowMuted = function (name) {
    return this.muted.contains(SHADOW_TAG + name.toLowerCase());
};

ChatModule.prototype.shadowMutedUsers = function () {
    var self = this;
    return self.channel.users.filter(function (u) {
        return self.isShadowMuted(u.getName());
    });
};

ChatModule.prototype.handleChatMsg = function (user, data) {
    var self = this;

    if (!this.channel.modules.permissions.canChat(user)) {
        return;
    }

    if (typeof data !== "object" || typeof data.msg !== "string" || !data.msg) {
        return;
    }

    data.msg = XSS.sanitizeText(data.msg.substring(0, 240));

    if (!user.is(Flags.U_LOGGED_IN)) {
        return;
    }

    if (typeof data.meta !== "object") {
        data.meta = {};
    }

    var meta = {};
    if (user.account.effectiveRank >= 2) {
        if ("modflair" in data.meta && data.meta.modflair === user.rank) {
            meta.modflair = data.meta.modflair;
        }
    }
    data.meta = meta;

    this.channel.checkModules("onUserChat", [user, data], function (err, result) {
        if (result === ChannelModule.PASSTHROUGH) {
            self.processChatMsg(user, data);
        }
    });
};

ChatModule.prototype.processChatMsg = function (user, data) {
    if (user.is(Flags.U_SMUTED)) {
        var msgobj = {
            username: user.getName(),
            msg: data.msg,
            meta: data.meta,
            time: Date.now()
        };
        this.shadowMutedUsers().forEach(function (u) {
            u.socket.emit("chatMsg", msgobj);
        });
        return;
    } else if (user.is(Flags.U_MUTED)) {
        user.socket.emit("noflood", {
            action: "chat",
            msg: "You have been muted on this channel."
        });
        return;
    }

    if (data.msg.indexOf("/") === 0) {
        var space = msg.indexOf(" ");
        if (space < 0) {
            this.sendMessage(user, data.msg, data.meta);
            return;
        }

        var cmd = msg.substring(1, space);
        if (cmd in this.commandHandlers) {
            this.commandHandlers[cmd](user, data.msg, data.meta);
        } else {
            this.sendMessage(user, data.msg, data.meta);
        }
    } else {
        if (data.msg.indexOf(">") === 0) {
            meta.addClass = "greentext";
        }
        this.sendMessage(user, data.msg, data.meta);
    }
};

ChatModule.prototype.formatMessage = function (username, data) {
    data.msg = XSS.sanitizeText(data.msg);
    data.msg = this.filterMessage(data.msg);
    var obj = {
        username: username,
        msg: data.msg,
        meta: data.meta,
        time: Date.now()
    };

    return obj;
};

ChatModule.prototype.filterMessage = function (msg) {
    var filters = this.channel.modules.filters.filters;
    var parts = msg.split(link);

    for (var j = 0; j < parts.length; j++) {
        // Case 1: The substring is a URL
        if (chan.opts.enable_link_regex && parts[j].match(link)) {
            var original = parts[j];
            parts[j] = filters.exec(parts[j], { filterlinks: true });

            // Unchanged, apply link filter
            if (parts[j] === original) {
                parts[j] = url.format(url.parse(parts[j]));
                parts[j] = parts[j].replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");
            }

        } else {
            // Substring is not a URL
            parts[j] = filters.exec(parts[j], { filterlinks: false });
        }
    }

    // Recombine the message
    return parts.join("");
};

ChatModule.prototype.sendModMessage = function (msg, minrank) {
    if (isNaN(minrank)) {
        minrank = 2;
    }

    var notice = {
        username: "[server]",
        msg: msg,
        meta: {
            addClass: "server-whisper",
            addClassToNameAndTimestamp: true
        },
        time: Date.now()
    };

    this.channel.users.forEach(function (u) {
        if (u.account.effectiveRank >= minrank) {
            u.socket.emit("chatMsg", notice);
        }
    });
};

ChatModule.prototype.sendMessage = function (user, msg, meta) {
    var msgobj = {
        username: user.getName(),
        msg: msg,
        meta: meta,
        time: Date.now()
    };

    this.channel.users.forEach(function (u) {
        u.socket.emit("chatMsg", msgobj);
    });

    this.buffer.push(msgobj);
    if (this.buffer.length > 15) {
        this.buffer.shift();
    }

    this.channel.logger.log("<" + user.getName() + (meta.addClass ? "." + meta.addClass : "") +
                            "> " + XSS.decodeText(msg));
};

ChatModule.prototype.registerCommand = function (cmd, cb) {
    cmd = cmd.replace(/^\//, "");
    this.commandHandlers[cmd] = cb;
};

module.exports = ChatModule;
