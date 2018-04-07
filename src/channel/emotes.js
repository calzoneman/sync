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

    emoteExists: function (emote){
        for (let i = 0; i < this.emotes.length; i++) {
            if (this.emotes[i].name === emote.name) {
                return true;
            }
        }

        return false;
    },

    renameEmote: function (emote) {
        var found = false;
        for (var i = 0; i < this.emotes.length; i++) {
            if (this.emotes[i].name === emote.old) {
                found = true;
                this.emotes[i] = emote;
                delete this.emotes[i].old;
                break;
            }
        }

        if(found){
            return true;
        }
        return false;
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

    var s = XSS.looseSanitizeText(f.name).replace(/([\\.?+*$^|()[\]{}])/g, "\\$1");
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
}

function EmoteModule(_channel) {
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
    data.emotes = this.emotes.pack();
};

EmoteModule.prototype.packInfo = function (data, isAdmin) {
    if (isAdmin) {
        data.emoteCount = this.emotes.emotes.length;
    }
};

EmoteModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("renameEmote", this.handleRenameEmote.bind(this, user));
    user.socket.on("updateEmote", this.handleUpdateEmote.bind(this, user));
    user.socket.on("importEmotes", this.handleImportEmotes.bind(this, user));
    user.socket.on("moveEmote", this.handleMoveEmote.bind(this, user));
    user.socket.on("removeEmote", this.handleRemoveEmote.bind(this, user));
    this.sendEmotes([user]);
};

EmoteModule.prototype.sendEmotes = function (users) {
    var f = this.emotes.pack();
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

    var e = this.emotes.emoteExists(data);
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

    // See comment above
    var success = this.emotes.renameEmote(Object.assign({}, f));
    if(!success){ return; }

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

    this.emotes.updateEmote(f);

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

    this.emotes.importList(data.map(validateEmote).filter(function (f) {
        return f !== false;
    }));

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

    this.emotes.removeEmote(data);

    this.dirty = true;

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

    this.dirty = true;
};

module.exports = EmoteModule;
