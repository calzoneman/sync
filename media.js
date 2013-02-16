// Helper function for formatting a time value in seconds
// to the format hh:mm:ss
function formatTime(sec) {
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

// Represents a media entry
var Media = function(id, title, seconds, type) {
    this.id = id;
    this.title = title;
    this.seconds = seconds;
    this.duration = formatTime(this.seconds);
    this.type = type;
}

// Returns an object containing the data in this Media but not the
// prototype
Media.prototype.pack = function() {
    return {
        id: this.id,
        title: this.title,
        seconds: this.seconds,
        duration: this.duration,
        type: this.type
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
        currentTime: this.currentTime
    };
}

exports.Media = Media;
