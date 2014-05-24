var ChannelModule = require("./module");
var XSS = require("../xss");

function EmoteList(defaults) {
    if (!defaults) {
        defaults = [];
    }

    this.emotes = defaults.map(validateEmote).filter(function (f) {
        return f !== false;
    });
}

EmoteList.prototype = {
    pack: function () {
        return Array.prototype.slice.call(this.emotes);
    },

    importList: function (emotes) {
        this.emotes = Array.prototype.slice.call(emotes);
    },

    updateEmote: function (emote) {
        var found = false;
        for (var i = 0; i < this.emotes.length; i++) {
            if (this.emotes[i].name === emote.name) {
                found = true;
                this.emotes[i] = emote;
                break;
            }
        }

        /* If no emote was updated, add a new one */
        if (!found) {
            this.emotes.push(emote);
        }
    },

    removeEmote: function (emote) {
        var found = false;
        for (var i = 0; i < this.emotes.length; i++) {
            if (this.emotes[i].name === emote.name) {
                this.emotes.splice(i, 1);
                break;
            }
        }
    },

    moveEmote: function (from, to) {
        if (from < 0 || to < 0 ||
            from >= this.emotes.length || to >= this.emotes.length) {
            return false;
        }

        var f = this.emotes[from];
        /* Offset from/to indexes to account for the fact that removing
           an element changes the position of one of them.

           I could have just done a swap, but it's already implemented this way
           and it works. */
        to = to > from ? to + 1 : to;
        from = to > from ? from : from + 1;

        this.emotes.splice(to, 0, f);
        this.emotes.splice(from, 1);
        return true;
    },
};

function validateEmote(f) {
    if (typeof f.name !== "string" || typeof f.image !== "string") {
        return false;
    }

    f.image = f.image.substring(0, 1000);
    f.image = XSS.sanitizeText(f.image);

    var s = XSS.sanitizeText(f.name).replace(/([\\\.\?\+\*\$\^\|\(\)\[\]\{\}])/g, "\\$1");
    s = "(^|\\s)" + s + "(?!\\S)";
    f.source = s;

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
}

EmoteModule.prototype = Object.create(ChannelModule.prototype);

EmoteModule.prototype.load = function (data) {
    if ("emotes" in data) {
        for (var i = 0; i < data.emotes.length; i++) {
            this.emotes.updateEmote(data.emotes[i]);
        }
    }
};

EmoteModule.prototype.save = function (data) {
    data.emotes = this.emotes.pack();
};

EmoteModule.prototype.packInfo = function (data, isAdmin) {
    if (isAdmin) {
        data.emoteCount = this.emotes.emotes.length;
    }
};

EmoteModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("updateEmote", this.handleUpdateEmote.bind(this, user));
    user.socket.on("importEmotes", this.handleImportEmotes.bind(this, user));
    user.socket.on("moveEmote", this.handleMoveEmote.bind(this, user));
    user.socket.on("removeEmote", this.handleRemoveEmote.bind(this, user));
    this.sendEmotes([user]);
};

EmoteModule.prototype.sendEmotes = function (users) {
    var f = this.emotes.pack();
    var chan = this.channel;
    users.forEach(function (u) {
        u.socket.emit("emoteList", f);
    });
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
        return;
    }

    this.emotes.updateEmote(f);
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

    this.emotes.importList(data.map(validateEmote).filter(function (f) {
        return f !== false;
    }));
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

    this.emotes.removeEmote(data);
    this.channel.logger.log("[mod] " + user.getName() + " removed emote: " + data.name);
    this.channel.broadcastAll("removeEmote", data);
};

EmoteModule.prototype.handleMoveEmote = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditEmotes(user)) {
        return;
    }

    if (typeof data.to !== "number" || typeof data.from !== "number") {
        return;
    }

    this.emotes.moveEmote(data.from, data.to);
};

module.exports = EmoteModule;
