"use strict";

var ChannelModule = require("./module");
var Flags = require("../flags");

function AnonymousCheck(_channel) {
    ChannelModule.apply(this, arguments);
}

AnonymousCheck.prototype = Object.create(ChannelModule.prototype);

AnonymousCheck.prototype.onUserPreJoin = function (user, data, cb) {
    const opts = this.channel.modules.options;
    var anonymousBanned =  opts.get("block_anonymous_users");
    if(anonymousBanned && user.isAnonymous()) {
        user.socket.emit("needIdentity");
        user.socket.on("disconnect", function () {
            if (!user.is(Flags.U_IN_CHANNEL)) {
                cb("User disconnected", ChannelModule.DENY);
            }
        });
        
        user.waitFlag(Flags.U_LOGGED_IN, function () {
            user.socket.emit("cancelNeedIdentity");
            cb(null, ChannelModule.PASSTHROUGH);
        });
        
        return;
    }
    else{
        cb(null, ChannelModule.PASSTHROUGH);
    }
};

module.exports = AnonymousCheck;