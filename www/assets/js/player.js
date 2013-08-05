/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var VIMEO_FLASH = false;

var Player = function(data) {
    if(!data) {
        data = {
            id: "",
            type: "null"
        };
    }
    this.id = data.id;
    this.type = data.type;
    this.length = data.length;
    this.currentTime = data.currentTime || 0;
    this.diff = 0;

    function postInit() {
        this.load(data);
    }
    postInit.bind(this);

    switch(this.type) {
        case "yt":
            this.initYouTube();
            break;
        case "vi":
            if(VIMEO_FLASH)
                this.initVimeoFlash();
            else
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
        case "cu":
            this.initCustom();
            break;
        default:
            this.nullPlayer();
            break;
    }
}

function removeOld(replace) {
    replace = replace || $("<div/>");
    var old = $("#ytapiplayer");
    replace.insertBefore(old);
    old.remove();
    replace.attr("id", "ytapiplayer");
}

var YouTubePlayer = function (data) {
    var self = this;
    waitUntilDefined(window, "YT", function () {
        removeOld();
        self.paused = false;
        self.videoId = data.id;
        self.player = new YT.Player("ytapiplayer", {
            height: VHEIGHT,
            width: VWIDTH,
            videoId: data.id,
            playerVars: {
                autohide: 1,        // Autohide controls
                autoplay: 1,        // Autoplay video
                controls: 1,        // Show controls
                iv_load_policy: 3,  // No annotations
                modestbranding: 1,  // No logo
                rel: 0              // No related videos
            },
            events: {
                onReady: function() {
                    //socket.emit("playerReady");
                },
                onStateChange: function(ev) {
                    if(PLAYER.paused && ev.data != YT.PlayerState.PAUSED ||
                       !PLAYER.paused && ev.data == YT.PlayerState.PAUSED) {
                        self.paused = (ev.data == YT.PlayerState.PAUSED);
                        if(CLIENT.leader)
                            sendVideoUpdate();
                    }
                    else {
                        self.paused = (ev.data == YT.PlayerState.PAUSED);
                    }
                    if(CLIENT.leader && ev.data == YT.PlayerState.ENDED) {
                        socket.emit("playNext");
                    }
                }
            }
        });
        $("#ytapiplayer").css("border", "none");

        self.load = function (data) {
            if(self.player.loadVideoById) {
                self.player.loadVideoById(data.id, data.currentTime);
                if(VIDEOQUALITY)
                    self.player.setPlaybackQuality(VIDEOQUALITY);
                self.videoId = data.id;
            }
        };

        self.pause = function() {
            if(self.player.pauseVideo)
                self.player.pauseVideo();
        };

        self.play = function() {
            if(self.player.playVideo)
                self.player.playVideo();
        };

        self.isPaused = function(callback) {
            if(self.player.getPlayerState) {
                var state = self.player.getPlayerState();
                callback(state != YT.PlayerState.PLAYING);
            } else {
                callback(false);
            }
        };

        self.getTime = function(callback) {
            if(self.player.getCurrentTime)
                callback(self.player.getCurrentTime());
        };

        self.seek = function(time) {
            if(self.player.seekTo)
                self.player.seekTo(time, true);
        };
    });
};

var VimeoPlayer = function (data) {
    var self = this;
    waitUntilDefined(window, "$f", function () {
        self.videoId = data.id;
        self.init = function () {
            var iframe = $("<iframe/>");
            removeOld(iframe);
            iframe.attr("width", VWIDTH);
            iframe.attr("height", VHEIGHT);
            iframe.attr("src", "http://player.vimeo.com/video/"+self.videoId+"?api=1&player_id=ytapiplayer");
            iframe.attr("webkitAllowFullScreen", "");
            iframe.attr("mozallowfullscreen", "");
            iframe.attr("allowFullScreen", "");
            iframe.css("border", "none");

            $f(iframe[0]).addEvent("ready", function () {
                //socket.emit("playerReady");
                self.player = $f(iframe[0]);
                self.player.api("play");

                self.player.addEvent("finish", function () {
                    if(CLIENT.leader) {
                        socket.emit("playNext");
                    }
                });

                self.player.addEvent("pause", function () {
                    self.paused = true;
                    if(CLIENT.leader)
                        sendVideoUpdate();
                });

                self.player.addEvent("play", function () {
                    self.paused = false;
                    if(CLIENT.leader)
                        sendVideoUpdate();
                });
            }.bind(self));
        };

        self.init();

        self.load = function (data) {
            self.videoId = data.id;
            self.init();
        };

        self.pause = function () {
            if(self.player && self.player.api)
                self.player.api("pause");
        };

        self.play = function () {
            if(self.player && self.player.api)
                self.player.api("play");
        };

        self.isPaused = function (callback) {
            callback(self.paused);
        };

        self.getTime = function (callback) {
            if(self.player && self.player.api) {
                // Vimeo api returns time as a string because fuck logic
                self.player.api("getCurrentTime", function (time) {
                    callback(parseFloat(time));
                });
            }
        };

        self.seek = function(time) {
            if(self.player && self.player.api)
                self.player.api("seekTo", time);
        };
    });
};

var VimeoFlashPlayer = function (data) {
    var self = this;
    self.videoId = data.id;
    self.init = function () {
        removeOld();
        var url = "http://vimeo.com/moogaloop.swf?clip_id="+self.videoId;
        url += "&" + [
            "server=vimeo.com",
            "api=2",
            "show_title=0",
            "show_byline=0",
            "show_portrait=0",
            "fullscreen=1",
            "loop=0"
        ].join("&");
        var flashvars = {
            api: 2,
            player_id: "ytapiplayer"
        };
        var params = {
            allowfullscreen: true,
            allowScriptAccess: "always"
        };
        swfobject.embedSWF(url,
                           "ytapiplayer",
                           VWIDTH,
                           VHEIGHT,
                           "9.0.0",
                           "expressInstall.swf",
                           flashvars,
                           params);

        self.player = $("#ytapiplayer")[0];
        waitUntilDefined(self.player, "api_addEventListener", function () {
            self.player.api_addEventListener("ready", function () {
                //socket.emit("playerReady");
                self.player.api_play();

                self.player.api_addEvent("finish", function () {
                    if(CLIENT.leader)
                        socket.emit("playNext");
                });

                self.player.api_addEvent("pause", function () {
                    PLAYER.paused = true;
                    if(CLIENT.leader)
                        sendVideoUpdate();
                });

                self.player.api_addEvent("play", function () {
                    PLAYER.paused = false;
                    if(CLIENT.leader)
                        sendVideoUpdate();
                });
            });
        });
    };

    self.init();

    self.load = function (data) {
        self.videoId = data.id;
        self.init();
    };

    self.pause = function () {
        if(self.player && self.player.api_pause)
            self.player.api_pause();
    };

    self.play = function () {
        if(self.player && self.player.api_play)
            self.player.api_play();
    };

    self.isPaused = function (callback) {
        callback(self.paused);
    };

    self.getTime = function (callback) {
        if(self.player && self.player.api_getCurrentTime) {
            var t = parseFloat(self.player.api_getCurrentTime());
            callback(t);
        }
    };

    self.seek = function (time) {
        if(self.player.api_seekTo);
            self.player.api_seekTo(time);
    };
};

var DailymotionPlayer = function (data) {
    var self = this;
    waitUntilDefined(window, "DM", function () {
        removeOld();
        self.videoId = data.id;
        self.player = DM.player("ytapiplayer", {
            video: data.id,
            width: parseInt(VWIDTH),
            height: parseInt(VHEIGHT),
            params: { autoplay: 1 }
        });

        self.player.addEventListener("apiready", function (e) {
            //socket.emit("playerReady");
            self.player.addEventListener("ended", function (e) {
                if(CLIENT.leader) {
                    socket.emit("playNext");
                }
            });

            self.player.addEventListener("pause", function (e) {
                PLAYER.paused = true;
                if(CLIENT.leader)
                    sendVideoUpdate();
            });

            self.player.addEventListener("playing", function (e) {
                PLAYER.paused = false;
                if(CLIENT.leader)
                    sendVideoUpdate();
            });
        });
    });

    self.load = function (data) {
        self.videoId = data.id;
        if(self.player && self.player.api)
            self.player.api("load", data.id);
    };

    self.pause = function () {
        if(self.player && self.player.api)
            self.player.api("pause");
    };

    self.play = function () {
        if(self.player && self.player.api)
            self.player.api("play");
    };

    self.isPaused = function (callback) {
        callback(self.paused);
    };

    self.getTime = function (callback) {
        if(self.player)
            callback(self.player.currentTime);
    };

    self.seek = function (seconds) {
        if(self.player && self.player.api)
            self.player.api("seek", seconds);
    };
};

var SoundcloudPlayer = function (data) {
    var self = this;
    self.videoId = data.id;
    waitUntilDefined(window, "SC", function () {
        unfixSoundcloudShit();
        var iframe = $("<iframe/>");
        removeOld(iframe);

        iframe.attr("id", "ytapiplayer");
        iframe.attr("src", "https://w.soundcloud.com/player/?url="+self.videoId);
        iframe.css("width", "100%").attr("height", "166");
        iframe.css("border", "none");

        self.player = SC.Widget("ytapiplayer");

        self.player.bind(SC.Widget.Events.READY, function () {
            //socket.emit("playerReady");
            self.player.load(self.videoId, { auto_play: true });

            self.player.bind(SC.Widget.Events.PAUSE, function () {
                PLAYER.paused = true;
                if(CLIENT.leader)
                    sendVideoUpdate();
            });

            self.player.bind(SC.Widget.Events.PLAY, function () {
                PLAYER.paused = false;
                if(CLIENT.leader)
                    sendVideoUpdate();
            });

            self.player.bind(SC.Widget.Events.FINISH, function () {
                if(CLIENT.leader) {
                    socket.emit("playNext");
                }
            });
        }.bind(self));
    });

    self.load = function (data) {
        self.videoId = data.id;
        if(self.player && self.player.load)
            self.player.load(data.id, { auto_play: true });
    };

    self.pause = function () {
        if(self.player && self.player.pause)
            self.player.pause();
    };

    self.play = function () {
        if(self.player && self.player.play)
            self.player.play();
    };

    self.isPaused = function (callback) {
        if(self.player && self.player.isPaused)
            self.player.isPaused(callback);
        else
            callback(false);
    };

    self.getTime = function (callback) {
        if(self.player && self.player.getPosition) {
            self.player.getPosition(function (pos) {
                callback(pos / 1000);
            });
        }
    };

    self.seek = function (seconds) {
        if(self.player && self.player.seekTo)
            self.player.seekTo(seconds * 1000);
    };
};

Player.prototype.initLivestream = function() {
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

    this.isPaused = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Player.prototype.initTwitch = function() {
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

    this.isPaused = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Player.prototype.initJustinTV = function() {
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
        this.initJustinTV();
    }

    this.pause = function() { }

    this.play = function() { }

    this.isPaused = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Player.prototype.initRTMP = function() {
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
        this.initRTMP();
    }

    this.pause = function() { }

    this.play = function() { }

    this.isPaused = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Player.prototype.initJWPlayer = function() {
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

    this.isPaused = function(callback) {
        callback(jwplayer().getState() !== "PLAYING");
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

Player.prototype.initUstream = function() {
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

    this.isPaused = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Player.prototype.initImgur = function() {
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

    this.isPaused = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Player.prototype.initCustom = function() {
    var div = $("<div/>").insertBefore($("#ytapiplayer"));
    $("#ytapiplayer").remove();
    div.append(this.id);

    this.player = div.find("iframe")
    if(this.player.length === 0) this.player = div.find("object");
    if(this.player.length === 0) this.player = div;
    this.player.attr("id", "ytapiplayer");
    this.player.attr("width", VWIDTH);
    this.player.attr("height", VHEIGHT);

    this.load = function(data) {
        this.id = data.id;
        this.initCustom()
    }

    this.pause = function() { }

    this.play = function() { }

    this.isPaused = function() { }

    this.getTime = function() { }

    this.seek = function() { }
}

Player.prototype.update = function(data) {
    this.currentTime = data.currentTime;
    if(data.id && data.id != this.id) {
        if(data.currentTime < 0) {
            data.currentTime = 0;
        }
        this.load(data);
        this.play();
    }
    if(CLIENT.leader) {
        return;
    }
    if(!USEROPTS.synch) {
        return;
    }
    if(data.paused) {
        this.seek(data.currentTime);
        this.pause();
    }
    else {
        this.isPaused(function(paused) {
            paused && this.play();
        }.bind(this));
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

Player.prototype.removeOld = function() {
    var old = $("#ytapiplayer");
    var placeholder = $("<div/>").insertBefore(old);
    old.remove();
    placeholder.attr("id", "ytapiplayer");
}

Player.prototype.hide = function() {
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

Player.prototype.unhide = function() {
    if(!/chrome/ig.test(navigator.userAgent)) {
        return;
    }
    $("#ytapiplayer").attr("width", this.size.width)
        .attr("height", this.size.height);
}
