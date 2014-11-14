var FilterList = require("./channel/filters").FilterList;

function FilterWorker() {
    this.cache = {};
}

FilterWorker.prototype.cacheData = function (channel, filters, convertLinks) {
    this.cache[channel] = {
        filters: new FilterList(filters),
        convertLinks: convertLinks
    };
};

FilterWorker.prototype.removeData = function (channel) {
    if (this.cache.hasOwnProperty(channel)) {
        delete this.cache[channel];
    }
};

FilterWorker.prototype.hasData = function (channel) {
    return this.cache.hasOwnProperty(channel);
};

const link = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;
FilterWorker.prototype.filterMessage = function (channel, msg) {
    if (!this.hasData(channel)) {
        throw new Error("Missing channel data");
    }

    var parts = msg.split(link);
    var filters = this.cache[channel].filters;
    var convertLinks = this.cache[channel].convertLinks;

    for (var j = 0; j < parts.length; j++) {
        /* substring is a URL */
        if (convertLinks && parts[j].match(link)) {
            var original = parts[j];
            parts[j] = filters.exec(parts[j], { filterlinks: true });

            /* no filters changed the URL, apply link filter */
            if (parts[j] === original) {
                parts[j] = url.format(url.parse(parts[j]));
                parts[j] = parts[j].replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");
            }

        } else {
            /* substring is not a URL */
            parts[j] = filters.exec(parts[j], { filterlinks: false });
        }
    }

    msg = parts.join("");
};

var procWorker = new FilterWorker();
process.on("message", function (data) {
    if (data.cmd === "addChannel") {
        procWorker.cacheData(data.channel.toLowerCase(), data.filters, data.convertLinks);
    } else if (data.cmd === "delChannel") {
        procWorker.removeData(data.channel.toLowerCase());
    } else if (data.cmd === "filter") {
        try {
            var filtered = procWorker.filterMessage(data.channel.toLowerCase(), data.message);
            process.send({
                cmd: "filterResult",
                id: data.id,
                message: filtered
            });
        } catch (err) {
            if (err.message === "Missing channel data") {
                process.send({
                    cmd: "needFilterData",
                    id: data.id
                });
            } else {
                process.send({
                    cmd: "filterResult",
                    id: data.id,
                    error: err
                });
            }
        }
    }
});
