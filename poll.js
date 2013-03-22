
var Poll = function(initiator, title, options) {
    this.initiator = initiator;
    this.title = title;
    this.options = options;
    this.counts = new Array(options.length);
    for(var i = 0; i < this.counts.length; i++) {
        this.counts[i] = 0;
    }
    this.votes = {};
}

Poll.prototype.vote = function(ip, option) {
    if(!(ip in this.votes) || this.votes[ip] == null) {
        this.votes[ip] = option;
        this.counts[option]++;
    }
    console.log(this.votes);
}

Poll.prototype.unvote = function(ip) {
    console.log('unvote ' + ip + this.votes[ip]);
    if(ip in this.votes && this.votes[ip] != null) {
        this.counts[this.votes[ip]]--;
        this.votes[ip] = null;
    }
    console.log(this.votes);
}

Poll.prototype.packUpdate = function() {
    return {
        title: this.title,
        options: this.options,
        counts: this.counts,
        initiator: this.initiator
    }
}

exports.Poll = Poll;
