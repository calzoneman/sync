const link = /(\w+:\/\/(?:[^:/[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^/\s]*)*)/ig;
const XSS = require('./xss');

function sanitizedWithLinksReplaced(text) {
    return XSS.sanitizeText(text)
            .replace(link, '<a href="$1" target="_blank" rel="noopener noreferer">$1</a>');
}

class Poll {
    static create(createdBy, title, choices, options = { hideVotes: false, retainVotes: false }) {
        let poll = new Poll();
        poll.createdAt = new Date();
        poll.createdBy = createdBy;
        poll.title = sanitizedWithLinksReplaced(title);
        poll.choices = choices.map(choice => sanitizedWithLinksReplaced(choice));
        poll.hideVotes = options.hideVotes;
        poll.retainVotes = options.retainVotes;
        poll.votes = new Map();
        return poll;
    }

    static fromChannelData({ initiator, title, options, _counts, votes, timestamp, obscured, retainVotes }) {
        let poll = new Poll();
        if (timestamp === undefined) // Very old polls still in the database lack timestamps
            timestamp = Date.now();
        poll.createdAt = new Date(timestamp);
        poll.createdBy = initiator;
        poll.title = title;
        poll.choices = options;
        poll.votes = new Map();
        Object.keys(votes).forEach(key => {
            if (votes[key] !== null)
                poll.votes.set(key, votes[key]);
        });
        poll.hideVotes = obscured;
        poll.retainVotes = retainVotes || false;
        return poll;
    }

    toChannelData() {
        let counts = new Array(this.choices.length);
        counts.fill(0);

        // TODO: it would be desirable one day to move away from using an Object here.
        // This is just for backwards-compatibility with the existing format.
        let votes = {};

        this.votes.forEach((index, key) => {
            votes[key] = index;
            counts[index]++;
        });

        return {
            title: this.title,
            initiator: this.createdBy,
            options: this.choices,
            counts,
            votes,
            obscured: this.hideVotes,
            retainVotes: this.retainVotes,
            timestamp: this.createdAt.getTime()
        };
    }

    countVote(key, choiceId) {
        if (choiceId < 0 || choiceId >= this.choices.length)
            return false;

        let changed = !this.votes.has(key) || this.votes.get(key) !== choiceId;
        this.votes.set(key, choiceId);
        return changed;
    }

    uncountVote(key) {
        let changed = this.votes.has(key);
        this.votes.delete(key);
        return changed;
    }

    toUpdateFrame(showHiddenVotes) {
        let counts = new Array(this.choices.length);
        counts.fill(0);

        this.votes.forEach(index => counts[index]++);

        if (this.hideVotes) {
            counts = counts.map(c => {
                if (showHiddenVotes) return `${c}?`;
                else return '?';
            });
        }

        return {
            title: this.title,
            options: this.choices,
            counts: counts,
            initiator: this.createdBy,
            timestamp: this.createdAt.getTime()
        };
    }
}

exports.Poll = Poll;
