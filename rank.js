/**
 * Copyright 2013 Calvin 'calzoneman' Montgomery
 *
 * Licensed under Creative Commons Attribution-NonCommercial 3.0
 * See http://creativecommons.org/licenses/by-nc/3.0/
 *
 */

exports.Guest = 0;
exports.Member = 1;
exports.Moderator = 2;
exports.Owner = 3;
exports.Siteadmin = 255;

var permissions = {
    acp             : exports.Siteadmin,
    announce        : exports.Siteadmin,
    registerChannel : exports.Owner,
    queue           : exports.Moderator,
    assignLeader    : exports.Moderator,
    kick            : exports.Moderator,
    promote         : exports.Moderator,
    qlock           : exports.Moderator,
    poll            : exports.Moderator,
    shout           : exports.Moderator,
    search          : exports.Guest,
    chat            : exports.Guest,
};

// Check if someone has permission to do shit
exports.hasPermission = function(user, what) {
    if(what in permissions) {
        return user.rank >= permissions[what];
    }
    else return false;
}
