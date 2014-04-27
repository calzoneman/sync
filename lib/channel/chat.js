var User = require("../user");
var XSS = require("../xss");
var ChannelModule = require("./module");
var util = require("../utilities");
var Flags = require("../flags");
var url = require("url");

const SHADOW_TAG = "[shadow]";
const LINK = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;
const TYPE_CHAT = {
    msg: "string",
    meta: {
        modflair: "number,optional"
    }
};

const TYPE_PM = {
    msg: "string",
    to: "string",
    meta: {
        modflair: "number,optional"
    }
};

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
            this.buffer.push(data.chatbuffer[i]);
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

    user.socket.typecheckedOn("chatMsg", TYPE_CHAT, this.handleChatMsg.bind(this, user));
    user.socket.typecheckedOn("pm", TYPE_PM, this.handlePm.bind(this, user));
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

    data.msg = XSS.sanitizeText(data.msg.substring(0, 240));

    if (!user.is(Flags.U_LOGGED_IN)) {
        return;
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

ChatModule.prototype.handlePm = function (user, data) {
    var reallyTo = data.to;
    data.to = data.to.toLowerCase();

    if (data.to === user.getLowerName()) {
        user.socket.emit("errorMsg", {
            msg: "You can't PM yourself!"
        });
        return;
    }

    if (!util.isValidUserName(data.to)) {
        user.socket.emit("errorMsg", {
            msg: "PM failed: " + data.to + " isn't a valid username."
        });
        return;
    }

    var msg = data.msg.substring(0, 240);
    var to = null;
    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getLowerName() === data.to) {
            to = this.channel.users[i];
            break;
        }
    }

    if (!to) {
        user.socket.emit("errorMsg", {
            msg: "PM failed: " + data.to + " isn't connected to this channel."
        });
        return;
    }

    var meta = {};
    if (user.rank >= 2) {
        if ("modflair" in data.meta && data.meta.modflair === user.rank) {
            meta.modflair = data.meta.modflair;
        }
    }

    if (msg.indexOf(">") === 0) {
        meta.addClass = "greentext";
    }

    data.meta = meta;
    var msgobj = this.formatMessage(user, data);

    to.socket.emit("pm", msgobj);
    user.socket.emit("pm", msgobj);
};

ChatModule.prototype.processChatMsg = function (user, data) {
    var msgobj = this.formatMessage(user.getName(), data);
    // TODO throttle chat

    if (user.is(Flags.U_SMUTED)) {
        this.shadowMutedUsers().forEach(function (u) {
            u.socket.emit("chatMsg", msgobj);
        });
        /* TODO send shadowchat to moderators */
        /*
        msgobj.meda.shadow = true;
        this.channelModerators().forEach(function (u) {
            u.socket.emit("chatMsg", msgobj);
        });
        */
        return;
    } else if (user.is(Flags.U_MUTED)) {
        user.socket.emit("noflood", {
            action: "chat",
            msg: "You have been muted on this channel."
        });
        return;
    }

    if (data.msg.indexOf("/") === 0) {
        var space = data.msg.indexOf(" ");
        var cmd;
        if (space < 0) {
            space = data.msg.substring(1);
        } else {
            cmd = data.msg.substring(1, space);
        }

        if (cmd in this.commandHandlers) {
            this.commandHandlers[cmd](user, data.msg, data.meta);
        } else {
            this.sendMessage(msgobj);
        }
    } else {
        if (data.msg.indexOf(">") === 0) {
            meta.addClass = "greentext";
        }
        this.sendMessage(msgobj);
    }
};

ChatModule.prototype.formatMessage = function (username, data) {
    data.msg = XSS.sanitizeText(data.msg);
    if (this.channel.modules.filters) {
        data.msg = this.filterMessage(data.msg);
    }
    var obj = {
        username: username,
        msg: data.msg,
        meta: data.meta,
        time: Date.now()
    };

    return obj;
};

const link = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;
ChatModule.prototype.filterMessage = function (msg) {
    var filters = this.channel.modules.filters.filters;
    var chan = this.channel;
    var parts = msg.split(link);
    var convertLinks = this.channel.modules.options.get("enable_link_regex");

    for (var j = 0; j < parts.length; j++) {
        // Case 1: The substring is a URL
        if (convertLinks && parts[j].match(link)) {
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

    var msgobj = this.formatMessage("[server]", {
        msg: msg,
        meta: {
            addClass: "server-whisper",
            addClassToNameAndTimestamp: true
        }
    });

    this.channel.users.forEach(function (u) {
        if (u.account.effectiveRank >= minrank) {
            u.socket.emit("chatMsg", msgobj);
        }
    });
};

ChatModule.prototype.sendMessage = function (msgobj) {
    this.channel.broadcastAll("chatMsg", msgobj);

    this.buffer.push(msgobj);
    if (this.buffer.length > 15) {
        this.buffer.shift();
    }

    this.channel.logger.log("<" + msgobj.username + (msgobj.meta.addClass ?
                            "." + msgobj.meta.addClass : "") +
                            "> " + XSS.decodeText(msgobj.msg));
};

ChatModule.prototype.registerCommand = function (cmd, cb) {
    cmd = cmd.replace(/^\//, "");
    this.commandHandlers[cmd] = cb;
};

module.exports = ChatModule;
