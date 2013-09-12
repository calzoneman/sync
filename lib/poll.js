/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Poll = function(initiator, title, options, obscured) {
    this.initiator = initiator;
    this.title = title;
    this.options = options;
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
