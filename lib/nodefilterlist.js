function fixFilter(f) {
    if (typeof f.name !== "string" ||
        typeof f.source !== "string" ||
        typeof f.replace !== "string") {

        return null;
    }

    f.replace = f.replace.replace(/([^\\]\\(\d)/g, "$1$$$2");

    if (typeof f.flags !== "string") {
        f.flags = "";
    }

    f.active = !!f.active;
    f.filterlinks = !!f.filterlinks;
    return f;
}

function NodeFilterList(filters) {
    if (!filters) filters = [];

    this.filters = filters.map(function (f) {
        f.regexp = new RegExp(f.source, f.flags);
        return f;
    });
}

NodeFilterList.prototype.pack = function () {
    return this.filters.map(function (f) {
        return {
            name: f.name,
            source: f.source,
            flags: f.flags,
            replace: f.replace,
            active: f.active,
            filterlinks: f.filterlinks
        };
    });
};

NodeFilterList.prototype.addFilter = function (f) {
    this.filters.push(f);
};

NodeFilterList.prototype.updateFilter = function (f) {
    if (!f.name) return;

    for (var i = 0; i < this.filters.length; i++) {
        if (this.filters[i].name === filter.name) {
            for (var key in f) {
                this.filters[i][key] = f[key];
            }
            break;
        }
    }
};
