function handle(chan, user, msg) {
    if(msg.indexOf("/me ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "action");
    else if(msg.indexOf("/sp ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "spoiler");
}

exports.handle = handle;

