var Config = require("../config");
var XSS = require("../xss");
var ChannelModule = require("./module");
var util = require("../utilities");
var Flags = require("../flags");
var counters = require("../counters");
import { transformImgTags } from '../camo';
import { Counter } from 'prom-client';

const SHADOW_TAG = "[shadow]";
const LINK = /(\w+:\/\/(?:[^:/[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^/\s]*)*)/ig;
const LINK_PLACEHOLDER = '\ueeee';
const LINK_PLACEHOLDER_RE = /\ueeee/g;

const TYPE_CHAT = {
    msg: "string",
    meta: "object,optional"
};

const TYPE_PM = {
    msg: "string",
    to: "string",
    meta: "object,optional"
};

// Limit to 10 messages/sec
const MIN_ANTIFLOOD = {
    burst: 20,
    sustained: 10
};

function ChatModule(_channel) {
    ChannelModule.apply(this, arguments);
    this.buffer = [];
    this.muted = new util.Set();
    this.commandHandlers = {};
    this.supportsDirtyCheck = true;

    /* Default commands */
    this.registerCommand("/me", this.handleCmdMe.bind(this));
    this.registerCommand("/sp", this.handleCmdSp.bind(this));
    this.registerCommand("/say", this.handleCmdSay.bind(this));
    this.registerCommand("/rcv", this.handleCmdSay.bind(this));
    this.registerCommand("/shout", this.handleCmdSay.bind(this));
    this.registerCommand("/clear", this.handleCmdClear.bind(this));
    this.registerCommand("/a", this.handleCmdAdminflair.bind(this));
    this.registerCommand("/afk", this.handleCmdAfk.bind(this));
    this.registerCommand("/mute", this.handleCmdMute.bind(this));
    this.registerCommand("/smute", this.handleCmdSMute.bind(this));
    this.registerCommand("/unmute", this.handleCmdUnmute.bind(this));
    this.registerCommand("/unsmute", this.handleCmdUnmute.bind(this));
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
        for (i = 0; i < data.chatmuted.length; i++) {
            this.muted.add(data.chatmuted[i]);
        }
    }

    this.dirty = false;
};

ChatModule.prototype.save = function (data) {
    data.chatbuffer = this.buffer;
    data.chatmuted = Array.prototype.slice.call(this.muted);
};

ChatModule.prototype.packInfo = function (data, _isAdmin) {
    data.chat = Array.prototype.slice.call(this.buffer);
};

ChatModule.prototype.onUserPostJoin = function (user) {
    var self = this;
    user.waitFlag(Flags.U_LOGGED_IN, function () {
        var muteperm = self.channel.modules.permissions.permissions.mute;
        if (self.isShadowMuted(user.getName())) {
            user.setFlag(Flags.U_SMUTED | Flags.U_MUTED);
            self.channel.sendUserMeta(self.channel.users, user, muteperm);
        } else if (self.isMuted(user.getName())) {
            user.setFlag(Flags.U_MUTED);
            self.channel.sendUserMeta(self.channel.users, user, muteperm);
        }
    });

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

ChatModule.prototype.anonymousUsers = function () {
    return this.channel.users.filter(function (u) {
        return u.getName() === "";
    });
};

ChatModule.prototype.restrictNewAccount = function restrictNewAccount(user, data) {
    if (user.account.effectiveRank < 2 && this.channel.modules.options) {
        const firstSeen = user.getFirstSeenTime();
        const opts = this.channel.modules.options;
        if (firstSeen > Date.now() - opts.get("new_user_chat_delay")*1000) {
            user.socket.emit("spamFiltered", {
                reason: "NEW_USER_CHAT"
            });
            return true;
        } else if ((firstSeen > Date.now() - opts.get("new_user_chat_link_delay")*1000)
                && data.msg.match(LINK)) {
            user.socket.emit("spamFiltered", {
                reason: "NEW_USER_CHAT_LINK"
            });
            return true;
        }
    }

    return false;
};

const chatIncomingCount = new Counter({
    name: 'cytube_chat_incoming_total',
    help: 'Number of incoming chatMsg frames'
});
ChatModule.prototype.handleChatMsg = function (user, data) {
    var self = this;
    counters.add("chat:incoming");
    chatIncomingCount.inc(1, new Date());

    if (!this.channel || !this.channel.modules.permissions.canChat(user)) {
        return;
    }

    // Limit to 240 characters
    data.msg = data.msg.substring(0, 240);

    // Restrict new accounts/IPs from chatting and posting links
    if (this.restrictNewAccount(user, data)) {
        return;
    }

    // If channel doesn't permit them, strip ASCII control characters
    if (!this.channel.modules.options ||
        !this.channel.modules.options.get("allow_ascii_control")) {

        data.msg = data.msg.replace(/[\x00-\x1f]+/g, " ");
    }

    // Disallow blankposting
    if (!data.msg.trim()) {
        return;
    }

    if (!user.is(Flags.U_LOGGED_IN)) {
        return;
    }

    var meta = {};
    data.meta = data.meta || {};
    if (user.account.effectiveRank >= 2) {
        if ("modflair" in data.meta && data.meta.modflair === user.account.effectiveRank) {
            meta.modflair = data.meta.modflair;
        }
    }
    data.meta = meta;

    this.channel.checkModules("onUserPreChat", [user, data], function (err, result) {
        if (result === ChannelModule.PASSTHROUGH) {
            self.processChatMsg(user, data);
        }
    });
};

ChatModule.prototype.handlePm = function (user, data) {
    if (!this.channel) {
        return;
    }

    if (!user.is(Flags.U_LOGGED_IN)) {
        return user.socket.emit("errorMsg", {
            msg: "You must be signed in to send PMs"
        });
    }

    // Restrict new accounts/IPs from chatting and posting links
    if (this.restrictNewAccount(user, data)) {
        return;
    }

    if (data.msg.match(Config.get("link-domain-blacklist-regex"))) {
        this.channel.logger.log(user.displayip + " (" + user.getName() + ") was kicked for " +
                "blacklisted domain");
        user.kick();
        this.sendModMessage(user.getName() + " was kicked: blacklisted domain in " +
                "private message", 2);
        return;
    }

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

    if (user.chatLimiter.throttle(MIN_ANTIFLOOD)) {
        user.socket.emit("cooldown", 1000 / MIN_ANTIFLOOD.sustained);
        return;
    }


    data.msg = data.msg.substring(0, 240);
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
    data.meta = data.meta || {};
    if (user.rank >= 2) {
        if ("modflair" in data.meta && data.meta.modflair === user.rank) {
            meta.modflair = data.meta.modflair;
        }
    }

    if (data.msg.indexOf(">") === 0) {
        meta.addClass = "greentext";
    }

    data.meta = meta;
    var msgobj = this.formatMessage(user.getName(), data);
    msgobj.to = to.getName();

    to.socket.emit("pm", msgobj);
    user.socket.emit("pm", msgobj);
};

const chatSentCount = new Counter({
    name: 'cytube_chat_sent_total',
    help: 'Number of broadcast chat messages'
});
ChatModule.prototype.processChatMsg = function (user, data) {
    if (data.msg.match(Config.get("link-domain-blacklist-regex"))) {
        this.channel.logger.log(user.displayip + " (" + user.getName() + ") was kicked for " +
                "blacklisted domain");
        user.kick();
        this.sendModMessage(user.getName() + " was kicked: blacklisted domain in " +
                "chat message", 2);
        return;
    }

    if (data.msg.indexOf("/afk") === -1) {
        user.setAFK(false);
    }

    var msgobj = this.formatMessage(user.getName(), data);
    var antiflood = MIN_ANTIFLOOD;
    if (this.channel.modules.options &&
        this.channel.modules.options.get("chat_antiflood") &&
        user.account.effectiveRank < 2) {

        antiflood = this.channel.modules.options.get("chat_antiflood_params");
    }

    if (user.chatLimiter.throttle(antiflood)) {
        user.socket.emit("cooldown", 1000 / antiflood.sustained);
        return;
    }

    if (data.msg.indexOf(">") === 0) {
        msgobj.meta.addClass = "greentext";
    }

    if (data.msg.indexOf("/") === 0) {
        var space = data.msg.indexOf(" ");
        var cmd;
        if (space < 0) {
            cmd = data.msg.substring(1);
        } else {
            cmd = data.msg.substring(1, space);
        }

        if (cmd in this.commandHandlers) {
            this.commandHandlers[cmd](user, data.msg, data.meta);
            return;
        }
    }

    if (user.is(Flags.U_SMUTED)) {
        this.shadowMutedUsers().forEach(function (u) {
            u.socket.emit("chatMsg", msgobj);
        });
        // This prevents shadowmuted users from easily detecting their state
        this.anonymousUsers().forEach(function (u) {
            u.socket.emit("chatMsg", msgobj);
        });
        msgobj.meta.shadow = true;
        this.channel.moderators().forEach(function (u) {
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
    this.sendMessage(msgobj);
    counters.add("chat:sent");
    chatSentCount.inc(1, new Date());
};

ChatModule.prototype.formatMessage = function (username, data) {
    var msg = XSS.sanitizeText(data.msg);
    if (this.channel.modules.filters) {
        msg = this.filterMessage(msg);
    }
    var obj = {
        username: username,
        msg: msg,
        meta: data.meta,
        time: Date.now()
    };

    return obj;
};

ChatModule.prototype.filterMessage = function (msg) {
    var filters = this.channel.modules.filters.filters;
    var convertLinks = this.channel.modules.options.get("enable_link_regex");
    var links = msg.match(LINK);
    var intermediate = msg.replace(LINK, LINK_PLACEHOLDER);

    var result = filters.filter(intermediate, false);
    result = result.replace(LINK_PLACEHOLDER_RE, function () {
        var link = links.shift();
        if (!link) {
            return '';
        }

        var filtered = filters.filter(link, true);
        if (filtered !== link) {
            return filtered;
        } else if (convertLinks) {
            return "<a href=\"" + link + "\" target=\"_blank\" " +
                    "rel=\"noopener noreferrer\">" + link + "</a>";
        } else {
            return link;
        }
    });

    let settings = {};
    const camoConfig = Config.getCamoConfig();
    if (camoConfig.isEnabled()) {
        settings = {
            transformTags: {
                img: transformImgTags.bind(null, camoConfig)
            }
        };
    }

    return XSS.sanitizeHTML(result, settings);
};

ChatModule.prototype.sendModMessage = function (msg, minrank) {
    if (isNaN(minrank)) {
        minrank = 2;
    }

    var msgobj = {
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
            u.socket.emit("chatMsg", msgobj);
        }
    });
};

ChatModule.prototype.sendMessage = function (msgobj) {
    this.channel.broadcastAll("chatMsg", msgobj);

    this.dirty = true;
    this.buffer.push(msgobj);
    if (this.buffer.length > 15) {
        this.buffer.shift();
    }

    this.channel.logger.log(
        "<" + msgobj.username +
        (msgobj.meta.addClass ? "." + msgobj.meta.addClass : "") +
        "> " + XSS.decodeText(msgobj.msg)
    );
};

ChatModule.prototype.registerCommand = function (cmd, cb) {
    cmd = cmd.replace(/^\//, "");
    this.commandHandlers[cmd] = cb;
};

/**
 * == Default commands ==
 */

ChatModule.prototype.handleCmdMe = function (user, msg, meta) {
    meta.addClass = "action";
    meta.action = true;
    var args = msg.split(" ");
    args.shift();
    this.processChatMsg(user, { msg: args.join(" "), meta: meta });
};

ChatModule.prototype.handleCmdSp = function (user, msg, meta) {
    meta.addClass = "spoiler";
    var args = msg.split(" ");
    args.shift();
    this.processChatMsg(user, { msg: args.join(" "), meta: meta });
};

ChatModule.prototype.handleCmdSay = function (user, msg, meta) {
    if (user.account.effectiveRank < 1.5) {
        return;
    }
    meta.addClass = "shout";
    meta.addClassToNameAndTimestamp = true;
    meta.forceShowName = true;
    var args = msg.split(" ");
    args.shift();
    this.processChatMsg(user, { msg: args.join(" "), meta: meta });
};

ChatModule.prototype.handleCmdClear = function (user, _msg, _meta) {
    if (!this.channel.modules.permissions.canClearChat(user)) {
        return;
    }

    this.dirty = true;
    this.buffer = [];
    this.channel.broadcastAll("clearchat", { clearedBy: user.getName() });
    this.sendModMessage(user.getName() + " cleared chat.", -1);
    this.channel.logger.log("[mod] " + user.getName() + " used /clear");
};

ChatModule.prototype.handleCmdAdminflair = function (user, msg, meta) {
    if (user.account.globalRank < 255) {
        return;
    }
    var args = msg.split(" ");
    args.shift();

    var superadminflair = {
        labelclass: "label-danger",
        icon: "glyphicon-globe"
    };

    var cargs = [];
    args.forEach(function (a) {
        if (a.indexOf("!icon-") === 0) {
            superadminflair.icon = "glyph" + a.substring(1);
        } else if (a.indexOf("!label-") === 0) {
            superadminflair.labelclass = a.substring(1);
        } else {
            cargs.push(a);
        }
    });

    meta.superadminflair = superadminflair;
    meta.forceShowName = true;

    this.processChatMsg(user, { msg: cargs.join(" "), meta: meta });
};

ChatModule.prototype.handleCmdAfk = function (user, _msg, _meta) {
    user.setAFK(!user.is(Flags.U_AFK));
};

ChatModule.prototype.handleCmdMute = function (user, msg, _meta) {
    if (!this.channel.modules.permissions.canMute(user)) {
        return;
    }

    var muteperm = this.channel.modules.permissions.permissions.mute;
    var args = msg.split(" ");
    args.shift(); /* shift off /mute */

    var name = args.shift();
    if (typeof name !== "string") {
        user.socket.emit("errorMsg", {
            msg: "/mute requires a target name"
        });
        return;
    }
    name = name.toLowerCase();

    var target;

    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getLowerName() === name) {
            target = this.channel.users[i];
            break;
        }
    }

    if (!target) {
        user.socket.emit("errorMsg", {
            msg: "/mute target " + name + " not present in channel."
        });
        return;
    }

    if (target.account.effectiveRank >= user.account.effectiveRank
        || target.account.globalRank > user.account.globalRank) {
        user.socket.emit("errorMsg", {
            msg: "/mute failed - " + target.getName() + " has equal or higher rank " +
                 "than you."
        });
        return;
    }

    target.setFlag(Flags.U_MUTED);
    this.muted.add(name);
    this.channel.sendUserMeta(this.channel.users, target, -1);
    this.channel.logger.log("[mod] " + user.getName() + " muted " + target.getName());
    this.sendModMessage(user.getName() + " muted " + target.getName(), muteperm);
};

ChatModule.prototype.handleCmdSMute = function (user, msg, _meta) {
    if (!this.channel.modules.permissions.canMute(user)) {
        return;
    }

    var muteperm = this.channel.modules.permissions.permissions.mute;
    var args = msg.split(" ");
    args.shift(); /* shift off /smute */

    var name = args.shift();
    if (typeof name !== "string") {
        user.socket.emit("errorMsg", {
            msg: "/smute requires a target name"
        });
        return;
    }
    name = name.toLowerCase();

    var target;

    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getLowerName() === name) {
            target = this.channel.users[i];
            break;
        }
    }

    if (!target) {
        user.socket.emit("errorMsg", {
            msg: "/smute target " + name + " not present in channel."
        });
        return;
    }

    if (target.account.effectiveRank >= user.account.effectiveRank
        || target.account.globalRank > user.account.globalRank) {
        user.socket.emit("errorMsg", {
            msg: "/smute failed - " + target.getName() + " has equal or higher rank " +
                 "than you."
        });
        return;
    }

    target.setFlag(Flags.U_MUTED | Flags.U_SMUTED);
    this.muted.add(name);
    this.muted.add(SHADOW_TAG + name);
    this.channel.sendUserMeta(this.channel.users, target, muteperm);
    this.channel.logger.log("[mod] " + user.getName() + " shadowmuted " + target.getName());
    this.sendModMessage(user.getName() + " shadowmuted " + target.getName(), muteperm);
};

ChatModule.prototype.handleCmdUnmute = function (user, msg, _meta) {
    if (!this.channel.modules.permissions.canMute(user)) {
        return;
    }

    var muteperm = this.channel.modules.permissions.permissions.mute;
    var args = msg.split(" ");
    args.shift(); /* shift off /mute */

    var name = args.shift();
    if (typeof name !== "string") {
        user.socket.emit("errorMsg", {
            msg: "/unmute requires a target name"
        });
        return;
    }
    name = name.toLowerCase();

    if (name === user.getName().toLowerCase()) {
        user.socket.emit("errorMsg", {
            msg: "You are not allowed to unmute yourself"
        });
        return;
    }

    if (!this.isMuted(name)) {
        user.socket.emit("errorMsg", {
            msg: name + " is not muted."
        });
        return;
    }

    this.muted.remove(name);
    this.muted.remove(SHADOW_TAG + name);

    this.channel.logger.log("[mod] " + user.getName() + " unmuted " + name);
    this.sendModMessage(user.getName() + " unmuted " + name, muteperm);

    var target;
    for (var i = 0; i < this.channel.users.length; i++) {
        if (this.channel.users[i].getLowerName() === name) {
            target = this.channel.users[i];
            break;
        }
    }

    if (!target) {
        return;
    }

    target.clearFlag(Flags.U_MUTED | Flags.U_SMUTED);
    this.channel.sendUserMeta(this.channel.users, target, -1);
};

module.exports = ChatModule;
