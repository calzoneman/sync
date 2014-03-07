function EmoteList(defaults) {
    if (!defaults) {
        defaults = [];
    }

    this.emotes = defaults.map(function (f) {
        return new Emote(f.name, f.source, f.flags, f.replace, f.active, f.emotelinks);
    });
}

EmoteList.prototype = {
    pack: function () {
        return this.emotes.map(function (f) { return f.pack(); });
    },

    importList: function (emotes) {
        this.emotes = Array.prototype.slice.call(emotes);
    },

    updateEmote: function (emote) {
        emote = this.validateEmote(emote);
        if (!emote) {
            return;
        }

        var found = false;
        for (var i = 0; i < this.emotes.length; i++) {
            if (this.emotes[i].name === emote.name) {
                found = true;
                this.emotes[i] = emote;
                break;
            }
        }

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
        to = to > from ? to + 1 : to;
        from = to > from ? from : from + 1;

        this.emotes.splice(to, 0, f);
        this.emotes.splice(from, 1);
        return true;
    }
};

function validateEmote(f) {
    if (typeof f !== "object") {
        return false;
    }

    if (typeof f.name !== "string" || typeof f.image !== "string") {
        return false;
    }

    f.image = f.image.substring(0, 1000);
    f.image = XSS.sanitizeText(f.image);

    var s = f.name.replace(/\\\.\?\+\*\$\^\(\)\[\]\{\}/g, "\\$1");
    s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    s = "(^|\\s)" + s + "($|\\s)";
    f.source = s;

    try {
        new RegExp(f.regex, "gi");
    } catch (e) {
        return false;
    }

    return f;
}

module.exports = {
    EmoteList: EmoteList,
    validateEmote: validateEmote
};
