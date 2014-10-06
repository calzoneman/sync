var ChannelModule = require("./module");
var User = require("../user");

const DEFAULT_PERMISSIONS = {
    seeplaylist: -1,          // See the playlist
    playlistadd: 1.5,         // Add video to the playlist
    playlistnext: 1.5,        // Add a video next on the playlist
    playlistmove: 1.5,        // Move a video on the playlist
    playlistdelete: 2,        // Delete a video from the playlist
    playlistjump: 1.5,        // Start a different video on the playlist
    playlistaddlist: 1.5,     // Add a list of videos to the playlist
    oplaylistadd: -1,         // Same as above, but for open (unlocked) playlist
    oplaylistnext: 1.5,
    oplaylistmove: 1.5,
    oplaylistdelete: 2,
    oplaylistjump: 1.5,
    oplaylistaddlist: 1.5,
    playlistaddcustom: 3,     // Add custom embed to the playlist
    playlistaddrawfile: 2,    // Add raw file to the playlist
    playlistaddlive: 1.5,     // Add a livestream to the playlist
    exceedmaxlength: 2,       // Add a video longer than the maximum length set
    addnontemp: 2,            // Add a permanent video to the playlist
    settemp: 2,               // Toggle temporary status of a playlist item
    playlistshuffle: 2,       // Shuffle the playlist
    playlistclear: 2,         // Clear the playlist
    pollctl: 1.5,             // Open/close polls
    pollvote: -1,             // Vote in polls
    viewhiddenpoll: 1.5,      // View results of hidden polls
    voteskip: -1,             // Vote to skip the current video
    viewvoteskip: 1.5,        // View voteskip results
    mute: 1.5,                // Mute other users
    kick: 1.5,                // Kick other users
    ban: 2,                   // Ban other users
    motdedit: 3,              // Edit the MOTD
    filteredit: 3,            // Control chat filters
    filterimport: 3,          // Import chat filter list
    emoteedit: 3,             // Control emotes
    emoteimport: 3,           // Import emote list
    playlistlock: 2,          // Lock/unlock the playlist
    leaderctl: 2,             // Give/take leader
    drink: 1.5,               // Use the /d command
    chat: 0,                  // Send chat messages
    chatclear: 2,             // Use the /clear command
    exceedmaxitems: 2         // Exceed maximum items per user limit
};

function PermissionsModule(channel) {
    ChannelModule.apply(this, arguments);
    this.permissions = {};
    this.openPlaylist = false;
}

PermissionsModule.prototype = Object.create(ChannelModule.prototype);

PermissionsModule.prototype.load = function (data) {
    this.permissions = {};
    var preset = "permissions" in data ? data.permissions : {};
    for (var key in DEFAULT_PERMISSIONS) {
        if (key in preset) {
            this.permissions[key] = preset[key];
        } else {
            this.permissions[key] = DEFAULT_PERMISSIONS[key];
        }
    }

    if ("openPlaylist" in data) {
        this.openPlaylist = data.openPlaylist;
    } else if ("playlistLock" in data) {
        this.openPlaylist = !data.playlistLock;
    }
};

PermissionsModule.prototype.save = function (data) {
    data.permissions = this.permissions;
    data.openPlaylist = this.openPlaylist;
};

PermissionsModule.prototype.hasPermission = function (account, node) {
    if (account instanceof User) {
        account = account.account;
    }

    if (node.indexOf("playlist") === 0 && this.openPlaylist &&
        account.effectiveRank >= this.permissions["o"+node]) {
        return true;
    }

    return account.effectiveRank >= this.permissions[node];
};

PermissionsModule.prototype.sendPermissions = function (users) {
    var perms = this.permissions;
    if (users === this.channel.users) {
        this.channel.broadcastAll("setPermissions", perms);
    } else {
        users.forEach(function (u) {
            u.socket.emit("setPermissions", perms);
        });
    }
};

PermissionsModule.prototype.sendPlaylistLock = function (users) {
    if (users === this.channel.users) {
        this.channel.broadcastAll("setPlaylistLocked", !this.openPlaylist);
    } else {
        var locked = !this.openPlaylist;
        users.forEach(function (u) {
            u.socket.emit("setPlaylistLocked", locked);
        });
    }
};

PermissionsModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("setPermissions", this.handleSetPermissions.bind(this, user));
    user.socket.on("togglePlaylistLock", this.handleTogglePlaylistLock.bind(this, user));
    this.sendPermissions([user]);
    this.sendPlaylistLock([user]);
};

PermissionsModule.prototype.handleTogglePlaylistLock = function (user) {
    if (!this.hasPermission(user, "playlistlock")) {
        return;
    }

    this.openPlaylist = !this.openPlaylist;
    if (this.openPlaylist) {
        this.channel.logger.log("[playlist] " + user.getName() + " unlocked the playlist");
    } else {
        this.channel.logger.log("[playlist] " + user.getName() + " locked the playlist");
    }

    this.sendPlaylistLock(this.channel.users);
};

PermissionsModule.prototype.handleSetPermissions = function (user, perms) {
    if (typeof perms !== "object") {
        return;
    }

    if (!this.canSetPermissions(user)) {
        user.kick("Attempted setPermissions as a non-admin");
        return;
    }

    for (var key in perms) {
        if (typeof perms[key] !== "number") {
            perms[key] = parseFloat(perms[key]);
            if (isNaN(perms[key])) {
                delete perms[key];
            }
        }
    }

    for (var key in perms) {
        if (key in this.permissions) {
            this.permissions[key] = perms[key];
        }
    }

    if ("seeplaylist" in perms) {
        if (this.channel.modules.playlist) {
            this.channel.modules.playlist.sendPlaylist(this.channel.users);
        }
    }

    this.channel.logger.log("[mod] " + user.getName() + " updated permissions");
    this.sendPermissions(this.channel.users);
};

PermissionsModule.prototype.canAddVideo = function (account) {
    return this.hasPermission(account, "playlistadd");
};

PermissionsModule.prototype.canSetTemp = function (account) {
    return this.hasPermission(account, "settemp");
};

PermissionsModule.prototype.canSeePlaylist = function (account) {
    return this.hasPermission(account, "seeplaylist");
};

PermissionsModule.prototype.canAddList = function (account) {
    return this.hasPermission(account, "playlistaddlist");
};

PermissionsModule.prototype.canAddNonTemp = function (account) {
    return this.hasPermission(account, "addnontemp");
};

PermissionsModule.prototype.canAddNext = function (account) {
    return this.hasPermission(account, "playlistnext");
};

PermissionsModule.prototype.canAddLive = function (account) {
    return this.hasPermission(account, "playlistaddlive");
};

PermissionsModule.prototype.canAddCustom = function (account) {
    return this.hasPermission(account, "playlistaddcustom");
};

PermissionsModule.prototype.canAddRawFile = function (account) {
    return this.hasPermission(account, "playlistaddrawfile");
};

PermissionsModule.prototype.canMoveVideo = function (account) {
    return this.hasPermission(account, "playlistmove");
};

PermissionsModule.prototype.canDeleteVideo = function (account) {
    return this.hasPermission(account, "playlistdelete")
};

PermissionsModule.prototype.canSkipVideo = function (account) {
    return this.hasPermission(account, "playlistjump");
};

PermissionsModule.prototype.canToggleTemporary = function (account) {
    return this.hasPermission(account, "settemp");
};

PermissionsModule.prototype.canExceedMaxLength = function (account) {
    return this.hasPermission(account, "exceedmaxlength");
};

PermissionsModule.prototype.canShufflePlaylist = function (account) {
    return this.hasPermission(account, "playlistshuffle");
};

PermissionsModule.prototype.canClearPlaylist = function (account) {
    return this.hasPermission(account, "playlistclear");
};

PermissionsModule.prototype.canLockPlaylist = function (account) {
    return this.hasPermission(account, "playlistlock");
};

PermissionsModule.prototype.canAssignLeader = function (account) {
    return this.hasPermission(account, "leaderctl");
};

PermissionsModule.prototype.canControlPoll = function (account) {
    return this.hasPermission(account, "pollctl");
};

PermissionsModule.prototype.canVote = function (account) {
    return this.hasPermission(account, "pollvote");
};

PermissionsModule.prototype.canViewHiddenPoll = function (account) {
    return this.hasPermission(account, "viewhiddenpoll");
};

PermissionsModule.prototype.canVoteskip = function (account) {
    return this.hasPermission(account, "voteskip");
};

PermissionsModule.prototype.canSeeVoteskipResults = function (actor) {
    return this.hasPermission(actor, "viewvoteskip");
};

PermissionsModule.prototype.canMute = function (actor) {
    return this.hasPermission(actor, "mute");
};

PermissionsModule.prototype.canKick = function (actor) {
    return this.hasPermission(actor, "kick");
};

PermissionsModule.prototype.canBan = function (actor) {
    return this.hasPermission(actor, "ban");
};

PermissionsModule.prototype.canEditMotd = function (actor) {
    return this.hasPermission(actor, "motdedit");
};

PermissionsModule.prototype.canEditFilters = function (actor) {
    return this.hasPermission(actor, "filteredit");
};

PermissionsModule.prototype.canImportFilters = function (actor) {
    return this.hasPermission(actor, "filterimport");
};

PermissionsModule.prototype.canEditEmotes = function (actor) {
    return this.hasPermission(actor, "emoteedit");
};

PermissionsModule.prototype.canImportEmotes = function (actor) {
    return this.hasPermission(actor, "emoteimport");
};

PermissionsModule.prototype.canCallDrink = function (actor) {
    return this.hasPermission(actor, "drink");
};

PermissionsModule.prototype.canChat = function (actor) {
    return this.hasPermission(actor, "chat");
};

PermissionsModule.prototype.canClearChat = function (actor) {
    return this.hasPermission(actor, "chatclear");
};

PermissionsModule.prototype.canSetOptions = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 2;
};

PermissionsModule.prototype.canSetCSS = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 3;
};

PermissionsModule.prototype.canSetJS = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 3;
};

PermissionsModule.prototype.canSetPermissions = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 3;
};

PermissionsModule.prototype.canUncache = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 2;
};

PermissionsModule.prototype.canExceedMaxItemsPerUser = function (actor) {
    return this.hasPermission(actor, "exceedmaxitems");
};

PermissionsModule.prototype.loadUnregistered = function () {
    var perms = {
        seeplaylist: -1,
        playlistadd: -1,      // Add video to the playlist
        playlistnext: 0,
        playlistmove: 0,      // Move a video on the playlist
        playlistdelete: 0,    // Delete a video from the playlist
        playlistjump: 0,      // Start a different video on the playlist
        playlistaddlist: 0,   // Add a list of videos to the playlist
        oplaylistadd: -1,     // Same as above, but for open (unlocked) playlist
        oplaylistnext: 0,
        oplaylistmove: 0,
        oplaylistdelete: 0,
        oplaylistjump: 0,
        oplaylistaddlist: 0,
        playlistaddcustom: 0, // Add custom embed to the playlist
        playlistaddlive: 0,   // Add a livestream to the playlist
        exceedmaxlength: 0,   // Add a video longer than the maximum length set
        addnontemp: 0,        // Add a permanent video to the playlist
        settemp: 0,           // Toggle temporary status of a playlist item
        playlistshuffle: 0,   // Shuffle the playlist
        playlistclear: 0,     // Clear the playlist
        pollctl: 0,           // Open/close polls
        pollvote: -1,         // Vote in polls
        viewhiddenpoll: 1.5,  // View results of hidden polls
        voteskip: -1,         // Vote to skip the current video
        viewvoteskip: 1.5,    // View voteskip results
        playlistlock: 2,      // Lock/unlock the playlist
        leaderctl: 0,         // Give/take leader
        drink: 0,             // Use the /d command
        chat: 0,              // Send chat messages
        chatclear: 2,         // Use the /clear command
        exceedmaxitems: 2     // Exceed max items per user
    };

    for (var key in perms) {
        this.permissions[key] = perms[key];
    }

    this.openPlaylist = true;
};

module.exports = PermissionsModule;
