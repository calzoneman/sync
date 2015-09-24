const link = /(\w+:\/\/(?:[^:\/\[\]\s]+|\[[0-9a-f:]+\])(?::\d+)?(?:\/[^\/\s]*)*)/ig;
var XSS = require("./xss");

var Poll = function(initiator, title, options, obscured) {
    this.initiator = initiator;
    title = XSS.sanitizeText(title);
    this.title = title.replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");
    this.options = options;
    for (var i = 0; i < this.options.length; i++) {
        this.options[i] = XSS.sanitizeText(this.options[i]);
        this.options[i] = this.options[i].replace(link, "<a href=\"$1\" target=\"_blank\">$1</a>");

    }
    this.obscured = obscured || false;
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
}

Poll.prototype.unvote = function(ip) {
    if(ip in this.votes && this.votes[ip] != null) {
        this.counts[this.votes[ip]]--;
        this.votes[ip] = null;
    }
}

Poll.prototype.packUpdate = function (showhidden) {
    var counts = Array.prototype.slice.call(this.counts);
    if (this.obscured) {
        for(var i = 0; i < counts.length; i++) {
            if (!showhidden)
                counts[i] = "";
            counts[i] += "?";
        }
    }
    var packed = {
        title: this.title,
        options: this.options,
        counts: counts,
        initiator: this.initiator
    };
    return packed;
}

exports.Poll = Poll;
