var FilterList = require("cytubefilters");
var ChannelModule = require("./module");
var XSS = require("../xss");
var Logger = require("../logger");

/*
 * Converts JavaScript-style replacements ($1, $2, etc.) with
 * PCRE-style (\1, \2, etc.)
 */
function fixReplace(replace) {
    return replace.replace(/\$(\d)/g, "\\$1");
}

function validateFilter(f) {
    if (typeof f.source !== "string" || typeof f.flags !== "string" ||
        typeof f.replace !== "string") {
        return null;
    }

    if (typeof f.name !== "string") {
        f.name = f.source;
    }

    f.replace = fixReplace(f.replace.substring(0, 1000));
    f.replace = XSS.sanitizeHTML(f.replace);
    f.flags = f.flags.substring(0, 4);

    try {
        FilterList.checkValidRegex(f.source);
    } catch (e) {
        return null;
    }

    var filter = {
        name: f.name,
        source: f.source,
        replace: fixReplace(f.replace),
        flags: f.flags,
        active: !!f.active,
        filterlinks: !!f.filterlinks
    };

    return filter;
}

function makeDefaultFilter(name, source, flags, replace) {
    return {
        name: name,
        source: source,
        flags: flags,
        replace: replace,
        active: true,
        filterlinks: false
    };
}

const DEFAULT_FILTERS = [
    makeDefaultFilter("monospace", "`(.+?)`", "g", "<code>\\1</code>"),
    makeDefaultFilter("bold", "\\*(.+?)\\*", "g", "<strong>\\1</strong>"),
    makeDefaultFilter("italic", "_(.+?)_", "g", "<em>\\1</em>"),
    makeDefaultFilter("strike", "~~(.+?)~~", "g", "<s>\\1</s>"),
    makeDefaultFilter("inline spoiler", "\\[sp\\](.*?)\\[\\/sp\\]", "ig",
        "<span class=\"spoiler\">\\1</span>")
];

function ChatFilterModule(channel) {
    ChannelModule.apply(this, arguments);
    this.filters = new FilterList();
}

ChatFilterModule.prototype = Object.create(ChannelModule.prototype);

ChatFilterModule.prototype.load = function (data) {
    if ("filters" in data) {
        var filters = data.filters.map(validateFilter).filter(function (f) {
            return f !== null;
        });
        try {
            this.filters = new FilterList(filters);
        } catch (e) {
            Logger.errlog.log("Filter load failed: " + e + " (channel:" +
                this.channel.name);
            this.channel.logger.log("Failed to load filters: " + e);
        }
    } else {
        this.filters = new FilterList(DEFAULT_FILTERS);
    }
};

ChatFilterModule.prototype.save = function (data) {
    data.filters = this.filters.pack();
};

ChatFilterModule.prototype.packInfo = function (data, isAdmin) {
    if (isAdmin) {
        data.chatFilterCount = this.filters.length;
    }
};

ChatFilterModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("addFilter", this.handleAddFilter.bind(this, user));
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

ChatFilterModule.prototype.handleAddFilter = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditFilters(user)) {
        return;
    }

    try {
        FilterList.checkValidRegex(data.source);
    } catch (e) {
        user.socket.emit("errorMsg", {
            msg: "Invalid regex: " + e.message,
            alert: true
        });
        return;
    }

    data = validateFilter(data);
    if (!data) {
        return;
    }

    try {
        this.filters.addFilter(data);
    } catch (e) {
        user.socket.emit("errorMsg", {
            msg: "Filter add failed: " + e.message,
            alert: true
        });
        return;
    }

    user.socket.emit("addFilterSuccess");

    var chan = this.channel;
    chan.users.forEach(function (u) {
        if (chan.modules.permissions.canEditFilters(u)) {
            u.socket.emit("updateChatFilter", data);
        }
    });

    chan.logger.log("[mod] " + user.getName() + " added filter: " + data.name + " -> " +
                    "s/" + data.source + "/" + data.replace + "/" + data.flags +
                    " active: " + data.active + ", filterlinks: " + data.filterlinks);
};

ChatFilterModule.prototype.handleUpdateFilter = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditFilters(user)) {
        return;
    }

    try {
        FilterList.checkValidRegex(data.source);
    } catch (e) {
        user.socket.emit("errorMsg", {
            msg: "Invalid regex: " + e.message,
            alert: true
        });
        return;
    }

    data = validateFilter(data);
    if (!data) {
        return;
    }

    try {
        this.filters.updateFilter(data);
    } catch (e) {
        user.socket.emit("errorMsg", {
            msg: "Filter update failed: " + e.message,
            alert: true
        });
        return;
    }

    var chan = this.channel;
    chan.users.forEach(function (u) {
        if (chan.modules.permissions.canEditFilters(u)) {
            u.socket.emit("updateChatFilter", data);
        }
    });

    chan.logger.log("[mod] " + user.getName() + " updated filter: " + data.name + " -> " +
                    "s/" + data.source + "/" + data.replace + "/" + data.flags +
                    " active: " + data.active + ", filterlinks: " + data.filterlinks);
};

ChatFilterModule.prototype.handleImportFilters = function (user, data) {
    if (!(data instanceof Array)) {
        return;
    }

    /* Note: importing requires a different permission node than simply
       updating/removing */
    if (!this.channel.modules.permissions.canImportFilters(user)) {
        return;
    }

    try {
        this.filters = new FilterList(data.map(validateFilter).filter(function (f) {
            return f !== null;
        }));
    } catch (e) {
        user.socket.emit("errorMsg", {
            msg: "Filter import failed: " + e.message,
            alert: true
        });
        return;
    }

    this.channel.logger.log("[mod] " + user.getName() + " imported the filter list");
    this.sendChatFilters(this.channel.users);
};

ChatFilterModule.prototype.handleRemoveFilter = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditFilters(user)) {
        return;
    }

    if (typeof data.name !== "string") {
        return;
    }

    try {
        this.filters.removeFilter(data);
    } catch (e) {
        user.socket.emit("errorMsg", {
            msg: "Filter removal failed: " + e.message,
            alert: true
        });
        return;
    }
    var chan = this.channel;
    chan.users.forEach(function (u) {
        if (chan.modules.permissions.canEditFilters(u)) {
            u.socket.emit("deleteChatFilter", data);
        }
    });

    this.channel.logger.log("[mod] " + user.getName() + " removed filter: " + data.name);
};

ChatFilterModule.prototype.handleMoveFilter = function (user, data) {
    if (typeof data !== "object") {
        return;
    }

    if (!this.channel.modules.permissions.canEditFilters(user)) {
        return;
    }

    if (typeof data.to !== "number" || typeof data.from !== "number") {
        return;
    }

    try {
        this.filters.moveFilter(data.from, data.to);
    } catch (e) {
        user.socket.emit("errorMsg", {
            msg: "Filter move failed: " + e.message,
            alert: true
        });
        return;
    }
};

ChatFilterModule.prototype.handleRequestChatFilters = function (user) {
    this.sendChatFilters([user]);
};

module.exports = ChatFilterModule;
