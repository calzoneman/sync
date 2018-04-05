function ChannelModule(channel) {
    this.channel = channel;
    this.dirty = false;
    this.supportsDirtyCheck = false;
}

ChannelModule.prototype = {
    /**
     * Called when the channel is loading its data from a JSON object.
     */
    load: function (_data) {
    },

    /**
     * Called when the channel is saving its state to a JSON object.
     */
    save: function (_data) {
    },

    /**
     * Called when the channel is being unloaded
     */
    unload: function () {

    },

    /**
     * Called to pack info, e.g. for channel detail view
     */
    packInfo: function (_data, _isAdmin) {

    },

    /**
     * Called when a user is attempting to join a channel.
     *
     * data is the data sent by the client with the joinChannel
     * packet.
     */
    onUserPreJoin: function (_user, _data, cb) {
        cb(null, ChannelModule.PASSTHROUGH);
    },

    /**
     * Called after a user has been accepted to the channel.
     */
    onUserPostJoin: function (_user) {
    },

    /**
     * Called after a user has been disconnected from the channel.
     */
    onUserPart: function (_user) {
    },

    /**
     * Called when a chatMsg event is received
     */
    onUserPreChat: function (_user, _data, cb) {
        cb(null, ChannelModule.PASSTHROUGH);
    },

    /**
     * Called before a new video begins playing
     */
    onPreMediaChange: function (_data, cb) {
        cb(null, ChannelModule.PASSTHROUGH);
    },

    /**
     * Called when a new video begins playing
     */
    onMediaChange: function (_data) {

    },
};

/* Channel module callback return codes */
ChannelModule.ERROR = -1;
ChannelModule.PASSTHROUGH = 0;
ChannelModule.DENY = 1;

module.exports = ChannelModule;
