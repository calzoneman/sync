var util = require("./utilities");

function Media(id, title, seconds, type, meta) {
    if (!meta) {
        meta = {};
    }

    this.id = id;
    this.title = title;
    if (this.title.length > 100) {
        this.title = this.title.substring(0, 97) + "...";
    }

    this.seconds = seconds === "--:--" ? 0 : parseInt(seconds);
    this.duration = util.formatTime(seconds);
    this.type = type;
    this.meta = meta;
    this.currentTime = 0;
    this.paused = false;
}

Media.prototype = {
    pack: function () {
        return {
            id: this.id,
            title: this.title,
            seconds: this.seconds,
            duration: this.duration,
            type: this.type,
            meta: {
                object: this.meta.object,
                params: this.meta.params,
                direct: this.meta.direct,
                restricted: this.meta.restricted
            }
        };
    },

    getTimeUpdate: function () {
        return {
            currentTime: this.currentTime,
            paused: this.paused
        };
    },

    getFullUpdate: function () {
        var packed = this.pack();
        packed.currentTime = this.currentTime;
        packed.paused = this.paused;
        return packed;
    },

    reset: function () {
        this.currentTime = 0;
        this.paused = false;
    }
};

module.exports = Media;
