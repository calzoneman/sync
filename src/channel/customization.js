const ChannelModule = require("./module");
const XSS = require("../xss");
const { hash } = require('../util/hash');

const TYPE_SETCSS = {
    css: "string"
};

const TYPE_SETJS = {
    js: "string"
};

const TYPE_SETMOTD = {
    motd: "string"
};

function CustomizationModule(_channel) {
    ChannelModule.apply(this, arguments);
    this.css = "";
    this.js = "";
    this.motd = "";
    this.supportsDirtyCheck = true;
}

CustomizationModule.prototype = Object.create(ChannelModule.prototype);

Object.defineProperty(CustomizationModule.prototype, 'css', {
    get() {
        return this._css;
    },

    set(val) {
        this._css = val;
        this.cssHash = hash('md5', val, 'base64');
    }
});

Object.defineProperty(CustomizationModule.prototype, 'js', {
    get() {
        return this._js;
    },

    set(val) {
        this._js = val;
        this.jsHash = hash('md5', val, 'base64');
    }
});

CustomizationModule.prototype.load = function (data) {
    if ("css" in data) {
        this.css = data.css;
    }

    if ("js" in data) {
        this.js = data.js;
    }

    if ("motd" in data) {
        if (typeof data.motd === "object" && data.motd.motd) {
            // Old style MOTD, convert to new
            this.motd = XSS.sanitizeHTML(data.motd.motd).replace(
                /\n/g, "<br>\n");
        } else if (typeof data.motd === "string") {
            // The MOTD is filtered before it is saved, however it is also
            // re-filtered on load in case the filtering rules change
            this.motd = XSS.sanitizeHTML(data.motd);
        }
    }

    this.dirty = false;
};

CustomizationModule.prototype.save = function (data) {
    data.css = this.css;
    data.js = this.js;
    data.motd = this.motd;
};

CustomizationModule.prototype.setMotd = function (motd) {
    this.motd = XSS.sanitizeHTML(motd);
    this.sendMotd(this.channel.users);
};

CustomizationModule.prototype.onUserPostJoin = function (user) {
    this.sendCSSJS([user]);
    this.sendMotd([user]);
    user.socket.typecheckedOn("setChannelCSS", TYPE_SETCSS, this.handleSetCSS.bind(this, user));
    user.socket.typecheckedOn("setChannelJS", TYPE_SETJS, this.handleSetJS.bind(this, user));
    user.socket.typecheckedOn("setMotd", TYPE_SETMOTD, this.handleSetMotd.bind(this, user));
};

CustomizationModule.prototype.sendCSSJS = function (users) {
    var data = {
        css: this.css,
        cssHash: this.cssHash,
        js: this.js,
        jsHash: this.jsHash
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

    let oldHash = this.cssHash;
    // TODO: consider sending back an error instead of silently truncating
    this.css = data.css.substring(0, 20000);

    if (oldHash !== this.cssHash) {
        this.dirty = true;
        this.sendCSSJS(this.channel.users);
        this.channel.logger.log("[mod] " + user.getName() + " updated the channel CSS");
    }
};

CustomizationModule.prototype.handleSetJS = function (user, data) {
    if (!this.channel.modules.permissions.canSetJS(user)) {
        user.kick("Attempted setChannelJS as non-admin");
        return;
    }

    let oldHash = this.jsHash;
    this.js = data.js.substring(0, 20000);

    if (oldHash !== this.jsHash) {
        this.dirty = true;
        this.sendCSSJS(this.channel.users);
        this.channel.logger.log("[mod] " + user.getName() + " updated the channel JS");
    }
};

CustomizationModule.prototype.handleSetMotd = function (user, data) {
    if (!this.channel.modules.permissions.canEditMotd(user)) {
        user.kick("Attempted setMotd with insufficient permission");
        return;
    }

    var motd = data.motd.substring(0, 20000);

    this.dirty = true;
    this.setMotd(motd);
    this.channel.logger.log("[mod] " + user.getName() + " updated the MOTD");
};

module.exports = CustomizationModule;
