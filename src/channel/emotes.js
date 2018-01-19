var ChannelModule = require("./module");
var XSS = require("../xss");

class EmoteList {
    constructor(list) {
        if (!list) {
            list = [];
        }

        this.emotes = new Map(list.map(e => [e.name, e]));
    }

    toJSON() {
        let list = [];

        for (let [key, value] of this.emotes.entries()) {
            list.push(value);
        }

        return list;
    }

    hasEmote(name) {
        return this.emotes.has(name);
    }

    setEmote(name, emote) {
        this.emotes.set(name, emote);
    }

    deleteEmote(name) {
        return this.emotes.delete(name);
    }

    size() {
        return this.emotes.size;
    }
}

function validateEmote(f) {
    if (typeof f.name !== "string" || typeof f.image !== "string") {
        return false;
    }

    f.image = f.image.substring(0, 1000);
    f.image = XSS.sanitizeText(f.image);

    var s = XSS.looseSanitizeText(f.name).replace(/([\\\.\?\+\*\$\^\|\(\)\[\]\{\}])/g, "\\$1");
    s = "(^|\\s)" + s + "(?!\\S)";
    f.source = s;

    if (!f.image || !f.name) {
        return false;
    }

    try {
        new RegExp(f.source, "gi");
    } catch (e) {
        return false;
    }

    return f;
};

function EmoteModule(channel) {
    ChannelModule.apply(this, arguments);
    this.emotes = new EmoteList();
    this.supportsDirtyCheck = true;
}

EmoteModule.prototype = Object.create(ChannelModule.prototype);

EmoteModule.prototype.load = function (data) {
    if ("emotes" in data) {
        this.emotes = new EmoteList(data.emotes);
    }

    this.dirty = false;
};

EmoteModule.prototype.save = function (data) {
    data.emotes = this.emotes.toJSON();
};

EmoteModule.prototype.packInfo = function (data, isAdmin) {
    if (isAdmin) {
        data.emoteCount = this.emotes.size();
    }
};

EmoteModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("renameEmote", this.handleRenameEmote.bind(this, user));
    user.socket.on("updateEmote", this.handleUpdateEmote.bind(this, user));
    user.socket.on("importEmotes", this.handleImportEmotes.bind(this, user));
    user.socket.on("removeEmote", this.handleRemoveEmote.bind(this, user));
    this.sendEmotes([user]);
};

EmoteModule.prototype.sendEmotes = function (users) {
    var f = this.emotes.toJSON();
    var chan = this.channel;
    users.forEach(function (u) {
        u.socket.emit("emoteList", f);
    });
};

EmoteModule.prototype.handleRenameEmote = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    /*
    **  This shouldn't be able to happen,
    **  but we have idiots that like to send handcrafted frames to fuck with shit
    */
    if (typeof data.old !== "string"){
        return;
    }

    if (!this.channel.modules.permissions.canEditEmotes(user)) {
        return;
    }

    var e = this.emotes.hasEmote(data.name);
    var f = validateEmote(data);
    if (!f || e) {
        var message = "Unable to rename emote '" + JSON.stringify(data) + "'.  " +
                "Please contact an administrator for assistance.";
        if (!data.image || !data.name) {
            message = "Emote names and images must not be blank.";
        }
        if (e) {
            message = "Emote already exists.";
        }

        user.socket.emit("errorMsg", {
            msg: message,
            alert: true
        });
        return;
    }

    var hadOld = this.emotes.deleteEmote(f.old);

    if (!hadOld) {
        return;
    }

    this.emotes.setEmote(f.name, {
        name: f.name,
        source: f.source,
        image: f.image
    });

    this.dirty = true;

    var chan = this.channel;
    chan.broadcastAll("renameEmote", f);
    chan.logger.log(`[mod] ${user.getName()} renamed emote: ${f.old} -> ${f.name}`);
};

EmoteModule.prototype.handleUpdateEmote = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditEmotes(user)) {
        return;
    }

    var f = validateEmote(data);
    if (!f) {
        var message = "Unable to update emote '" + JSON.stringify(data) + "'.  " +
                "Please contact an administrator for assistance.";
        if (!data.image || !data.name) {
            message = "Emote names and images must not be blank.";
        }

        user.socket.emit("errorMsg", {
            msg: message,
            alert: true
        });
        return;
    }

    this.emotes.setEmote(f.name, {
        name: f.name,
        source: f.source,
        image: f.image
    });

    this.dirty = true;

    var chan = this.channel;
    chan.broadcastAll("updateEmote", f);

    chan.logger.log("[mod] " + user.getName() + " updated emote: " + f.name + " -> " +
                    f.image);
};

EmoteModule.prototype.handleImportEmotes = function (user, data) {
    if (!(data instanceof Array)) {
        return;
    }

    /* Note: importing requires a different permission node than simply
       updating/removing */
    if (!this.channel.modules.permissions.canImportEmotes(user)) {
        return;
    }

    this.emotes = new EmoteList(data.map(validateEmote).filter(f => f));

    this.dirty = true;

    this.sendEmotes(this.channel.users);
};

EmoteModule.prototype.handleRemoveEmote = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditEmotes(user)) {
        return;
    }

    if (typeof data.name !== "string") {
        return;
    }

    this.emotes.deleteEmote(data.name);

    this.dirty = true;

    this.channel.logger.log("[mod] " + user.getName() + " removed emote: " + data.name);
    this.channel.broadcastAll("removeEmote", data);
};

module.exports = EmoteModule;
