var ChannelModule = require("./module");

function VoteskipModule(channel) {
    ChannelModule.apply(this, arguments);

    this.poll = false;
}

VoteskipModule.prototype = Object.create(ChannelModule.prototype);

VoteskipModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("voteskip", this.handleVoteskip.bind(this, user));
};

VoteskipModule.prototype.handleVoteskip = function (user) {
    if (!this.channel.modules.opts.get("allow_voteskip")) {
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

    this.poll.vote(user.ip, 0);

    var title = "";
    if (this.channel.modules.playlist.current) {
        title = " " + this.channel.modules.playlist.current;
    }

    var name = user.getName() || "(anonymous)"

    this.channel.logger.log("[playlist] " + name + " voteskipped " + title);
    this.update();
};

VoteskipModule.prototype.update = function () {

};

module.exports = VoteskipModule;
