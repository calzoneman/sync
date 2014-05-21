var db = require("./database");
var Q = require("q");

function Account(opts) {
    var defaults = {
        name: "",
        ip: "",
        aliases: [],
        globalRank: -1,
        channelRank: -1,
        guest: true,
        profile: {
            image: "",
            text: ""
        }
    };

    this.name = opts.name || defaults.name;
    this.lowername = this.name.toLowerCase();
    this.ip = opts.ip || defaults.ip;
    this.aliases = opts.aliases || defaults.aliases;
    this.globalRank = "globalRank" in opts ? opts.globalRank : defaults.globalRank;
    this.channelRank = "channelRank" in opts ? opts.channelRank : defaults.channelRank;
    this.effectiveRank = Math.max(this.globalRank, this.channelRank);
    this.guest = this.globalRank === 0;
    this.profile = opts.profile || defaults.profile;
}

module.exports.default = function (ip) {
    return new Account({ ip: ip });
};

module.exports.getAccount = function (name, ip, opts, cb) {
    if (!cb) {
        cb = opts;
        opts = {};
    }
    opts.channel = opts.channel || false;

    var data = {};
    Q.nfcall(db.getAliases, ip)
    .then(function (aliases) {
        data.aliases = aliases;
        if (name && opts.registered) {
            return Q.nfcall(db.users.getGlobalRank, name);
        } else if (name) {
            return 0;
        } else {
            return -1;
        }
    }).then(function (globalRank) {
        data.globalRank = globalRank;
        if (opts.channel && opts.registered) {
            return Q.nfcall(db.channels.getRank, opts.channel, name);
        } else {
            if (opts.registered) {
                return 1;
            } else if (name) {
                return 0;
            } else {
                return -1;
            }
        }
    }).then(function (chanRank) {
        data.channelRank = chanRank;
        /* Look up profile for registered user */
        if (data.globalRank >= 1) {
            return Q.nfcall(db.users.getProfile, name);
        } else {
            return { text: "", image: "" };
        }
    }).then(function (profile) {
        setImmediate(function () {
            cb(null, new Account({
                name: name,
                ip: ip,
                aliases: data.aliases,
                globalRank: data.globalRank,
                channelRank: data.channelRank,
                profile: profile
            }));
        });
    }).catch(function (err) {
        cb(err, null);
    }).done();
};

module.exports.rankForName = function (name, opts, cb) {
    if (!cb) {
        cb = opts;
        opts = {};
    }

    var rank = 0;
    Q.fcall(function () {
        return Q.nfcall(db.users.getGlobalRank, name);
    }).then(function (globalRank) {
        rank = globalRank;
        if (opts.channel) {
            return Q.nfcall(db.channels.getRank, opts.channel, name);
        } else {
            return globalRank > 0 ? 1 : 0;
        }
    }).then(function (chanRank) {
        setImmediate(function () {
            cb(null, Math.max(rank, chanRank));
        });
    }).catch(function (err) {
        cb(err, 0);
    }).done();
};

module.exports.rankForIP = function (ip, opts, cb) {
    if (!cb) {
        cb = opts;
        opts = {};
    }

    var globalRank, rank, names;

    var promise = Q.nfcall(db.getAliases, ip)
    .then(function (_names) {
        names = _names;
        return Q.nfcall(db.users.getGlobalRanks, names);
    }).then(function (ranks) {
        ranks.push(0);
        globalRank = Math.max.apply(Math, ranks);
        rank = globalRank;
    });

    if (!opts.channel) {
        promise.then(function () {
            setImmediate(function () {
                cb(null, globalRank);
            });
        }).catch(function (err) {
            cb(err, null);
        }).done();
    } else {
        promise.then(function () {
            return Q.nfcall(db.channels.getRanks, opts.channel, names);
        }).then(function (ranks) {
            ranks.push(globalRank);
            rank = Math.max.apply(Math, ranks);
        }).then(function () {
            setImmediate(function () {
                cb(null, rank);
            });
        }).catch(function (err) {
            setImmediate(function () {
                cb(err, null);
            });
        }).done();
    }
};
