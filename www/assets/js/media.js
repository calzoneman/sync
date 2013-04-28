var Media = function(data) {
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
        case "rt":
            this.initRTMP();
            break;
        case "jw":
            this.initJWPlayer();
            break;
        default:
            break;
    }
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
            onPlayerReady: function() {
                socket.emit("playerReady");
            },
            onStateChange: function(ev) {
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
        this.player = $f(iframe[0]);
        this.player.api("play");

        this.player.addEvent("finish", function() {
            if(LEADER) {
                socket.emit("playNext");
            }
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
        this.player.api("getCurrentTime", callback);
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

    this.player.addEventListener("ended", function(e) {
        if(LEADER) {
            socket.emit("playNext");
        }
    });

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
    this.player.load(this.id, {auto_play: true});

    this.player.bind(SC.Widget.Events.FINISH, function() {
        if(LEADER) {
            socket.emit("playNext");
        }
    });

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
    this.removeOld();

    jwplayer("ytapiplayer").setup({
        file: this.id,
        width: VWIDTH,
        height: VHEIGHT,
        autostart: true
    });
    setTimeout(function() {$("#ytapiplayer_logo").remove();}, 1000);

    this.load = function(data) {
        this.id = data.id;
        this.initJWPlayer();
    }

    this.pause = function() { }

    this.play = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Media.prototype.update = function(data) {
    if(data.id != this.id) {
        if(data.currentTime < 0) {
            data.currentTime = 0;
        }
        this.load(data);
    }
    if(!USEROPTS.synch) {
        return;
    }
    if(data.paused) {
        this.pause();
    }
    if(LEADER) {
        return;
    }
    this.getTime(function(seconds) {
        var time = data.currentTime;
        var diff = time - seconds || time;

        var a = SYNC_THRESHOLD + 1;
        // If 2 updates in a row have lag, compensate for buffering
        if(diff >= a && diff <= 6 && this.diff >= a && this.diff <= 6) {
            this.seek(time + diff);
        }
        else if(diff < -2 || diff >= SYNC_THRESHOLD) {
            if(diff < 0) {
                this.seek(time + 0.5);
            }
            else {
                this.seek(time);
            }
        }
        this.diff = diff;
    }.bind(this));
}

Media.prototype.removeOld = function() {
    var old = $("#ytapiplayer");
    var placeholder = $("<div/>").insertBefore(old);
    old.remove();
    placeholder.attr("id", "ytapiplayer");
}
