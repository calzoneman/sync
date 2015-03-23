var VIMEO_FLASH = false;

function removeOld(replace) {
    $("#sc_volume").remove();
    replace = replace || $("<div/>").addClass("embed-responsive-item");
    var old = $("#ytapiplayer");
    replace.insertBefore(old);
    old.remove();
    replace.attr("id", "ytapiplayer");
}

var YouTubePlayer = function (data) {
    var self = this;
    waitUntilDefined(window, "YT", function () {
        waitUntilDefined(YT, "Player", function () {
            removeOld();
            self.paused = false;
            self.videoId = data.id;
            self.videoLength = data.seconds;
            self.theYouTubeDevsNeedToFixThisShit = false;
            self.whyDoesSetPlaybackQualityHaveARaceCondition = true;
            var wmode = USEROPTS.wmode_transparent ? "transparent" : "opaque";
            self.player = new YT.Player("ytapiplayer", {
                videoId: data.id,
                playerVars: {
                    autohide: 1,        // Autohide controls
                    autoplay: 1,        // Autoplay video
                    controls: 1,        // Show controls
                    iv_load_policy: 3,  // No annotations
                    rel: 0,             // No related videos
                    wmode: wmode
                },
                events: {
                    onReady: function () {
                        PLAYER.setVolume(VOLUME);
                    },
                    onStateChange: function (ev) {
                        if (self.whyDoesSetPlaybackQualityHaveARaceCondition) {
                            self.whyDoesSetPlaybackQualityHaveARaceCondition = false;

                            if (USEROPTS.default_quality) {
                                self.player.setPlaybackQuality(USEROPTS.default_quality);
                            }
                        }

                        /**
                         * Race conditions suck.
                         * Race conditions in other peoples' code that you can't fix
                         * but are forced to work around suck more.
                         */
                        if (ev.data === YT.PlayerState.PLAYING &&
                            self.theYouTubeDevsNeedToFixThisShit) {

                            if (USEROPTS.default_quality) {
                                self.player.setPlaybackQuality(USEROPTS.default_quality);
                            }
                            PLAYER.pause();
                            self.theYouTubeDevsNeedToFixThisShit = false;
                        }

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
        });
    });

    self.load = function (data) {
        if(self.player && self.player.loadVideoById) {
            self.player.loadVideoById(data.id, data.currentTime);
            self.whyDoesSetPlaybackQualityHaveARaceCondition = true;
            if (USEROPTS.default_quality) {
                // Try to set it ahead of time, if that works
                // If not, the onStateChange callback will try again anyways
                self.player.setPlaybackQuality(USEROPTS.default_quality);
            }
            self.videoId = data.id;
            self.videoLength = data.seconds;
        }
    };

    self.pause = function () {
        if(self.player && self.player.pauseVideo)
            self.player.pauseVideo();
    };

    self.play = function () {
        if(self.player && self.player.playVideo)
            self.player.playVideo();
    };

    self.getTime = function (callback) {
        if(self.player && self.player.getCurrentTime)
            callback(self.player.getCurrentTime());
    };

    self.seek = function (time) {
        if(self.player && self.player.seekTo)
            self.player.seekTo(time, true);
    };

    self.getVolume = function (cb) {
        if (!self.player || !self.player.getVolume || !self.player.isMuted) {
            return;
        }

        // YouTube's API is strange in the sense that getVolume() returns
        // the regular (unmuted) volume even if it is muted...
        // YouTube's volume is 0..100, normalize it to 0..1
        var vol = self.player.isMuted() ? 0 : (self.player.getVolume() / 100);
        cb(vol);
    };

    self.setVolume = function (vol) {
        if (self.player && self.player.setVolume) {
            if (vol > 0) {
                self.player.unMute();
            }
            self.player.setVolume(vol * 100);
        }
    };
};

var VimeoPlayer = function (data) {
    var self = this;
    waitUntilDefined(window, "$f", function () {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init = function () {
            var iframe = $("<iframe/>");
            removeOld(iframe);
            var prto = location.protocol;
            iframe.attr("src", prto+"//player.vimeo.com/video/"+self.videoId+"?api=1&player_id=ytapiplayer");
            iframe.attr("webkitAllowFullScreen", "");
            iframe.attr("mozallowfullscreen", "");
            iframe.attr("allowFullScreen", "");
            if(USEROPTS.wmode_transparent)
                iframe.attr("wmode", "transparent");
            iframe.css("border", "none");

            $f(iframe[0]).addEvent("ready", function () {
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

                self.setVolume(VOLUME);
            }.bind(self));
        };

        self.load = function (data) {
            self.videoId = data.id;
            self.videoLength = data.seconds;
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

        self.getVolume = function (cb) {
            if (self.player && self.player.api) {
                self.player.api("getVolume", cb);
            }
        };

        self.setVolume = function (vol) {
            self.player.api("setVolume", vol);
        };

        self.init();
    });
};

var VimeoFlashPlayer = function (data) {
    var self = this;
    self.videoId = data.id;
    self.videoLength = data.seconds;
    self.init = function () {
        removeOld();
        var prto = location.protocol;
        var url = prto+"//vimeo.com/moogaloop.swf?clip_id="+self.videoId;
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
            allowScriptAccess: "always",
            wmode: USEROPTS.wmode_transparent ? "transparent" : undefined
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

                self.setVolume(VOLUME);
            });
        });
    };

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
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

    self.getVolume = function (cb) {
        if (self.player && self.player.api_getVolume) {
            cb(self.player.api_getVolume());
        }
    };

    self.setVolume = function (vol) {
        self.player.api_setVolume(vol);
    };

    self.init();
};

var DailymotionPlayer = function (data) {
    var self = this;
    waitUntilDefined(window, "DM", function () {
        removeOld();
        self.videoId = data.id;
        self.videoLength = data.seconds;

        var q = undefined;
        if (USEROPTS.default_quality) {
            /* Map youtube-style quality names to dailymotion values */
            q = {
                small: 240,
                medium: 380,
                large: 480,
                hd720: 720,
                hd1080: 1080,
                highres: 1080
            }[USEROPTS.default_quality];
        }

        var params = {
            autoplay: 1,
            wmode: USEROPTS.wmode_transparent ? "transparent" : "opaque",
            quality: q,
            logo: 0
        };

        self.player = DM.player("ytapiplayer", {
            video: data.id,
            width: parseInt(VWIDTH, 10),
            height: parseInt(VHEIGHT, 10),
            params: params
        });

        self.player.addEventListener("apiready", function (e) {
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
                if (!self.volumeIsSet) {
                    try {
                        self.setVolume(VOLUME);
                        self.volumeIsSet = true;
                    } catch (err) {

                    }
                }
            });
        });
    });

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        if (self.player && self.player.api) {
            self.player.api("load", data.id);
        }
    };

    self.pause = function () {
        if(self.player && self.player.api)
            self.player.api("pause");
    };

    self.play = function () {
        if(self.player && self.player.api)
            self.player.api("play");
    };

    self.getTime = function (callback) {
        if(self.player)
            callback(self.player.currentTime);
    };

    self.seek = function (seconds) {
        if(self.player && self.player.api)
            self.player.api("seek", seconds);
    };

    self.getVolume = function (cb) {
        if (self.player) {
            var volume = self.player.muted ? 0 : self.player.volume;
            /*
             * If the volume was changed by the UI slider, it will be in the range
             * [0, 100], otherwise if it was only set by the API, it will be in [0, 1].
             */
            if (volume > 1) volume /= 100.0;

            cb(volume);
        }
    };

    self.setVolume = function (vol) {
        if (self.player && self.player.api) {
            self.player.api("volume", vol);
        }
    };
};

var SoundcloudPlayer = function (data) {
    var self = this;
    // The getVolume function on their widget throws TypeErrors
    // Go figure
    self.soundcloudIsSeriouslyFuckingBroken = VOLUME;
    self.videoId = data.id;
    self.scuri = data.meta.scuri || self.videoId;
    self.videoLength = data.seconds;
    waitUntilDefined(window, "SC", function () {
        unfixSoundcloudShit();
        var iframe = $("<iframe/>");
        removeOld();
        iframe.appendTo($("#ytapiplayer"));

        iframe.attr("id", "scplayer");
        iframe.attr("src", "https://w.soundcloud.com/player/?url="+self.scuri);
        iframe.css("height", "166px");
        iframe.css("border", "none");

        var volslider = $("<div/>").attr("id", "sc_volume")
            .css("top", "170px")
            .insertAfter(iframe);

        volslider.slider({
            range: "min",
            value: VOLUME * 100,
            stop: function (event, ui) {
                self.player.setVolume(ui.value / 100);
                self.soundcloudIsSeriouslyFuckingBroken = ui.value / 100;
            }
        });

        self.player = SC.Widget("scplayer");

        self.player.bind(SC.Widget.Events.READY, function () {
            self.player.load(self.scuri, { auto_play: true });

            self.player.bind(SC.Widget.Events.PAUSE, function () {
                PLAYER.paused = true;
                if(CLIENT.leader)
                    sendVideoUpdate();
            });

            self.player.bind(SC.Widget.Events.FINISH, function () {
                if(CLIENT.leader) {
                    socket.emit("playNext");
                }
            });

            self.player.bind(SC.Widget.Events.PLAY, function () {
                PLAYER.paused = false;
                if(CLIENT.leader)
                    sendVideoUpdate();
            });

            // THAT'S RIGHT, YOU CAN'T SET THE VOLUME BEFORE IT STARTS PLAYING
            var soundcloudNeedsToFuckingFixTheirPlayer = function () {
                self.setVolume(VOLUME);
                self.player.unbind(SC.Widget.Events.PLAY_PROGRESS);
            };
            self.player.bind(SC.Widget.Events.PLAY_PROGRESS, soundcloudNeedsToFuckingFixTheirPlayer);
        }.bind(self));
    });

    self.load = function (data) {
        self.videoId = data.id;
        self.scuri = data.meta.scuri || self.videoId;
        self.videoLength = data.seconds;
        if(self.player && self.player.load) {
            self.player.load(self.scuri, { auto_play: true });
            var soundcloudNeedsToFuckingFixTheirPlayer = function () {
                self.setVolume(VOLUME);
                self.player.unbind(SC.Widget.Events.PLAY_PROGRESS);
            };
            self.player.bind(SC.Widget.Events.PLAY_PROGRESS, soundcloudNeedsToFuckingFixTheirPlayer);
        }
    };

    self.pause = function () {
        if(self.player && self.player.pause)
            self.player.pause();
    };

    self.play = function () {
        if(self.player && self.player.play)
            self.player.play();
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

    self.getVolume = function (cb) {
        cb(self.soundcloudIsSeriouslyFuckingBroken);
    };

    self.setVolume = function (vol) {
        self.player.setVolume(vol);
    };
};

var LivestreamPlayer = function (data) {
    removeOld();
    var self = this;
    self.videoId = data.id;
    self.videoLength = data.seconds;
    self.init = function () {
        var flashvars = { channel: self.videoId };
        var params = { AllowScriptAccess: "always" };
        var prto = location.protocol;
        swfobject.embedSWF(
            prto+"//cdn.livestream.com/chromelessPlayer/v20/playerapi.swf",
            "ytapiplayer",
            VWIDTH, VHEIGHT,
            "9.0.0",
            "expressInstall.swf",
            flashvars,
            params
        );
    };

    self.load = function(data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () { };

    self.play = function () { };

    self.getTime = function () { };

    self.seek = function () { };

    self.getVolume = function () { };

    self.setVolume = function () { };

    waitUntilDefined(window, "swfobject", function () {
        self.init();
    });
};

var TwitchTVPlayer = function (data) {
    removeOld();
    var self = this;
    self.videoId = data.id;
    self.videoLength = data.seconds;
    self.init = function () {
        var url = "https://www-cdn.jtvnw.net/swflibs/TwitchPlayer.swf?channel="+self.videoId;
        var params = {
            allowFullScreen: "true",
            allowScriptAccess: "always",
            allowNetworking: "all",
            movie: "https://www-cdn.jtvnw.net/swflibs/TwitchPlayer.swf",
            id: "live_embed_player_flash",
            flashvars: "hostname=www.twitch.tv&channel="+self.videoId+"&auto_play=true&start_volume=" + VOLUME
        };
        swfobject.embedSWF(url,
            "ytapiplayer",
            VWIDTH, VHEIGHT,
            "8",
            null, null,
            params,
            {}
        );
    };

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () { };

    self.play = function () { };

    self.getTime = function () { };

    self.seek = function () { };

    self.getVolume = function () { };

    self.setVolume = function () { };

    waitUntilDefined(window, "swfobject", function () {
        self.init();
    });
};

function rtmpEventHandler(id, ev, data) {
    if (ev === "volumechange") {
        PLAYER.volume = (data.muted ? 0 : data.volume);
    }
}

var RTMPPlayer = function (data) {
    removeOld();
    var self =this;
    self.volume = VOLUME;
    self.videoId = data.id;
    self.videoLength = data.seconds;
    self.init = function () {
        var prto = location.protocol;
        var url = prto+"//fpdownload.adobe.com/strobe/FlashMediaPlayback_101.swf";
        var src = encodeURIComponent(self.videoId);
        var params = {
            allowFullScreen: "true",
            allowScriptAccess: "always",
            allowNetworking: "all",
            wMode: "direct",
            movie: prto+"//fpdownload.adobe.com/strobe/FlashMediaPlayback_101.swf",
            flashvars: "src="+src+"&streamType=live&javascriptCallbackFunction=rtmpEventHandler&autoPlay=true&volume=" + VOLUME
        };
        swfobject.embedSWF(url,
            "ytapiplayer",
            VWIDTH, VHEIGHT,
            "8",
            null, null,
            params,
            {}
        );
    };

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () { };

    self.play = function () { };

    self.getTime = function () { };

    self.seek = function () { };

    self.getVolume = function (cb) {
        cb(self.volume);
    };

    self.setVolume = function () { };

    waitUntilDefined(window, "swfobject", function () {
        self.init();
    });
};

var JWPlayer = function (data) {
    var self = this;
    self.videoId = data.id;
    if (data.url) {
        self.videoURL = data.url;
    } else {
        self.videoURL = data.id;
    }
    self.videoLength = data.seconds;
    self.init = function () {
        removeOld();

        jwplayer("ytapiplayer").setup({
            file: self.videoURL,
            width: "100%",
            height: "100%",
            autostart: true,
            type: data.contentType
        });

        jwplayer().onReady(function() {
            $("#ytapiplayer").addClass("embed-responsive-item");
            if ($("#ytapiplayer")[0].tagName === "OBJECT") {
                $("#ytapiplayer").parent().css("position", "absolute");
            }
            handleVideoResize();
        });

        jwplayer().onPlay(function() {
            /* Somehow JWPlayer manages to have THE SAME PROBLEM AS SOUNDCLOUD.
             * It seems to be impossible to set the volume before the video has
             * started playing.  How this is so damn difficult to get right I will
             * never understand.
             */
            self.setVolume(VOLUME);
            self.paused = false;
            if(CLIENT.leader)
                sendVideoUpdate();
        });
        jwplayer().onPause(function() {
            self.paused = true;
            if(CLIENT.leader)
                sendVideoUpdate();
        });
        jwplayer().onComplete(function() {
            socket.emit("playNext");
        });
    };

    self.load = function (data) {
        self.videoId = data.id;
        if (data.url) {
            self.videoURL = data.url;
        } else {
            self.videoURL = data.id;
        }
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () {
        if(jwplayer)
            jwplayer().pause(true);
    };

    self.play = function () {
        if(jwplayer)
            jwplayer().play(true);
    };

    self.getTime = function (callback) {
        // Only return time for non-live media
        if(jwplayer && jwplayer().getDuration() != -1) {
            callback(jwplayer().getPosition());
        }
    };

    self.seek = function (time) {
        if(jwplayer)
            jwplayer().seek(time);
    };

    self.getVolume = function (cb) {
        cb(jwplayer().getVolume() / 100);
    };

    self.setVolume = function (vol) {
        jwplayer().setVolume(vol * 100);
    };

    waitUntilDefined(window, "jwplayer", function () { self.init(); });
};

var UstreamPlayer = function (data) {
    var self = this;
    self.videoId = data.id;
    self.videoLength = data.seconds;
    self.init = function () {
        var iframe = $("<iframe/>");
        removeOld(iframe);
        iframe.attr("width", VWIDTH);
        iframe.attr("height", VHEIGHT);
        iframe.attr("src", "//www.ustream.tv/embed/"+self.videoId+"?v=3&wmode=direct&autoplay=1");
        iframe.attr("frameborder", "0");
        iframe.attr("scrolling", "no");
        iframe.css("border", "none");
    };

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () { };

    self.play = function () { };

    self.getTime = function () { };

    self.seek = function () { };

    self.getVolume = function () { };

    self.setVolume = function () { };

    self.init();
};

var ImgurPlayer = function (data) {
    var self = this;
    self.init = function () {
        var iframe = $("<iframe/>");
        removeOld(iframe);
        iframe.attr("width", VWIDTH);
        iframe.attr("height", VHEIGHT);
        var prto = location.protocol;
        iframe.attr("src", prto+"//imgur.com/a/"+self.videoId+"/embed");
        iframe.attr("frameborder", "0");
        iframe.attr("scrolling", "no");
        iframe.css("border", "none");
    };

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () { };

    self.play = function () { };

    self.getTime = function () { };

    self.seek = function () { };

    self.getVolume = function () { };

    self.setVolume = function () { };

    self.init();
};

var CustomPlayer = function (data) {
    var self = this;
    self.videoId = data.id;
    self.videoLength = data.seconds;
    self.init = function () {
        removeOld();
        var div = $("#ytapiplayer");
        div.attr("id", "");

        /*
         * 2014-12-10
         *
         * If a user is connected via HTTPS and the custom link is
         * HTTP, then the embed fails due to mixed active content
         * policy.  Display a message indicating this.
         */
        if (location.protocol.match(/^https/) &&
            self.videoId.match(/http:/)) {

            div.html("You are currently connected via HTTPS but " +
                "the custom embed link uses non-secure HTTP.  " +
                "Your browser may therefore block it from loading.  " +
                "To fix this, either add the custom embed as a secure " +
                "URL (https://...) if the source supports it, or " +
                "visit this page over plain HTTP (your websocket will still " +
                "use secure HTTPS for communication, just the page " +
                "will load over plain HTTP).");

            // Try to salvage the link
            self.videoId = self.videoId.replace(/http:/g, "https:");
        }
        div.append(self.videoId);

        self.player = div.find("iframe");
        if(self.player.length === 0) self.player = div.find("object");
        if(self.player.length === 0) self.player = div;
        self.player.attr("id", "ytapiplayer");
        self.player.attr("width", VWIDTH);
        self.player.attr("height", VHEIGHT);
    };

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () { };

    self.play = function () { };

    self.getTime = function () { };

    self.seek = function () { };

    self.getVolume = function () { };

    self.setVolume = function () { };

    self.init();
};

function FilePlayer(data) {
    var self = this;

    self.init = function (data) {
        if (!data.url) {
            return;
        }
        self.videoId = data.id;
        self.videoURL = data.url;
        var isAudio = data.meta.codec && data.meta.codec.match(/^mp3$|^vorbis$/);
        var video;
        if (isAudio) {
            video = $("<audio/>");
        } else {
            video = $("<video/>")
        }
        video
            .addClass("embed-responsive-item")
            .attr("src", self.videoURL)
            .attr("controls", "controls")
            .attr("id", "#ytapiplayer")
            .attr("width", VWIDTH)
            .attr("height", VHEIGHT)
            .attr("autoplay", true)
            .html("Your browser does not support HTML5 <code>&lt;video&gt;</code> tags :(");
        video.error(function (err) {
            setTimeout(function () {
                console.log("<video> tag failed, falling back to Flash");
                console.log(err);
                PLAYER = new JWPlayer(data);
                PLAYER.type = "jw";
            }, 100);
        });
        removeOld(video);
        self.player = video[0];
        if (!Object.hasOwnProperty.call(self, "paused")) {
            Object.defineProperty(self, "paused", {
                get: function () {
                    return self.player.paused;
                }
            });
        }
        self.player.onpause = function () {
            self.paused = true;
            if (CLIENT.leader) {
                sendVideoUpdate();
            }
        };
        self.player.onplay = function () {
            self.paused = false;
            if (CLIENT.leader) {
                sendVideoUpdate();
            }
        };
        self.player.onended = function () {
            if (CLIENT.leader) {
                socket.emit("playNext");
            }
        };
        self.setVolume(VOLUME);
    };

    self.load = function (data) {
        if (data.forceFlash) {
            self.initFlash(data);
        } else {
            self.init(data);
        }
    };

    self.pause = function () {
        if (self.player) {
            self.player.pause();
        }
    };

    self.play = function () {
        if (self.player) {
            self.player.play();
        }
    };

    self.getTime = function (callback) {
        if (self.player) {
            callback(self.player.currentTime);
        }
    };

    self.seek = function (time) {
        if (self.player) {
            try {
                self.player.currentTime = time;
            } catch (e) {
            }
        }
    };

    self.getVolume = function (cb) {
        if (self.player) {
            if (self.player.muted) {
                cb(0);
            } else {
                cb(self.player.volume);
            }
        }
    };

    self.setVolume = function (vol) {
        if (self.player) {
            self.player.volume = vol;
        }
    };

    if (data.forceFlash) {
        setTimeout(function () {
            PLAYER = new JWPlayer(data);
            PLAYER.type = "jw";
        }, 1);
    } else {
        self.init(data);
    }
};

var HitboxPlayer = function (data) {
    var self = this;
    self.videoId = data.id;
    self.videoLength = data.seconds;
    self.init = function () {
        if (location.protocol.match(/^https/)) {
            var div = makeAlert("Security Policy",
                "You are currently connected via HTTPS but " +
                "Hitbox only supports plain HTTP.  Due to browser " +
                "security policy, the embed player cannot be loaded.  " +
                "In order to watch the video, you must visit this page " +
                "from its plain HTTP URL (your websocket will still be " +
                "secured with HTTPS).  Please complain to Hitbox about this.",
                "alert-danger");
            div.addClass("embed-responsive-item");
            removeOld(div);
            return;
        }

        var iframe = $("<iframe/>")
            .attr("src", "http://hitbox.tv/embed/" + self.videoId)
            .attr("webkitAllowFullScreen", "")
            .attr("mozallowfullscreen", "")
            .attr("allowFullScreen", "");

        if (USEROPTS.wmode_transparent)
            iframe.attr("wmode", "transparent");

        removeOld(iframe);
        self.player = iframe;
    };

    self.load = function (data) {
        self.videoId = data.id;
        self.videoLength = data.seconds;
        self.init();
    };

    self.pause = function () { };

    self.play = function () { };

    self.getTime = function () { };

    self.seek = function () { };

    self.getVolume = function () { };

    self.setVolume = function () { };

    self.init();
};

function handleMediaUpdate(data) {
    // Don't update if the position is past the video length, but
    // make an exception when the video length is 0 seconds
    if (typeof PLAYER.videoLength === "number") {
        if (PLAYER.videoLength > 0 &&
            data.currentTime > PLAYER.videoLength) {
            return;
        }
    }
    var wait = data.currentTime < 0;
    // Media change
    if(data.id && data.id !== PLAYER.videoId) {
        if(data.currentTime < 0)
            data.currentTime = 0;
        PLAYER.load(data);
        PLAYER.play();
    }

    if (wait) {
        /* Stupid hack -- In this thrilling episode of
           "the YouTube API developers should eat a boat", the
           HTML5 player apparently breaks if I play()-seek(0)-pause()
           quickly (as a "start buffering but don't play yet"
           mechanism)

           Addendum 2014-05-09
           Made this slightly less hacky by waiting for a PLAYING event
           to fire instead of just waiting 500ms and assuming that's
           long enough
        */
        if (PLAYER.type === "yt") {
            PLAYER.theYouTubeDevsNeedToFixThisShit = true;
        } else {
            PLAYER.seek(0);
            PLAYER.pause();
        }
        return;
    } else if (PLAYER.type === "yt") {
        PLAYER.theYouTubeDevsNeedToFixThisShit = false;
    }

    // Don't synch if leader or synch disabled
    if(CLIENT.leader || !USEROPTS.synch)
        return;

    // Handle pause/unpause
    if(data.paused) {
        if (!PLAYER.paused) {
            PLAYER.seek(data.currentTime);
            PLAYER.pause();
        }
    } else {
        if (PLAYER.paused) {
            PLAYER.play();
        }
    }

    // Handle time change
    PLAYER.getTime(function (seconds) {
        var time = data.currentTime;
        var diff = time - seconds || time;
        var acc = USEROPTS.sync_accuracy;
        // Dailymotion can't seek more accurately than to the nearest
        // 2 seconds.  It gets stuck looping portions of the video
        // at the default synch accuracy of 2.
        // I've found 5 works decently.
        if (PLAYER.type === "dm")
            acc = Math.max(acc, 5.0);

        if(diff > acc) {
            PLAYER.seek(time);
        } else if(diff < -acc) {
            // Don't synch all the way back, causes buffering problems
            // because for some dumb reason YouTube erases the buffer
            // when you seek backwards
            //
            // ADDENDUM 2013-10-24 Except for dailymotion because
            // their player is inaccurate
            if (PLAYER.type !== "dm")
                time += 1;
            PLAYER.seek(time);
        }
    });
}

var constructors = {
    "yt": YouTubePlayer,
    "vi": VIMEO_FLASH ? VimeoFlashPlayer : VimeoPlayer,
    "dm": DailymotionPlayer,
    "sc": SoundcloudPlayer,
    "li": LivestreamPlayer,
    "tw": TwitchTVPlayer,
    "us": UstreamPlayer,
    "jw": JWPlayer,
    "im": ImgurPlayer,
    "cu": CustomPlayer,
    "rt": RTMPPlayer,
    "rv": FilePlayer,
    "fi": FilePlayer,
    "hb": HitboxPlayer
};

function loadMediaPlayer(data) {
    if(data.type in constructors) {
        PLAYER = new constructors[data.type](data);
        PLAYER.type = data.type;
    }
}
