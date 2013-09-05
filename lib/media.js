/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var formatTime = require("./utilities").formatTime;

// Represents a media entry
var Media = function(id, title, seconds, type) {
    this.id = id;
    this.title = title;
    if(this.title.length > 100)
        this.title = this.title.substring(0, 97) + "...";
    this.seconds = seconds == "--:--" ? "--:--" : parseInt(seconds);
    this.duration = formatTime(this.seconds);
    if(seconds == "--:--") {
        this.seconds = 0;
    }
    this.type = type;
}

Media.prototype.dup = function() {
    var m = new Media(this.id, this.title, this.seconds, this.type);
    return m;
}

// Returns an object containing the data in this Media but not the
// prototype
Media.prototype.pack = function() {
    return {
        id: this.id,
        title: this.title,
        seconds: this.seconds,
        duration: this.duration,
        type: this.type,
    };
}

// Same as pack() but includes the currentTime variable set by the channel
// when the media is being synchronized
Media.prototype.fullupdate = function() {
    return {
        id: this.id,
        title: this.title,
        seconds: this.seconds,
        duration: this.duration,
        type: this.type,
        currentTime: this.currentTime,
        paused: this.paused,
    };
}

Media.prototype.timeupdate = function() {
    //return this.fullupdate();
    return {
        currentTime: this.currentTime,
        paused: this.paused
    };
}

exports.Media = Media;
