function ChannelOptionsModule(channel) {
    this.channel = channel;
    this.opts = {
        allow_voteskip: true, // Allow users to voteskip
        voteskip_ratio: 0.5, // Ratio of skip votes:non-afk users needed to skip the video
        afk_timeout: 600, // Number of seconds before a user is automatically marked afk
        pagetitle: self.name, // Title of the browser tab
        maxlength: 0, // Maximum length (in seconds) of a video queued
        externalcss: "", // Link to external stylesheet
        externaljs: "", // Link to external script
        chat_antiflood: false, // Throttle chat messages
        chat_antiflood_params: {
            burst: 4, // Number of messages to allow with no throttling
            sustained: 1, // Throttle rate (messages/second)
            cooldown: 4 // Number of seconds with no messages before burst is reset
        },
        show_public: false, // List the channel on the index page
        enable_link_regex: true, // Use the built-in link filter
        password: false // Channel password (false -> no password required for entry)
    };
}

ChannelOptionsModule.prototype.load = function (data) {
    for (var key in this.opts) {
        if (key in data.opts) {
            this.opts[key] = data.opts[key];
        }
    }
};

ChannelOptionsModule.prototype.initUser = function (user) {
    user.socket.on("setOptions", this.handleSetOptions.bind(this, user));
};

ChannelOptionsModule.prototype.handleSetOptions = function (user, data) {
    if (typeof data !== "object") {
        return;
    }
};
