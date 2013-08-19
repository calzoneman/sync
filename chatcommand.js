/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Rank = require("./rank.js");
var Poll = require("./poll.js").Poll;
var Logger = require("./logger.js");

function handle(chan, user, msg, data) {
    if(msg.indexOf("/me ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "action", data);
    else if(msg.indexOf("/sp ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "spoiler", data);
    else if(msg.indexOf("/say ") == 0) {
        if(Rank.hasPermission(user, "shout") || chan.leader == user) {
            chan.sendMessage(user.name, msg.substring(5), "shout", data);
        }
    }
    else if(msg.indexOf("/afk") == 0) {
        user.setAFK(!user.meta.afk);
    }
    else if(msg.indexOf("/m ") == 0) {
        if(user.rank >= Rank.Moderator) {
            chan.chainMessage(user, msg.substring(3), {modflair: user.rank})
        }
    }
    else if(msg.indexOf("/a ") == 0) {
        if(user.rank >= Rank.Siteadmin) {
            var flair = {
                superadminflair: {
                    labelclass: "label-important",
                    icon: "icon-globe"
                }
            };
            var args = msg.substring(3).split(" ");
            var cargs = [];
            for(var i = 0; i < args.length; i++) {
                var a = args[i];
                if(a.indexOf("!icon-") == 0)
                    flair.superadminflair.icon = a.substring(1);
                else if(a.indexOf("!label-") == 0)
                    flair.superadminflair.labelclass = a.substring(1);
                else {
                    cargs.push(a);
                }
            }
            chan.chainMessage(user, cargs.join(" "), flair);
        }
    }
    else if(msg.indexOf("/mute ") == 0) {
        handleMute(chan, user, msg.substring(6).split(" "));
    }
    else if(msg.indexOf("/unmute ") == 0) {
        handleUnmute(chan, user, msg.substring(8).split(" "));
    }
    else if(msg.indexOf("/kick ") == 0) {
        handleKick(chan, user, msg.substring(6).split(" "));
    }
    else if(msg.indexOf("/ban ") == 0) {
        handleBan(chan, user, msg.substring(5).split(" "));
    }
    else if(msg.indexOf("/ipban ") == 0) {
        handleIPBan(chan, user, msg.substring(7).split(" "));
    }
    else if(msg.indexOf("/unban ") == 0) {
        handleUnban(chan, user, msg.substring(7).split(" "));
    }
    else if(msg.indexOf("/poll ") == 0) {
        handlePoll(chan, user, msg.substring(6));
    }
    else if(msg.indexOf("/d") == 0 && msg.length > 2 &&
            msg[2].match(/[-0-9 ]/)) {
        if(msg[2] == "-") {
            if(msg.length == 3)
                return;
            if(!msg[3].match(/[0-9]/))
                return;
        }
        handleDrink(chan, user, msg.substring(2), data);
    }
    else if(msg.indexOf("/clear") == 0) {
        handleClear(chan, user);
    }
}

function handleMute(chan, user, args) {
    if(chan.hasPermission(user, "mute") && args.length > 0) {
        args[0] = args[0].toLowerCase();
        var person = false;
        for(var i = 0; i < chan.users.length; i++) {
            if(chan.users[i].name.toLowerCase() == args[0]) {
                person = chan.users[i];
                break;
            }
        }

        if(person) {
            if(person.rank >= user.rank) {
                user.socket.emit("errorMsg", {
                    msg: "You don't have permission to mute that person."
                });
                return;
            }
            person.meta.icon = "icon-volume-off";
            person.muted = true;
            chan.broadcastUserUpdate(person);
            chan.logger.log("*** " + user.name + " muted " + args[0]);
        }
    }
}

function handleUnmute(chan, user, args) {
    if(chan.hasPermission(user, "mute") && args.length > 0) {
        args[0] = args[0].toLowerCase();
        var person = false;
        for(var i = 0; i < chan.users.length; i++) {
            if(chan.users[i].name.toLowerCase() == args[0]) {
                person = chan.users[i];
                break;
            }
        }

        if(person) {
            if(person.rank >= user.rank) {
                user.socket.emit("errorMsg", {
                    msg: "You don't have permission to unmute that person."
                });
                return;
            }
            person.meta.icon = false;
            person.muted = false;
            chan.broadcastUserUpdate(person);
            chan.logger.log("*** " + user.name + " unmuted " + args[0]);
        }
    }
}

function handleKick(chan, user, args) {
    if(chan.hasPermission(user, "kick") && args.length > 0) {
        args[0] = args[0].toLowerCase();
        if(args[0] == user.name.toLowerCase()) {
            user.socket.emit("costanza", {
                msg: "Kicking yourself?"
            });
            return;
        }
        var kickee;
        for(var i = 0; i < chan.users.length; i++) {
            if(chan.users[i].name.toLowerCase() == args[0]) {
                if(chan.users[i].rank >= user.rank) {
                    user.socket.emit("errorMsg", {
                        msg: "You don't have permission to kick " + args[0]
                    });
                    return;
                }
                kickee = chan.users[i];
                break;
            }
        }
        if(kickee) {
            chan.logger.log("*** " + user.name + " kicked " + args[0]);
            args[0] = "";
            var reason = args.join(" ");
            chan.kick(kickee, reason);
        }
    }
}

function handleIPBan(chan, user, args) {
    chan.tryIPBan(user, args[0], args[1]);
    // Ban the name too for good measure
    chan.tryNameBan(user, args[0]);
}

function handleBan(chan, user, args) {
    chan.tryNameBan(user, args[0]);
}

function handleUnban(chan, user, args) {
    if(chan.hasPermission(user, "ban") && args.length > 0) {
        chan.logger.log("*** " + user.name + " unbanned " + args[0]);
        if(args[0].match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/)) {
            chan.unbanIP(user, args[0]);
        }
        else {
            chan.unbanName(user, args[0]);
        }
    }
}

function handlePoll(chan, user, msg) {
    if(chan.hasPermission(user, "pollctl")) {
        var args = msg.split(",");
        var title = args[0];
        args.splice(0, 1);
        var poll = new Poll(user.name, title, args);
        chan.poll = poll;
        chan.broadcastPoll();
        chan.logger.log("*** " + user.name + " Opened Poll: '" + poll.title + "'");
    }
}

function handleDrink(chan, user, msg, data) {
    if(!chan.hasPermission(user, "drink")) {
        return;
    }

    var count = msg.split(" ")[0];
    msg = msg.substring(count.length + 1);
    if(count == "")
        count = 1;
    else
        count = parseInt(count);

    chan.drinks += count;
    chan.broadcastDrinks();
    if(count < 0 && msg.trim() == "") {
        return;
    }

    msg = msg + " drink!";
    if(count != 1)
        msg += "  (x" + count + ")";
    chan.sendMessage(user.name, msg, "drink", data);
}

function handleClear(chan, user) {
    if(user.rank < Rank.Moderator) {
        return;
    }

    chan.chatbuffer = [];
    chan.sendAll("clearchat");
}

exports.handle = handle;

