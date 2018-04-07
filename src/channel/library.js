var ChannelModule = require("./module");
var Flags = require("../flags");
var util = require("../utilities");
var InfoGetter = require("../get-info");
var db = require("../database");
var Media = require("../media");
const LOGGER = require('@calzoneman/jsli')('channel/library');

const TYPE_UNCACHE = {
    id: "string"
};

const TYPE_SEARCH_MEDIA = {
    source: "string,optional",
    query: "string"
};

function LibraryModule(_channel) {
    ChannelModule.apply(this, arguments);
}

LibraryModule.prototype = Object.create(ChannelModule.prototype);

LibraryModule.prototype.onUserPostJoin = function (user) {
    user.socket.typecheckedOn("uncache", TYPE_UNCACHE, this.handleUncache.bind(this, user));
    user.socket.typecheckedOn("searchMedia", TYPE_SEARCH_MEDIA, this.handleSearchMedia.bind(this, user));
};

LibraryModule.prototype.cacheMedia = function (media) {
    if (this.channel.is(Flags.C_REGISTERED) && !util.isLive(media.type)) {
        db.channels.addToLibrary(this.channel.name, media);
    }
};

LibraryModule.prototype.cacheMediaList = function (list) {
    if (this.channel.is(Flags.C_REGISTERED)) {
        LOGGER.info(
            'Saving %d items to library for %s',
            list.length,
            this.channel.name
        );
        db.channels.addListToLibrary(this.channel.name, list).catch(error => {
            LOGGER.error('Failed to add list to library: %s', error.stack);
        });
    }
};

LibraryModule.prototype.getItem = function (id, cb) {
    db.channels.getLibraryItem(this.channel.name, id, function (err, row) {
        if (err) {
            cb(err, null);
        } else {
            var meta = JSON.parse(row.meta || "{}");
            cb(null, new Media(row.id, row.title, row.seconds, row.type, meta));
        }
    });
};

LibraryModule.prototype.handleUncache = function (user, data) {
    if (!this.channel.is(Flags.C_REGISTERED)) {
        return;
    }

    if (!this.channel.modules.permissions.canUncache(user)) {
        return;
    }

    const chan = this.channel;
    chan.refCounter.ref("LibraryModule::handleUncache");
    db.channels.deleteFromLibrary(chan.name, data.id, function (err, _res) {
        if (chan.dead) {
            return;
        } else if (err) {
            chan.refCounter.unref("LibraryModule::handleUncache");
            return;
        }

        chan.logger.log("[library] " + user.getName() + " deleted " + data.id +
                        "from the library");
        chan.refCounter.unref("LibraryModule::handleUncache");
    });
};

LibraryModule.prototype.handleSearchMedia = function (user, data) {
    var query = data.query.substring(0, 100);
    var searchYT = function () {
        InfoGetter.Getters.ytSearch(query, function (e, vids) {
            if (!e) {
                user.socket.emit("searchResults", {
                    source: "yt",
                    results: vids
                });
            }
        });
    };

    if (data.source === "yt" || !this.channel.is(Flags.C_REGISTERED) ||
        !this.channel.modules.permissions.canSeePlaylist(user)) {
        searchYT();
    } else {
        db.channels.searchLibrary(this.channel.name, query, function (err, res) {
            if (err) {
                res = [];
            }

            if (res.length === 0) {
                return searchYT();
            }

            res.sort(function (a, b) {
                var x = a.title.toLowerCase();
                var y = b.title.toLowerCase();
                return (x === y) ? 0 : (x < y ? -1 : 1);
            });

            res.forEach(function (r) {
                r.duration = util.formatTime(r.seconds);
            });

            user.socket.emit("searchResults", {
                source: "library",
                results: res
            });
        });
    }
};

module.exports = LibraryModule;
