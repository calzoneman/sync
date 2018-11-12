var ChannelModule = require("./module");
var Flags = require("../flags");
var Poll = require("../poll").Poll;

function VoteskipModule(_channel) {
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

    if (!this.poll.vote(user.realip, 0)) {
        // Vote was already recorded for this IP, no update needed
        return;
    }

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

    const { total, eligible, noPermission, afk } = this.calcUsercounts();
    const need = Math.ceil(eligible * this.channel.modules.options.get("voteskip_ratio"));
    if (this.poll.counts[0] >= need) {
        const info = `${this.poll.counts[0]}/${eligible} skipped; ` +
            `eligible voters: ${eligible} = total (${total}) - AFK (${afk}) ` +
            `- no permission (${noPermission}); ` +
            `ratio = ${this.channel.modules.options.get("voteskip_ratio")}`;
        this.channel.logger.log(`[playlist] Voteskip passed: ${info}`);
        this.reset();
        this.channel.modules.playlist._playNext();
    } else {
        this.sendVoteskipData(this.channel.users);
    }
};

VoteskipModule.prototype.sendVoteskipData = function (users) {
    const { eligible } = this.calcUsercounts();
    var data = {
        count: this.poll ? this.poll.counts[0] : 0,
        need: this.poll ? Math.ceil(eligible * this.channel.modules.options.get("voteskip_ratio"))
                        : 0
    };

    var perms = this.channel.modules.permissions;

    users.forEach(function (u) {
        if (perms.canSeeVoteskipResults(u)) {
            u.socket.emit("voteskip", data);
        }
    });
};

VoteskipModule.prototype.calcUsercounts = function () {
    const perms = this.channel.modules.permissions;
    const counts = { total: 0, noPermission: 0, afk: 0 };

    this.channel.users.forEach(u => {
        counts.total++;

        if (!perms.canVoteskip(u))  counts.noPermission++;
        else if (u.is(Flags.U_AFK)) counts.afk++;
    });

    counts.eligible = counts.total - (counts.noPermission + counts.afk);

    return counts;
};

VoteskipModule.prototype.reset = function reset() {
    this.poll = false;
    this.sendVoteskipData(this.channel.users);
};

VoteskipModule.prototype.onMediaChange = function (_data) {
    this.reset();
};

module.exports = VoteskipModule;
