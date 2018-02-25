import db from './database';
import Promise from 'bluebird';

const dbGetGlobalRank = Promise.promisify(db.users.getGlobalRank);
const dbMultiGetGlobalRank = Promise.promisify(db.users.getGlobalRanks);
const dbGetChannelRank = Promise.promisify(db.channels.getRank);
const dbMultiGetChannelRank = Promise.promisify(db.channels.getRanks);
const dbGetAliases = Promise.promisify(db.getAliases);

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

module.exports.rankForName = async function rankForNameAsync(name, channel) {
    const [globalRank, channelRank] = await Promise.all([
        dbGetGlobalRank(name),
        dbGetChannelRank(channel, name)
    ]);

    return Math.max(globalRank, channelRank);
};

module.exports.rankForIP = async function rankForIP(ip, channel) {
    const aliases = await dbGetAliases(ip);
    const [globalRanks, channelRanks] = await Promise.all([
        dbMultiGetGlobalRank(aliases),
        dbMultiGetChannelRank(channel, aliases)
    ]);

    return Math.max.apply(Math, globalRanks.concat(channelRanks));
};
