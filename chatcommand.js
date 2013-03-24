/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Rank = require('./rank.js');
var Poll = require('./poll.js').Poll;

function handle(chan, user, msg) {
    if(msg.indexOf("/me ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "action");
    else if(msg.indexOf("/sp ") == 0)
        chan.sendMessage(user.name, msg.substring(4), "spoiler");
    else if(msg.indexOf("/say ") == 0) {
        if(Rank.hasPermission(user, "shout")) {
            chan.sendMessage(user.name, msg.substring(5), "shout");
        }
    }
    else if(msg.indexOf("/kick ") == 0) {
        handleKick(chan, user, msg.substring(6).split(' '));
    }
    else if(msg.indexOf("/ban ") == 0) {
        handleBan(chan, user, msg.substring(5).split(' '));
    }
    else if(msg.indexOf("/poll ") == 0) {
        handlePoll(chan, user, msg.substring(6));
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
        if(kickee) {
            chan.ipbans.push(kickee.ip);
            kickee.socket.disconnect();
        }
    }
}

function handlePoll(chan, user, msg) {
    if(Rank.hasPermission(user, "poll")) {
        var args = msg.split(',');
        var title = args[0];
        args.splice(0, 1);
        var poll = new Poll(user.name, title, args);
        chan.poll = poll;
        chan.broadcastPoll();
    }
}

exports.handle = handle;

