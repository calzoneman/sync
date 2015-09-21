var ChannelModule = require("./module");
var Flags = require("../flags");
var Poll = require("../poll").Poll;

function VoteskipModule(channel) {
    ChannelModule.apply(this, arguments);

    this.poll = false;
}

VoteskipModule.prototype = Object.create(ChannelModule.prototype);

VoteskipModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("voteskip", this.handleVoteskip.bind(this, user));
};

VoteskipModule.prototype.onUserPart = function(user) {
    if (!this.poll) {
        return;
    }

    this.unvote(user.realip);
    this.update();
};

VoteskipModule.prototype.handleVoteskip = function (user) {
    if (!this.channel.modules.options.get("allow_voteskip")) {
        return;
    }

    if (!this.channel.modules.playlist) {
        return;
    }

    if (!this.channel.modules.permissions.canVoteskip(user)) {
        return;
    }

    if (!this.poll) {
        this.poll = new Poll("[server]", "voteskip", ["skip"], false);
    }

    this.poll.vote(user.realip, 0);

    var title = "";
    if (this.channel.modules.playlist.current) {
        title = " " + this.channel.modules.playlist.current.media.title;
    }

    var name = user.getName() || "(anonymous)";

    this.channel.logger.log("[playlist] " + name + " voteskipped " + title);
    user.setAFK(false);
    this.update();
};

VoteskipModule.prototype.unvote = function(ip) {
    if (!this.poll) {
        return;
    }

    this.poll.unvote(ip);
};

VoteskipModule.prototype.update = function () {
    if (!this.channel.modules.options.get("allow_voteskip")) {
        return;
    }

    if (!this.poll) {
        return;
    }

    if (this.channel.modules.playlist.meta.count === 0) {
        return;
    }

    var max = this.calcVoteskipMax();
    var need = Math.ceil(max * this.channel.modules.options.get("voteskip_ratio"));
    if (this.poll.counts[0] >= need) {
        this.channel.logger.log("[playlist] Voteskip passed.");
        this.channel.modules.playlist._playNext();
    }

    this.sendVoteskipData(this.channel.users);
};

VoteskipModule.prototype.sendVoteskipData = function (users) {
    var max = this.calcVoteskipMax();
    var data = {
        count: this.poll ? this.poll.counts[0] : 0,
        need: this.poll ? Math.ceil(max * this.channel.modules.options.get("voteskip_ratio"))
                        : 0
    };

    var perms = this.channel.modules.permissions;

    users.forEach(function (u) {
        if (perms.canSeeVoteskipResults(u)) {
            u.socket.emit("voteskip", data);
        }
    });
};

VoteskipModule.prototype.calcVoteskipMax = function () {
    var perms = this.channel.modules.permissions;
    return this.channel.users.map(function (u) {
        if (!perms.canVoteskip(u)) {
            return 0;
        }

        return u.is(Flags.U_AFK) ? 0 : 1;
    }).reduce(function (a, b) {
        return a + b;
    }, 0);
};

VoteskipModule.prototype.onMediaChange = function (data) {
    this.poll = false;
    this.sendVoteskipData(this.channel.users);
};

module.exports = VoteskipModule;
