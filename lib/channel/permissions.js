const DEFAULT_PERMISSIONS = {
    seeplaylist: -1, // See the playlist
    playlistadd: 1.5, // Add video to the playlist
    playlistnext: 1.5, // Add a video next on the playlist
    playlistmove: 1.5, // Move a video on the playlist
    playlistdelete: 2, // Delete a video from the playlist
    playlistjump: 1.5, // Start a different video on the playlist
    playlistaddlist: 1.5, // Add a list of videos to the playlist
    oplaylistadd: -1, // Same as above, but for open (unlocked) playlist
    oplaylistnext: 1.5,
    oplaylistmove: 1.5,
    oplaylistdelete: 2,
    oplaylistjump: 1.5,
    oplaylistaddlist: 1.5,
    playlistaddcustom: 3, // Add custom embed to the playlist
    playlistaddlive: 1.5, // Add a livestream to the playlist
    exceedmaxlength: 2, // Add a video longer than the maximum length set
    addnontemp: 2, // Add a permanent video to the playlist
    settemp: 2, // Toggle temporary status of a playlist item
    playlistshuffle: 2, // Shuffle the playlist
    playlistclear: 2, // Clear the playlist
    pollctl: 1.5, // Open/close polls
    pollvote: -1, // Vote in polls
    viewhiddenpoll: 1.5, // View results of hidden polls
    voteskip: -1, // Vote to skip the current video
    mute: 1.5, // Mute other users
    kick: 1.5, // Kick other users
    ban: 2, // Ban other users
    motdedit: 3, // Edit the MOTD
    filteredit: 3, // Control chat filters
    filterimport: 3, // Import chat filter list
    emoteedit: 3, // Control emotes
    emoteimport: 3, // Import emote list
    playlistlock: 2, // Lock/unlock the playlist
    leaderctl: 2, // Give/take leader
    drink: 1.5, // Use the /d command
    chat: 0 // Send chat messages
};

function PermissionSet(preset) {
    preset = preset || {};
    this.loadPreset(preset);
    this.openPlaylist = false;
}

PermissionSet.prototype = {
    loadPreset: function (preset) {
        this.permissions = {};
        for (var key in DEFAULT_PERMISSIONS) {
            if (key in preset) {
                this.permissions[key] = preset[key];
            } else {
                this.permissions[key] = DEFAULT_PERMISSIONS[key];
            }
        }
    },

    hasPermission: function (account, node) {
        if (node.indexOf("playlist") === 0 && this.openPlaylist &&
            account.getEffectiveRank() >= this.permissions["o"+node]) {
            return true;
        }

        return account.getEffectiveRank() >= this.permissions[node];
    },

    canAddVideo: function (account, data) {
        if (!this.hasPermission(account, "playlistadd")) {
            return false;
        }

        if (data.pos === "next" && !this.hasPermission(account, "playlistaddnext")) {
            return false;
        }

        if (util.isLive(data.type) && !this.hasPermission(account, "playlistaddlive")) {
            return false;
        }

        if (data.type === "cu" && !this.hasPermission(account, "playlistaddcustom")) {
            return false;
        }

        return true;
    },

    canMoveVideo: function (account) {
        return this.hasPermission(account, "playlistmove");
    },

    canDeleteVideo: function (account) {
        return this.hasPermission(account, "playlistdelete")
    },

    canSkipVideo: function (account) {
        return this.hasPermission(account, "playlistjump");
    },

    canToggleTemporary: function (account) {
        return this.hasPermission(account, "settemp");
    },

    canExceedMaxLength: function (account) {
        return this.hasPermission(account, "exceedmaxlength");
    },

    canShufflePlaylist: function (account) {
        return this.hasPermission(account, "playlistshuffle");
    },

    canClearPlaylist: function (account) {
        return this.hasPermission(account, "playlistclear");
    },

    canLockPlaylist: function (account) {
        return this.hasPermission(account, "playlistlock");
    },

    canAssignLeader: function (account) {
        return this.hasPermission(account, "leaderctl");
    },

    canControlPoll: function (account) {
        return this.hasPermission(account, "pollctl");
    },

    canVote: function (account) {
        return this.hasPermission(account, "pollvote");
    },

    canViewHiddenPoll: function (account) {
        return this.hasPermission(account, "viewhiddenpoll");
    },

    canVoteskip: function (account) {
        return this.hasPermission(account, "voteskip");
    },

    canMute: function (actor, receiver) {
        if (!this.hasPermission(actor, "mute")) {
            return false;
        }

        return actor.getEffectiveRank() > receiver.getEffectiveRank();
    },

    canKick: function (actor, receiver) {
        if (!this.hasPermission(actor, "kick")) {
            return false;
        }

        return actor.getEffectiveRank() > receiver.getEffectiveRank();
    },

    canEditMotd: function (actor) {
        return this.hasPermission(actor, "motdedit");
    },

    canEditFilters: function (actor) {
        return this.hasPermission(actor, "filteredit");
    },

    canImportFilters: function (actor) {
        return this.hasPermission(actor, "filterimport");
    },

    canEditEmotes: function (actor) {
        return this.hasPermission(actor, "emoteedit");
    },

    canImportEmotes: function (actor) {
        return this.hasPermission(actor, "emoteimport");
    },

    canCallDrink: function (actor) {
        return this.hasPermission(actor, "drink");
    },

    canChat: function (actor) {
        return this.hasPermission(actor, "chat");
    }
};

module.exports = PermissionSet;