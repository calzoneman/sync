function CustomizationModule(channel) {
    this.channel = channel;
    this.css = "";
    this.js = "";
    this.motd = {
        motd: "",
        html: ""
    };
}

CustomizationModule.prototype.load = function (data) {
    if ("css" in data) {
        this.css = data.css;
    }

    if ("js" in data) {
        this.js = data.js;
    }

    if ("motd" in data) {
        this.motd = {
            motd: data.motd.motd || "",
            html: data.motd.html || ""
        };
    }
};

CustomizationModule.prototype.save = function (data) {
    data.css = this.css;
    data.js = this.js;
    data.motd = this.motd;
};

CustomizationModule.prototype.postJoin = function (user) {
    this.sendCSSJS([user]);
    this.sendMOTD([user]);
};

CustomizationModule.prototype.sendCSSJS = function (users) {
    var data = {
        css: this.css,
        js: this.js
    };
    users.forEach(function (u) {
        u.socket.emit("channelCSSJS", data);
    });
};

CustomizationModule.prototype.sendMOTD = function (users) {
    var data = this.motd;
    users.forEach(function (u) {
        u.socket.emit("setMotd", data);
    });
};

CustomizationModule.prototype.handleSetCSS = function (user, data) {
    if (!this.getPermissions().canSetCSS(user)) {
        user.kick("Attempted setChannelCSS as non-admin");
        return;
    }

    if (typeof data !== "object" || typeof data.css !== "string") {
        return;
    }

    this.css = data.css.substring(0, 20000);
    this.sendCSSJS(this.channel.users);

    this.channel.logger.log("[mod] " + user.name + " updated the channel CSS");
};
