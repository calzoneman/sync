function ChatFilter(name, regex, flags, replace, active, filterlinks) {
    this.name = name;
    this.source = regex;
    this.flags = flags;
    this.regex = new RegExp(source, flags);
    this.replace = replace;
    this.active = active;
    this.filterlinks = filterlinks;
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
        return new Filter(f.name, f.source, f.flags, f.replace, f.active, f.filterlinks);
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
        to = to > from ? to + 1 : to;
        from = to > from ? from : from + 1;

        this.filters.splice(to, 0, f);
        this.filters.splice(from, 1);
        return true;
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

module.exports = {
    ChatFilter: ChatFilter,
    FilterList: FilterList,
    validateFilter: validateFilter
};
