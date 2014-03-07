const SHADOW_TAG = "[shadow]";
const LINK = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;

function ChatManager(channel) {
    this.channel = channel;
    this.buffer = [];
    this.muted = new util.Set();
}

ChatManager.prototype = {
    isMuted: function (name) {
        return this.muted.contains(name.toLowerCase()) ||
               this.muted.contains(SHADOW_TAG + name.toLowerCase());
    },

    isShadowMuted: function (name) {
        return this.muted.contains(SHADOW_TAG + name.toLowerCase());
    },

    formatMessage: function (username, data) {
        data.msg = XSS.sanitizeText(data.msg);
        data.msg = this.filterMessage(data.msg);
        var obj = {
            username: username,
            msg: data.msg,
            meta: data.meta,
            time: Date.now()
        };

        return obj;
    },

    filterMessage: function (msg) {
        var chan = this.channel;
        var parts = msg.split(link);

        for (var j = 0; j < parts.length; j++) {
            // Case 1: The substring is a URL
            if (chan.opts.enable_link_regex && parts[j].match(link)) {
                var original = parts[j];
                parts[j] = chan.filterList.exec(parts[j], { filterlinks: true });

                // Unchanged, apply link filter
                if (parts[j] === original) {
                    parts[j] = url.format(url.parse(parts[j]));
                    parts[j] = parts[j].replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");
                }

            } else {
                // Substring is not a URL
                parts[j] = chan.filterList.exec(parts[j], { filterlinks: false });
            }
        }

        // Recombine the message
        return parts.join("");
    }
};
