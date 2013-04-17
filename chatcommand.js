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

function handle(chan, user, msg) {
    if(msg.indexOf("/me ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "action");
    else if(msg.indexOf("/sp ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "spoiler");
    else if(msg.indexOf("/say ") == 0) {
        if(Rank.hasPermission(user, "shout") || chan.leader == user) {
            chan.sendMessage(user.name, msg.substring(5), "shout");
        }
    }
    else if(msg.indexOf("/m ") == 0) {
        if(user.rank >= Rank.Moderator) {
            chan.sendMessage(user.name, msg.substring(3), "modflair", {
                modflair: user.rank
            });
        }
    }
    else if(msg.indexOf("/kick ") == 0) {
        handleKick(chan, user, msg.substring(6).split(" "));
    }
    else if(msg.indexOf("/ban ") == 0) {
        handleBan(chan, user, msg.substring(5).split(" "));
    }
    else if(msg.indexOf("/unban ") == 0) {
        handleUnban(chan, user, msg.substring(7).split(" "));
    }
    else if(msg.indexOf("/poll ") == 0) {
        handlePoll(chan, user, msg.substring(6));
    }
    else if(msg.indexOf("/d") == 0 && msg.length > 2 &&
            msg[2].match(/[-0-9 ]/)) {
        handleDrink(chan, user, msg.substring(2));
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
            chan.logger.log("*** " + user.name + " kicked " + args[0]);
            args[0] = "";
            var reason = args.join(" ");
            chan.kick(kickee, reason);
        }
    }
}

function handleBan(chan, user, args) {
    if(Rank.hasPermission(user, "ipban") && args.length > 0) {
        var kickee;
        for(var i = 0; i < chan.users.length; i++) {
            if(chan.users[i].name == args[0]) {
                kickee = chan.users[i];
                break;
            }
        }
        if(kickee && kickee.rank < user.rank) {
            chan.logger.log("*** " + user.name + " banned " + args[0]);
            args[0] = "";
            var reason = args.join(" ");
            chan.kick(kickee, "(banned) " + reason);
        }
    }
}

function handleUnban(chan, user, args) {
    if(Rank.hasPermission(user, "ipban") && args.length > 0) {
        chan.logger.log("*** " + user.name + " unbanned " + args[0]);
        chan.unbanIP(user, args[0]);
    }
}

function handlePoll(chan, user, msg) {
    if(Rank.hasPermission(user, "poll") || chan.leader == user) {
        var args = msg.split(",");
        var title = args[0];
        args.splice(0, 1);
        var poll = new Poll(user.name, title, args);
        chan.poll = poll;
        chan.broadcastPoll();
        chan.logger.log("*** " + user.name + " Opened Poll: '" + poll.title + "'");
    }
}

function handleDrink(chan, user, msg) {
    if(!Rank.hasPermission(user, "drink") && chan.leader != user) {
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
    chan.sendMessage(user.name, msg, "drink");
}

exports.handle = handle;

