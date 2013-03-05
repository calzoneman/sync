var Rank = require('./rank.js');

function handle(chan, user, msg) {
    if(msg.indexOf("/me ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "action");
    else if(msg.indexOf("/sp ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "spoiler");
    else if(msg.indexOf("/kick ") == 0) {
        handleKick(chan, user, msg.substring(6).split(' '));
    }
}

function handleKick(chan, user, args) {
    if(Rank.hasPermission(user, "kick") && args.length > 0) {
        var kickee;
        for(var i = 0; i < chan.users.length; i++) {
            if(chan.users[i].name == args[0]) {
                kickee = chan.users[i];
                break;
            }
        }
        if(kickee) {
            kickee.socket.disconnect();
            chan.userLeave(kickee);
        }
    }
}

exports.handle = handle;

