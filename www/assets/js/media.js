/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var Media = function(data) {
    if(!data) {
        data = {
            id: "",
            type: "null"
        };
    }
    this.id = data.id;
    this.type = data.type;
    this.diff = 0;

    switch(this.type) {
        case "yt":
            this.initYouTube();
            break;
        case "vi":
            this.initVimeo();
            break;
        case "dm":
            this.initDailymotion();
            break;
        case "sc":
            this.initSoundcloud();
            break;
        case "li":
            this.initLivestream();
            break;
        case "tw":
            this.initTwitch();
            break;
        case "jt":
            this.initJustinTV();
            break;
        case "rt":
            this.initRTMP();
            break;
        case "jw":
            this.initJWPlayer();
            break;
        case "us":
            this.initUstream();
            break;
        case "im":
            this.initImgur();
            break;
        default:
            this.nullPlayer();
            break;
    }
}

Media.prototype.nullPlayer = function() {
    this.player = null;
    this.load = function(data) { }
    this.play = function() { }
    this.pause = function() { }
    this.getTime = function(callback) { }
    this.seek = function(time) { }
}

Media.prototype.initYouTube = function() {
    this.removeOld();
    this.player = new YT.Player("ytapiplayer", {
        height: VHEIGHT,
        width: VWIDTH,
        videoId: this.id,
        playerVars: {
            "autoplay": 1,
            "controls": 1,
        },
        events: {
            onReady: function() {
                socket.emit("playerReady");
            },
            onStateChange: function(ev) {
                if(PLAYER.paused && ev.data != YT.PlayerState.PAUSED
                    || !PLAYER.paused && ev.data == YT.PlayerState.PAUSED) {
                    PLAYER.paused = (ev.data == YT.PlayerState.PAUSED);
                    sendVideoUpdate();
                }
                else {
                    PLAYER.paused = (ev.data == YT.PlayerState.PAUSED);
                }
                if(LEADER && ev.data == YT.PlayerState.ENDED) {
                    socket.emit("playNext");
                }
            }
        }
    });
    $("#ytapiplayer").css("border", "none");

    this.load = function(data) {
        if(this.player.loadVideoById) {
            this.player.loadVideoById(data.id, data.currentTime);
            this.id = data.id;
        }
    }

    this.pause = function() {
        this.player.pauseVideo();
    }

    this.play = function() {
        this.player.playVideo();
    }

    this.getTime = function(callback) {
        callback(this.player.getCurrentTime());
    }

    this.seek = function(time) {
        this.player.seekTo(time, true);
    }
}

Media.prototype.initVimeo = function() {
    var iframe = $("<iframe/>").insertBefore($("#ytapiplayer"));
    $("#ytapiplayer").remove();
    iframe.attr("id", "ytapiplayer");
    iframe.attr("width", VWIDTH);
    iframe.attr("height", VHEIGHT);
    iframe.attr("src", "http://player.vimeo.com/video/"+this.id+"?api=1&player_id=ytapiplayer");
    iframe.attr("webkitAllowFullScreen", "");
    iframe.attr("mozallowfullscreen", "");
    iframe.attr("allowFullScreen", "");
    iframe.css("border", "none");

    this.player = $f(iframe[0]);
    $f(iframe[0]).addEvent("ready", function() {
        socket.emit("playerReady");
        this.player = $f(iframe[0]);
        this.player.api("play");

        this.player.addEvent("finish", function() {
            if(LEADER) {
                socket.emit("playNext");
            }
        });

        this.player.addEvent("pause", function() {
            PLAYER.paused = true;
            sendVideoUpdate();
        });

        this.player.addEvent("play", function() {
            PLAYER.paused = false;
            sendVideoUpdate();
        });
    }.bind(this));

    this.load = function(data) {
        this.id = data.id;
        this.initVimeo();
    }

    this.pause = function() {
        this.player.api("pause");
    }

    this.play = function() {
        this.player.api("play");
    }

    this.getTime = function(callback) {
        // Vimeo api returns time as a string because fuck logic
        this.player.api("getCurrentTime", function(time) {
            callback(parseFloat(time));
        });
    }

    this.seek = function(time) {
        this.player.api("seekTo", time);
    }
}

Media.prototype.initDailymotion = function() {
    this.removeOld();
    this.player = DM.player("ytapiplayer", {
        video: this.id,
        width: parseInt(VWIDTH),
        height: parseInt(VHEIGHT),
        params: {autoplay: 1}
    });

    this.player.addEventListener("apiready", function(e) {
        socket.emit("playerReady");
        this.player.addEventListener("ended", function(e) {
            if(LEADER) {
                socket.emit("playNext");
            }
        });

        this.player.addEventListener("pause", function(e) {
            PLAYER.paused = true;
            sendVideoUpdate();
        });

        this.player.addEventListener("playing", function(e) {
            PLAYER.paused = false;
            sendVideoUpdate();
        });
    }.bind(this));


    this.load = function(data) {
        this.id = data.id;
        this.player.api("load", data.id);
    }

    this.pause = function() {
        this.player.api("pause");
    }

    this.play = function() {
        this.player.api("play");
    }

    this.getTime = function(callback) {
        callback(this.player.currentTime);
    }

    this.seek = function(seconds) {
        this.player.api("seek", seconds);
    }
}

Media.prototype.initSoundcloud = function() {
    unfixSoundcloudShit();
    var iframe = $("<iframe/>").insertBefore($("#ytapiplayer"));
    $("#ytapiplayer").remove();

    iframe.attr("id", "ytapiplayer");
    iframe.attr("src", "https://w.soundcloud.com/player/?url=" + this.id);
    iframe.css("width", "100%").attr("height", "166");
    iframe.css("border", "none");

    this.player = SC.Widget("ytapiplayer");

    this.player.bind(SC.Widget.Events.READY, function() {
        socket.emit("playerReady");
        this.player.load(this.id, {auto_play: true});

        this.player.bind(SC.Widget.Events.PAUSE, function() {
            PLAYER.paused = true;
            sendVideoUpdate();
        });

        this.player.bind(SC.Widget.Events.PLAY, function() {
            PLAYER.paused = false;
            sendVideoUpdate();
        });

        this.player.bind(SC.Widget.Events.FINISH, function() {
            if(LEADER) {
                socket.emit("playNext");
            }
        });
    }.bind(this));

    this.load = function(data) {
        this.id = data.id;
        this.player.load(data.id, {auto_play: true});
    }

    this.pause = function() {
        this.player.pause();
    }

    this.play = function() {
        this.player.play();
    }

    this.getTime = function(callback) {
        this.player.getPosition(function(pos) {
            callback(pos / 1000);
        });
    }

    this.seek = function(seconds) {
        this.player.seekTo(seconds * 1000);
    }
}

Media.prototype.initLivestream = function() {
    this.removeOld();
    var flashvars = {channel: this.id};
    var params = {AllowScriptAccess: "always"};
    swfobject.embedSWF("http://cdn.livestream.com/chromelessPlayer/v20/playerapi.swf", "ytapiplayer", VWIDTH, VHEIGHT, "9.0.0", "expressInstall.swf", flashvars, params);

    this.load = function(data) {
        this.id = data.id;
        this.initLivestream();
    }

    this.pause = function() { }

    this.play = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Media.prototype.initTwitch = function() {
    this.removeOld();
    var url = "http://www.twitch.tv/widgets/live_embed_player.swf?channel="+this.id;
    var params = {
        allowFullScreen:"true",
        allowScriptAccess:"always",
        allowNetworking:"all",
        movie:"http://www.twitch.tv/widgets/live_embed_player.swf",
        id: "live_embed_player_flash",
        flashvars:"hostname=www.twitch.tv&channel="+this.id+"&auto_play=true&start_volume=100"
    };
    swfobject.embedSWF( url, "ytapiplayer", VWIDTH, VHEIGHT, "8", null, null, params, {} );

    this.load = function(data) {
        this.id = data.id;
        this.initTwitch();
    }

    this.pause = function() { }

    this.play = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Media.prototype.initJustinTV = function() {
    this.removeOld();
    var url = "http://www.justin.tv/widgets/live_embed_player.swf?channel="+this.id;
    var params = {
        allowFullScreen:"true",
        allowScriptAccess:"always",
        allowNetworking:"all",
        movie:"http://www.justin.tv/widgets/live_embed_player.swf",
        id: "live_embed_player_flash",
        flashvars:"hostname=www.justin.tv&channel="+this.id+"&auto_play=true&start_volume=100"
    };
    swfobject.embedSWF( url, "ytapiplayer", VWIDTH, VHEIGHT, "8", null, null, params, {} );

    this.load = function(data) {
        this.id = data.id;
        this.initTwitch();
    }

    this.pause = function() { }

    this.play = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Media.prototype.initRTMP = function() {
    this.removeOld();
    var url = "http://fpdownload.adobe.com/strobe/FlashMediaPlayback_101.swf";
    var src = encodeURIComponent(this.id);
    var params = {
            allowFullScreen:"true",
            allowScriptAccess:"always",
            allowNetworking:"all",
            wMode:"direct",
            movie:"http://fpdownload.adobe.com/strobe/FlashMediaPlayback_101.swf",
            flashvars:"src="+src+"&streamType=live&autoPlay=true"
        };
        swfobject.embedSWF(url, "ytapiplayer", VWIDTH, VHEIGHT, "8", null, null, params, {} );

    this.load = function(data) {
        this.id = data.id;
        this.initTwitch();
    }

    this.pause = function() { }

    this.play = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Media.prototype.initJWPlayer = function() {
    if(typeof jwplayer == "undefined") {
        setTimeout(function() {
            this.initJWPlayer();
        }.bind(this), 100);
        return;
    }
    this.removeOld();

    jwplayer("ytapiplayer").setup({
        file: this.id,
        width: VWIDTH,
        height: VHEIGHT,
        autostart: true
    });

    jwplayer().onPlay(function() {
        this.paused = false;
    }.bind(this));
    jwplayer().onPause(function() {
        this.paused = true;
    }.bind(this));
    jwplayer().onComplete(function() {
        socket.emit("playNext");
    });

    this.load = function(data) {
        this.id = data.id;
        this.initJWPlayer();
    }

    this.pause = function() {
        jwplayer().pause(true);
    }

    this.play = function() {
        jwplayer().play(true);
    }

    this.getTime = function(callback) {
        // Only return time for non-live media
        if(jwplayer().getDuration() != -1) {
            callback(jwplayer().getPosition());
        }
    }

    this.seek = function(time) {
        jwplayer().seek(time);
    }
}

Media.prototype.initUstream = function() {
    var iframe = $("<iframe/>").insertBefore($("#ytapiplayer"));
    $("#ytapiplayer").remove();
    iframe.attr("id", "ytapiplayer");
    iframe.attr("width", VWIDTH);
    iframe.attr("height", VHEIGHT);
    iframe.attr("src", "http://www.ustream.tv/embed/"+this.id+"?v=3&wmode=direct");
    iframe.attr("frameborder", "0");
    iframe.attr("scrolling", "no");
    iframe.css("border", "none");

    this.load = function(data) {
        this.id = data.id;
        this.initUstream();
    }

    this.pause = function() { }

    this.play = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Media.prototype.initImgur = function() {
    var iframe = $("<iframe/>").insertBefore($("#ytapiplayer"));
    $("#ytapiplayer").remove();
    iframe.attr("id", "ytapiplayer");
    iframe.attr("width", VWIDTH);
    iframe.attr("height", VHEIGHT);
    iframe.attr("src", "http://imgur.com/a/"+this.id+"/embed");
    iframe.attr("frameborder", "0");
    iframe.attr("scrolling", "no");
    iframe.css("border", "none");

    this.load = function(data) {
        this.id = data.id;
        this.initImgur()
    }

    this.pause = function() { }

    this.play = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Media.prototype.update = function(data) {
    if(data.id && data.id != this.id) {
        if(data.currentTime < 0) {
            data.currentTime = 0;
        }
        this.load(data);
    }
    if(!USEROPTS.synch) {
        return;
    }
    if(data.paused) {
        this.seek(data.currentTime);
        this.pause();
    }
    else {
        this.play();
    }
    if(LEADER) {
        return;
    }
    this.getTime(function(seconds) {
        var time = data.currentTime;
        var diff = time - seconds || time;

        if(diff > USEROPTS.sync_accuracy) {
            this.seek(time);
        }
        else if(diff < -USEROPTS.sync_accuracy) {
            this.seek(time + 1);
        }
    }.bind(this));
}

Media.prototype.removeOld = function() {
    var old = $("#ytapiplayer");
    var placeholder = $("<div/>").insertBefore(old);
    old.remove();
    placeholder.attr("id", "ytapiplayer");
}

Media.prototype.hide = function() {
    if(!/chrome/ig.test(navigator.userAgent)) {
        return;
    }
    this.size = {
        width: $("#ytapiplayer").attr("width"),
        height: $("#ytapiplayer").attr("height")
    };
    $("#ytapiplayer").attr("width", 1)
        .attr("height", 1);
}

Media.prototype.unhide = function() {
    if(!/chrome/ig.test(navigator.userAgent)) {
        return;
    }
    $("#ytapiplayer").attr("width", this.size.width)
        .attr("height", this.size.height);
}
