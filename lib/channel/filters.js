var ChannelModule = require("./module");
var XSS = require("../xss");

function ChatFilter(name, regex, flags, replace, active, filterlinks) {
    this.name = name;
    this.source = regex;
    this.flags = flags;
    this.regex = new RegExp(this.source, flags);
    this.replace = replace;
    this.active = active === false ? false : true;
    this.filterlinks = filterlinks || false;
}

ChatFilter.prototype = {
    pack: function () {
        return {
            name: this.name,
            source: this.source,
            flags: this.flags,
            replace: this.replace,
            active: this.active,
            filterlinks: this.filterlinks
        };
    },

    exec: function (str) {
        return str.replace(this.regex, this.replace);
    }
};

function FilterList(defaults) {
    if (!defaults) {
        defaults = [];
    }

    this.filters = defaults.map(function (f) {
        return new ChatFilter(f.name, f.source, f.flags, f.replace, f.active, f.filterlinks);
    });
}

FilterList.prototype = {
    pack: function () {
        return this.filters.map(function (f) { return f.pack(); });
    },

    importList: function (filters) {
        this.filters = Array.prototype.slice.call(filters);
    },

    updateFilter: function (filter) {
        if (!filter.name) {
            filter.name = filter.source;
        }

        var found = false;
        for (var i = 0; i < this.filters.length; i++) {
            if (this.filters[i].name === filter.name) {
                found = true;
                this.filters[i] = filter;
                break;
            }
        }

        /* If no filter was updated, add a new one */
        if (!found) {
            this.filters.push(filter);
        }
    },

    removeFilter: function (filter) {
        var found = false;
        for (var i = 0; i < this.filters.length; i++) {
            if (this.filters[i].name === filter.name) {
                this.filters.splice(i, 1);
                break;
            }
        }
    },

    moveFilter: function (from, to) {
        if (from < 0 || to < 0 ||
            from >= this.filters.length || to >= this.filters.length) {
            return false;
        }

        var f = this.filters[from];
        /* Offset from/to indexes to account for the fact that removing
           an element changes the position of one of them.

           I could have just done a swap, but it's already implemented this way
           and it works. */
        to = to > from ? to + 1 : to;
        from = to > from ? from : from + 1;

        this.filters.splice(to, 0, f);
        this.filters.splice(from, 1);
        return true;
    },

    exec: function (str, opts) {
        if (!opts) {
            opts = {};
        }

        this.filters.forEach(function (f) {
            if (opts.filterlinks && !f.filterlinks) {
                return;
            }

            if (f.active) {
                str = f.exec(str);
            }
        });

        return str;
    }
};

function validateFilter(f) {
    if (typeof f.source !== "string" || typeof f.flags !== "string" ||
        typeof f.replace !== "string") {
        return false;
    }

    if (typeof f.name !== "string") {
        f.name = f.source;
    }

    f.replace = f.replace.substring(0, 1000);
    f.replace = XSS.sanitizeHTML(f.replace);
    f.flags = f.flags.substring(0, 4);

    try {
        new RegExp(f.source, f.flags);
    } catch (e) {
        return false;
    }

    var filter = new ChatFilter(f.name, f.source, f.flags, f.replace,
                                Boolean(f.active), Boolean(f.filterlinks));
    return filter;
}

const DEFAULT_FILTERS = [
    new ChatFilter("monospace", "`(.+?)`", "g", "<code>$1</code>"),
    new ChatFilter("bold", "\\*(.+?)\\*", "g", "<strong>$1</strong>"),
    new ChatFilter("italic", "_(.+?)_", "g", "<em>$1</em>"),
    new ChatFilter("strike", "~~(.+?)~~", "g", "<s>$1</s>"),
    new ChatFilter("inline spoiler", "\\[sp\\](.*?)\\[\\/sp\\]", "ig", "<span class=\"spoiler\">$1</span>")
];

function ChatFilterModule(channel) {
    ChannelModule.apply(this, arguments);
    this.filters = new FilterList(DEFAULT_FILTERS);
}

ChatFilterModule.prototype = Object.create(ChannelModule.prototype);

ChatFilterModule.prototype.load = function (data) {
    if ("filters" in data) {
        for (var i = 0; i < data.filters.length; i++) {
            var f = validateFilter(data.filters[i]);
            if (f) {
                this.filters.updateFilter(f);
            }
        }
    }
};

ChatFilterModule.prototype.save = function (data) {
    data.filters = this.filters.pack();
};

ChatFilterModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("updateFilter", this.handleUpdateFilter.bind(this, user));
    user.socket.on("importFilters", this.handleImportFilters.bind(this, user));
    user.socket.on("moveFilter", this.handleMoveFilter.bind(this, user));
    user.socket.on("removeFilter", this.handleRemoveFilter.bind(this, user));
    user.socket.on("requestChatFilters", this.handleRequestChatFilters.bind(this, user));
};

ChatFilterModule.prototype.sendChatFilters = function (users) {
    var f = this.filters.pack();
    var chan = this.channel;
    users.forEach(function (u) {
        if (chan.modules.permissions.canEditFilters(u)) {
            u.socket.emit("chatFilters", f);
        }
    });
};

ChatFilterModule.prototype.handleUpdateFilter = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditFilters(user)) {
        return;
    }

    var f = validateFilter(data);
    if (!f) {
        return;
    }
    data = f.pack();

    this.filters.updateFilter(f);
    var chan = this.channel;
    chan.users.forEach(function (u) {
        if (chan.modules.permissions.canEditFilters(u)) {
            u.socket.emit("updateChatFilter", data);
        }
    });

    chan.logger.log("[mod] " + user.getName() + " updated filter: " + f.name + " -> " +
                    "s/" + f.source + "/" + f.replace + "/" + f.flags + " active: " +
                    f.active + ", filterlinks: " + f.filterlinks);
};

ChatFilterModule.prototype.handleImportFilters = function (user, data) {
    if (!(data instanceof Array)) {
        return;
    }

    /* Note: importing requires a different permission node than simply
       updating/removing */
    if (!this.channel.modules.permissions.canImportFilters(u)) {
        return;
    }

    this.filters.importList(data.map(validateFilter).filter(function (f) {
        return f !== false;
    }));
    this.sendChatFilters(this.channel.users);
};

ChatFilterModule.prototype.handleRemoveFilter = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditFilters(u)) {
        return;
    }

    if (typeof data.name !== "string") {
        return;
    }

    this.filters.removeFilter(data);
    this.channel.logger.log("[mod] " + user.getName() + " removed filter: " + f.name);
};

ChatFilterModule.prototype.handleMoveFilter = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditFilters(u)) {
        return;
    }

    if (typeof data.to !== "number" || typeof data.from !== "number") {
        return;
    }

    this.filters.moveFilter(data.from, data.to);
};

ChatFilterModule.prototype.handleRequestChatFilters = function (user) {
    this.sendChatFilters([user]);
};

module.exports = ChatFilterModule;
