/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
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
    acl             : exports.Owner,
    queue           : exports.Moderator,
    assignLeader    : exports.Moderator,
    kick            : exports.Moderator,
    ipban           : exports.Moderator,
    promote         : exports.Moderator,
    qlock           : exports.Moderator,
    poll            : exports.Moderator,
    shout           : exports.Moderator,
    channelOpts     : exports.Moderator,
    jump            : exports.Moderator,
    chatFilter      : exports.Moderator,
    updateMotd      : exports.Moderator,
    drink           : exports.Moderator,
    seeVoteskip     : exports.Moderator,
    uncache         : exports.Moderator,
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
