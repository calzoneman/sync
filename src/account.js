var db = require("./database");
var Q = require("q");

const DEFAULT_PROFILE = Object.freeze({ image: '', text: '' });

class Account {
    constructor(ip, user, aliases) {
        this.ip = ip;
        this.user = user;
        this.aliases = aliases;
        this.channelRank = -1;
        this.guestName = null;

        this.update();
    }

    update() {
        if (this.user !== null) {
            this.name = this.user.name;
            this.globalRank = this.user.global_rank;
        } else if (this.guestName !== null) {
            this.name = this.guestName;
            this.globalRank = 0;
        } else {
            this.name = '';
            this.globalRank = -1;
        }
        this.lowername = this.name.toLowerCase();
        this.effectiveRank = Math.max(this.channelRank, this.globalRank);
        this.profile = (this.user === null) ? DEFAULT_PROFILE : this.user.profile;
    }
}

module.exports.Account = Account;

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
