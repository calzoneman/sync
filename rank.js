exports.Guest = 0;
exports.Member = 1;
exports.Moderator = 4;
exports.Owner = 8;
exports.Siteadmin = 255;

var permissions = {
    queue: exports.Moderator,
    assignLeader: exports.Moderator,
    search: exports.Guest,
    chat: exports.Guest,
};

// Check if someone has permission to do shit
exports.hasPermission = function(user, what) {
    if(what in permissions) {
        return user.rank >= permissions[what];
    }
    else return false;
}
