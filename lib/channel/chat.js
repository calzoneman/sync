var User = require("../user");
var XSS = require("../xss");
var ChannelModule = require("./module");
var util = require("../utilities");

const SHADOW_TAG = "[shadow]";
const LINK = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;

function ChatModule(channel) {
    ChannelModule.apply(this, arguments);
    this.buffer = [];
    this.muted = new util.Set();
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
        user.setFlag(User.SMUTED | User.MUTED);
    } else if (this.isMuted(user.getName())) {
        user.setFlag(User.MUTED);
    }

    user.on("chatMsg", this.handleChatMsg.bind(this, user));
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
    /* TODO Update for filter module */
    return msg;
    var chan = this.channel;
    var parts = msg.split(link);

    for (var j = 0; j < parts.length; j++) {
        // Case 1: The substring is a URL
        if (chan.opts.enable_link_regex && parts[j].match(link)) {
            var original = parts[j];
            parts[j] = chan.filterList.exec(parts[j], { filterlinks: true });

            // Unchanged, apply link filter
            if (parts[j] === original) {
                parts[j] = url.format(url.parse(parts[j]));
                parts[j] = parts[j].replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");
            }

        } else {
            // Substring is not a URL
            parts[j] = chan.filterList.exec(parts[j], { filterlinks: false });
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

module.exports = ChatModule;
