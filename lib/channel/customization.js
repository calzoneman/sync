var ChannelModule = require("./module");
var XSS = require("../xss");

function CustomizationModule(channel) {
    ChannelModule.apply(this, arguments);
    this.css = "";
    this.js = "";
    this.motd = {
        motd: "",
        html: ""
    };
}

CustomizationModule.prototype = Object.create(ChannelModule.prototype);

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

CustomizationModule.prototype.setMotd = function (motd) {
    motd = XSS.sanitizeHTML(motd);
    var html = motd.replace(/\n/g, "<br>");
    this.motd = {
        motd: motd,
        html: html
    };
    this.sendMotd(this.channel.users);
};

CustomizationModule.prototype.onUserPostJoin = function (user) {
    this.sendCSSJS([user]);
    this.sendMotd([user]);
    user.socket.on("setChannelCSS", this.handleSetCSS.bind(this, user));
    user.socket.on("setChannelJS", this.handleSetJS.bind(this, user));
    user.socket.on("setMotd", this.handleSetMotd.bind(this, user));
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

CustomizationModule.prototype.sendMotd = function (users) {
    var data = this.motd;
    users.forEach(function (u) {
        u.socket.emit("setMotd", data);
    });
};

CustomizationModule.prototype.handleSetCSS = function (user, data) {
    if (!this.channel.modules.permissions.canSetCSS(user)) {
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

CustomizationModule.prototype.handleSetJS = function (user, data) {
    if (!this.channel.modules.permissions.canSetJS(user)) {
        user.kick("Attempted setChannelJS as non-admin");
        return;
    }

    if (typeof data !== "object" || typeof data.js !== "string") {
        return;
    }

    this.js = data.js.substring(0, 20000);
    this.sendCSSJS(this.channel.users);

    this.channel.logger.log("[mod] " + user.name + " updated the channel JS");
};

CustomizationModule.prototype.handleSetMotd = function (user, data) {
    if (!this.channel.modules.permissions.canEditMotd(user)) {
        user.kick("Attempted setMotd with insufficient permission");
        return;
    }

    if (typeof data.motd !== "string") {
        return;
    }
    var motd = data.motd.substring(0, 20000);

    this.setMotd(motd);
    this.logger.log("[mod] " + user.name + " updated the MOTD");
};

module.exports = CustomizationModule;
