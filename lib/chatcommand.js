/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Logger = require("./logger.js");
var Poll = require("./poll").Poll;

var handlers = {
    /* commands that send chat messages */
    "me": function (chan, user, msg, meta) {
        meta.addClass = "action";
        meta.action = true;
        chan.sendMessage(user, msg, meta);
    },
    "sp": function (chan, user, msg, meta) {
        meta.addClass = "spoiler";
        chan.sendMessage(user, msg, meta);
    },
    "say": function (chan, user, msg, meta) {
        if (user.rank >= 1.5) {
            meta.addClass = "shout";
            meta.addClassToNameAndTimestamp = true;
            meta.forceShowName = true;
            chan.sendMessage(user, msg, meta);
        }
    },
    "a": function (chan, user, msg, meta) {
        if (user.global_rank < 255) {
            return;
        }
        var superadminflair = {
            labelclass: "label-important",
            icon: "icon-globe"
        };

        var args = msg.split(" ");
        var cargs = [];
        for (var i = 0; i < args.length; i++) {
            var a = args[i];
            if (a.indexOf("!icon-") === 0) {
                superadminflair.icon = a.substring(1);
            } else if (a.indexOf("!label-") === 0) {
                superadminflair.labelclass = a.substring(1);
            } else {
                cargs.push(a);
            }
        }

        meta.superadminflair = superadminflair;
        meta.forceShowName = true;
        chan.sendMessage(user, cargs.join(" "), meta);
    },
    "poll": function (chan, user, msg, meta) {
        handlePoll(chan, user, msg, false);
    },
    "hpoll": function (chan, user, msg, meta) {
        handlePoll(chan, user, msg, true);
    },

    /* commands that do not send chat messages */
    "afk": function (chan, user, msg, meta) {
        user.setAFK(!user.meta.afk);
    },
    "mute": function (chan, user, msg, meta) {
        handleMute(chan, user, msg.split(" "));
    },
    "smute": function (chan, user, msg, meta) {
        handleShadowMute(chan, user, msg.split(" "));
    },
    "unmute": function (chan, user, msg, meta) {
        handleUnmute(chan, user, msg.split(" "));
    },
    "kick": function (chan, user, msg, meta) {
        handleKick(chan, user, msg.split(" "));
    },
    "ban": function (chan, user, msg, meta) {
        handleBan(chan, user, msg.split(" "));
    },
    "ipban": function (chan, user, msg, meta) {
        handleIPBan(chan, user, msg.split(" "));
    },
    "unban": function (chan, user, msg, meta) {
        handleUnban(chan, user, msg.split(" "));
    },
    "clear": function (chan, user, msg, meta) {
        handleClear(chan, user);
    },
    "clean": function (chan, user, msg, meta) {
        handleClean(chan, user, msg);
    },
    "cleantitle": function (chan, user, msg, meta) {
        handleCleanTitle(chan, user, msg);
    }
};

var handlerList = [];
for (var key in handlers) {
    handlerList.push({
        // match /command followed by a space or end of string
        re: new RegExp("^\\/" + key + "(?:\\s|$)"),
        fn: handlers[key]
    });
}

function handle(chan, user, msg, meta) {
    // Special case because the drink command can vary
    var m = msg.match(/^\/d(-?[0-9]*)(?:\s|$)(.*)/);
    if (m) {
        handleDrink(chan, user, m[1], m[2], meta);
        return;
    }
    for (var i = 0; i < handlerList.length; i++) {
        var h = handlerList[i];
        if (msg.match(h.re)) {
            var rest;
            if (msg.indexOf(" ") >= 0) {
                rest = msg.substring(msg.indexOf(" ") + 1);
            } else {
                rest = "";
            }
            h.fn(chan, user, rest, meta);
            break;
        }
    }
}

function handleDrink(chan, user, count, msg, meta) {
    if (!chan.hasPermission(user, "drink")) {
        return;
    }

    if (count === "") {
        count = 1;
    }
    count = parseInt(count);
    if (isNaN(count)) {
        return;
    }

    meta.drink = true;
    meta.forceShowName = true;
    meta.addClass = "drink";
    chan.drinks += count;
    chan.broadcastDrinks();
    if (count < 0 && msg.trim() === "") {
        return;
    }

    msg = msg + " drink!";
    if (count !== 1) {
        msg += "  (x" + count + ")";
    }
    chan.sendMessage(user, msg, meta);
}

function handleShadowMute(chan, user, args) {
    if (chan.hasPermission(user, "mute") && args.length > 0) {
        args[0] = args[0].toLowerCase();
        var person = false;
        for (var i = 0; i < chan.users.length; i++) {
            if (chan.users[i].name.toLowerCase() === args[0]) {
                person = chan.users[i];
                break;
            }
        }

        if (person) {
            if (person.rank >= user.rank) {
                user.socket.emit("errorMsg", {
                    msg: "You don't have permission to mute that person."
                });
                return;
            }

            /* Reset a previous regular mute */
            if (chan.mutedUsers.contains(person.name.toLowerCase())) {
                chan.mutedUsers.remove(person.name.toLowerCase());
                chan.sendAll("setUserIcon", {
                    name: person.name,
                    icon: false
                });
            }
            chan.mutedUsers.add("[shadow]" + person.name.toLowerCase());
            chan.logger.log("*** " + user.name + " shadow muted " + args[0]);
            person.meta.icon = "icon-volume-off";
            chan.sendAllExcept(person, "setUserIcon", {
                name: person.name,
                icon: "icon-volume-off"
            });
            var pkt = {
                username: "[server]",
                msg: user.name + " shadow muted " + args[0],
                meta: {
                    addClass: "server-whisper",
                    addClassToNameAndTimestamp: true
                },
                time: Date.now()
            };
            chan.users.forEach(function (u) {
                if (u.rank >= 2) {
                    u.socket.emit("chatMsg", pkt);
                }
            });
        }
    }
}

function handleMute(chan, user, args) {
    if (chan.hasPermission(user, "mute") && args.length > 0) {
        args[0] = args[0].toLowerCase();
        var person = false;
        for (var i = 0; i < chan.users.length; i++) {
            if (chan.users[i].name.toLowerCase() == args[0]) {
                person = chan.users[i];
                break;
            }
        }

        if (person) {
            if (person.rank >= user.rank) {
                user.socket.emit("errorMsg", {
                    msg: "You don't have permission to mute that person."
                });
                return;
            }
            person.meta.icon = "icon-volume-off";
            chan.mutedUsers.add(person.name.toLowerCase());
            chan.sendAll("setUserIcon", {
                name: person.name,
                icon: "icon-volume-off"
            });
            chan.logger.log("*** " + user.name + " muted " + args[0]);
        }
    }
}

function handleUnmute(chan, user, args) {
    if (chan.hasPermission(user, "mute") && args.length > 0) {
        args[0] = args[0].toLowerCase();
        var person = false;
        for (var i = 0; i < chan.users.length; i++) {
            if (chan.users[i].name.toLowerCase() == args[0]) {
                person = chan.users[i];
                break;
            }
        }

        if (person) {
            if (person.rank >= user.rank) {
                user.socket.emit("errorMsg", {
                    msg: "You don't have permission to unmute that person."
                });
                return;
            }
            person.meta.icon = false;
            chan.mutedUsers.remove(person.name.toLowerCase());
            chan.mutedUsers.remove("[shadow]" + person.name.toLowerCase());
            chan.sendAll("setUserIcon", {
                name: person.name,
                icon: false
            });
            chan.logger.log("*** " + user.name + " unmuted " + args[0]);
        }
    }
}

function handleKick(chan, user, args) {
    if (chan.hasPermission(user, "kick") && args.length > 0) {
        args[0] = args[0].toLowerCase();
        if (args[0] == user.name.toLowerCase()) {
            user.socket.emit("costanza", {
                msg: "Kicking yourself?"
            });
            return;
        }
        var kickee;
        for (var i = 0; i < chan.users.length; i++) {
            if (chan.users[i].name.toLowerCase() == args[0]) {
                if (chan.users[i].rank >= user.rank) {
                    user.socket.emit("errorMsg", {
                        msg: "You don't have permission to kick " + args[0]
                    });
                    return;
                }
                kickee = chan.users[i];
                break;
            }
        }
        if (kickee) {
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
    if (chan.hasPermission(user, "ban") && args.length > 0) {
        chan.logger.log("*** " + user.name + " unbanned " + args[0]);
        if (args[0].match(/(\d+)\.(\d+)\.(\d+)\.(\d+)/)) {
            chan.unbanIP(user, args[0]);
        }
        else {
            chan.unbanName(user, args[0]);
        }
    }
}

function handlePoll(chan, user, msg, hidden) {
    if (chan.hasPermission(user, "pollctl")) {
        var args = msg.split(",");
        var title = args[0];
        args.splice(0, 1);
        var poll = new Poll(user.name, title, args, hidden === true);
        chan.poll = poll;
        chan.broadcastPoll();
        chan.logger.log("*** " + user.name + " Opened Poll: '" + poll.title + "'");
    }
}

function handleClear(chan, user) {
    if (user.rank < 2) {
        return;
    }

    chan.chatbuffer = [];
    chan.sendAll("clearchat");
}

/*
    /clean and /cleantitle contributed by http://github.com/unbibium.
    Modifications by Calvin Montgomery
*/

function generateTargetRegex(target) {
    const flagsre = /^(-[img]+\s+)/i
    var m = target.match(flagsre);
    var flags = "";
    if (m) {
        flags = m[0].slice(1,-1);
        target = target.replace(flagsre, "");
    }
    return new RegExp(target, flags);
}

function handleClean(chan, user, target) {
    if (!chan.hasPermission(user, "playlistdelete"))
        return;
    target = generateTargetRegex(target);
    chan.playlist.clean(function (item) {
        return target.test(item.queueby);
    });
}

function handleCleanTitle(chan, user, target) {
    if (!chan.hasPermission(user, "playlistdelete"))
        return;
    target = generateTargetRegex(target);
    chan.playlist.clean(function (item) {
        return target.exec(item.media.title) !== null;
    });
}

exports.handle = handle;

