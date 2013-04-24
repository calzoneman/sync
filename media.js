/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Helper function for formatting a time value in seconds
// to the format hh:mm:ss
function formatTime(sec) {
    if(sec == "--:--")
        return sec;

    sec = Math.floor(sec);
    var hours="", minutes="", seconds="";
    if(sec > 3600) {
        hours = ""+Math.floor(sec / 3600);
        if(hours.length < 2)
            hours = "0"+hours;
        sec = sec % 3600;
    }
    minutes = ""+Math.floor(sec / 60);
    while(minutes.length < 2) {
        minutes = "0"+minutes;
    }
    seconds = ""+(sec % 60);
    while(seconds.length < 2) {
        seconds = "0"+seconds;
    }

    var time = "";
    if(hours != "")
        time = hours + ":";
    time += minutes + ":" + seconds;
    return time;
}

exports.formatTime = formatTime;

// Represents a media entry
var Media = function(id, title, seconds, type) {
    this.id = id;
    this.title = title;
    this.seconds = seconds == "--:--" ? "--:--" : parseInt(seconds);
    this.duration = formatTime(this.seconds);
    if(seconds == "--:--") {
        this.seconds = 0;
    }
    this.type = type;
    this.queueby = "";
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
        queueby: this.queueby
    };
}

// Same as pack() but includes the currentTime variable set by the channel
// when the media is being synchronized
Media.prototype.packupdate = function() {
    return {
        id: this.id,
        title: this.title,
        seconds: this.seconds,
        duration: this.duration,
        type: this.type,
        currentTime: this.currentTime,
        queueby: this.queueby
    };
}

exports.Media = Media;
