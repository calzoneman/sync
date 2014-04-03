var db = require("./database");
var Flags = require("./flags");

function listPlaylists(user) {
    db.listUserPlaylists(user.name, function (err, rows) {
        if (err) {
            user.socket.emit("errorMsg", {
                msg: "Database error when attempting to fetch list of playlists"
            });
            return;
        }

        user.socket.emit("listPlaylists", rows);
    });
}

function clonePlaylist(user, data) {
    if (!user.inChannel()) {
        user.socket.emit("errorMsg", {
            msg: "You must be in a channel in order to clone its playlist"
        });
        return;
    }

    if (typeof data.name !== "string") {
        return;
    }

    var pl = user.channel.playlist.items.toArray();
    db.saveUserPlaylist(pl, user.name, data.name, function (err, res) {
        if (err) {
            user.socket.emit("errorMsg", {
                msg: "Database error when saving playlist"
            });
        } else {
            listPlaylists(user);
        }
    });
}

function deletePlaylist(user, data) {
    if (typeof data.name !== "string") {
        return;
    }

    db.deleteUserPlaylist(user.name, data.name, function (err) {
        if (err) {
            user.socket.emit("errorMsg", {
                msg: err
            });
            return;
        }

        setImmediate(function () {
            listPlaylists(user);
        });
    });
}

module.exports.init = function (user) {
    if (user.userPlInited) {
        return;
    }

    var s = user.socket;
    var wrap = function (cb) {
        return function (data) {
            if (!user.is(Flags.U_LOGGED_IN) || user.account.effectiveRank < 1) {
                s.emit("errorMsg", {
                    msg: "You must be logged in to manage playlists"
                });
                return;
            }
            cb(user, data);
        };
    };

    s.on("listPlaylists", wrap(listPlaylists));
    s.on("clonePlaylist", wrap(clonePlaylist));
    s.on("deletePlaylist", wrap(deletePlaylist));
    user.userPlInited = true;
};
