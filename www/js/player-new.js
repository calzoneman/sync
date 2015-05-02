(function() {
  var Player, TYPE_MAP, VimeoPlayer, YouTubePlayer,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  window.Player = Player = (function() {
    function Player(data) {
      if (!(this instanceof Player)) {
        return new Player(data);
      }
      this.setMediaProperties(data);
      this.paused = false;
    }

    Player.prototype.load = function(data) {
      return this.setMediaProperties(data);
    };

    Player.prototype.setMediaProperties = function(data) {
      this.mediaId = data.id;
      this.mediaType = data.type;
      return this.mediaLength = data.seconds;
    };

    Player.prototype.play = function() {
      return this.paused = false;
    };

    Player.prototype.pause = function() {
      return this.paused = true;
    };

    Player.prototype.seekTo = function(time) {};

    Player.prototype.setVolume = function(volume) {};

    Player.prototype.getTime = function(cb) {
      return cb(0);
    };

    Player.prototype.isPaused = function(cb) {
      return cb(this.paused);
    };

    Player.prototype.getVolume = function(cb) {
      return cb(VOLUME);
    };

    return Player;

  })();

  window.VimeoPlayer = VimeoPlayer = (function(superClass) {
    extend(VimeoPlayer, superClass);

    function VimeoPlayer(data) {
      if (!(this instanceof VimeoPlayer)) {
        return new VimeoPlayer(data);
      }
      this.load(data);
    }

    VimeoPlayer.prototype.load = function(data) {
      this.setMediaProperties(data);
      return waitUntilDefined(window, '$f', (function(_this) {
        return function() {
          var video;
          video = $('<iframe/>');
          removeOld(video);
          video.attr({
            src: "https://player.vimeo.com/video/" + data.id + "?api=1&player_id=ytapiplayer",
            webkitallowfullscreen: true,
            mozallowfullscreen: true,
            allowfullscreen: true
          });
          if (USEROPTS.wmode_transparent) {
            video.attr('wmode', 'transparent');
          }
          return $f(video[0]).addEvent('ready', function() {
            _this.vimeo = $f(video[0]);
            _this.play();
            _this.vimeo.addEvent('finish', function() {
              if (CLIENT.leader) {
                return socket.emit('playNext');
              }
            });
            _this.vimeo.addEvent('pause', function() {
              _this.paused = true;
              if (CLIENT.leader) {
                return sendVideoUpdate();
              }
            });
            _this.vimeo.addEvent('play', function() {
              _this.paused = false;
              if (CLIENT.leader) {
                return sendVideoUpdate();
              }
            });
            return _this.setVolume(VOLUME);
          });
        };
      })(this));
    };

    VimeoPlayer.prototype.play = function() {
      this.paused = false;
      if (this.vimeo) {
        return this.vimeo.api('play');
      }
    };

    VimeoPlayer.prototype.pause = function() {
      this.paused = true;
      if (this.vimeo) {
        return this.vimeo.api('pause');
      }
    };

    VimeoPlayer.prototype.seekTo = function(time) {
      if (this.vimeo) {
        return this.vimeo.api('seekTo', time);
      }
    };

    VimeoPlayer.prototype.setVolume = function(volume) {
      if (this.vimeo) {
        return this.vimeo.api('setVolume', volume);
      }
    };

    VimeoPlayer.prototype.getTime = function(cb) {
      if (this.vimeo) {
        return this.vimeo.api('getCurrentTime', function(time) {
          return cb(parseFloat(time));
        });
      } else {
        return cb(0);
      }
    };

    VimeoPlayer.prototype.getVolume = function(cb) {
      if (this.vimeo) {
        return this.vimeo.api('getVolume', cb);
      } else {
        return cb(VOLUME);
      }
    };

    return VimeoPlayer;

  })(Player);

  window.YouTubePlayer = YouTubePlayer = (function(superClass) {
    extend(YouTubePlayer, superClass);

    function YouTubePlayer(data) {
      if (!(this instanceof YouTubePlayer)) {
        return new YouTubePlayer(data);
      }
      this.setMediaProperties(data);
      this.qualityRaceCondition = true;
      this.pauseSeekRaceCondition = false;
      waitUntilDefined(window, 'YT', (function(_this) {
        return function() {
          return waitUntilDefined(YT, 'Player', function() {
            var wmode;
            removeOld();
            wmode = USEROPTS.wmode_transparent ? 'transparent' : 'opaque';
            return _this.yt = new YT.Player('ytapiplayer', {
              videoId: data.id,
              playerVars: {
                autohide: 1,
                autoplay: 1,
                controls: 1,
                iv_load_policy: 3,
                rel: 0,
                wmode: wmode
              },
              events: {
                onReady: _this.onReady.bind(_this),
                onStateChange: _this.onStateChange.bind(_this)
              }
            });
          });
        };
      })(this));
    }

    YouTubePlayer.prototype.load = function(data) {
      this.setMediaProperties(data);
      if (this.yt && this.yt.ready) {
        this.yt.loadVideoById(data.id, data.currentTime);
        this.qualityRaceCondition = true;
        if (USEROPTS.default_quality) {
          return this.setQuality(USEROPTS.default_quality);
        }
      } else {
        return console.error('WTF?  YouTubePlayer::load() called but yt is not ready');
      }
    };

    YouTubePlayer.prototype.onReady = function() {
      this.yt.ready = true;
      return this.setVolume(VOLUME);
    };

    YouTubePlayer.prototype.onStateChange = function(ev) {
      if (this.qualityRaceCondition) {
        this.qualityRaceCondition = false;
        if (USEROPTS.default_quality) {
          this.setQuality(USEROPTS.default_quality);
        }
      }
      if (ev.data === YT.PlayerState.PLAYING && this.pauseSeekRaceCondition) {
        this.pause();
        this.pauseSeekRaceCondition = false;
      }
      if ((ev.data === YT.PlayerState.PAUSED && !this.paused) || (ev.data === YT.PlayerState.PLAYING && this.paused)) {
        this.paused = ev.data === YT.PlayerState.PAUSED;
        if (CLIENT.leader) {
          sendVideoUpdate();
        }
      }
      if (ev.data === YT.PlayerState.ENDED && CLIENT.leader) {
        return socket.emit('playNext');
      }
    };

    YouTubePlayer.prototype.play = function() {
      this.paused = false;
      if (this.yt && this.yt.ready) {
        return this.yt.playVideo();
      }
    };

    YouTubePlayer.prototype.pause = function() {
      this.paused = true;
      if (this.yt && this.yt.ready) {
        return this.yt.pauseVideo();
      }
    };

    YouTubePlayer.prototype.seekTo = function(time) {
      if (this.yt && this.yt.ready) {
        return this.yt.seekTo(time, true);
      }
    };

    YouTubePlayer.prototype.setVolume = function(volume) {
      if (this.yt && this.yt.ready) {
        if (volume > 0) {
          this.yt.unMute();
        }
        return this.yt.setVolume(volume * 100);
      }
    };

    YouTubePlayer.prototype.setQuality = function(quality) {
      var ytQuality;
      if (!this.yt || !this.yt.ready) {
        return;
      }
      ytQuality = (function() {
        switch (String(quality)) {
          case "240":
            return "small";
          case "360":
            return "medium";
          case "480":
            return "large";
          case "720":
            return "hd720";
          case "1080":
            return "hd1080";
          case "best":
            return "highres";
          default:
            return "auto";
        }
      })();
      if (ytQuality !== "auto") {
        return this.yt.setPlaybackQuality(ytQuality);
      }
    };

    YouTubePlayer.prototype.getTime = function(cb) {
      if (this.yt && this.yt.ready) {
        return cb(this.yt.getCurrentTime());
      } else {
        return cb(0);
      }
    };

    YouTubePlayer.prototype.getVolume = function(cb) {
      if (this.yt && this.yt.ready) {
        if (this.yt.isMuted()) {
          return cb(0);
        } else {
          return cb(this.yt.getVolume() / 100);
        }
      } else {
        return cb(VOLUME);
      }
    };

    return YouTubePlayer;

  })(Player);

  TYPE_MAP = {
    yt: YouTubePlayer,
    vi: VimeoPlayer
  };

  window.loadMediaPlayer = function(data) {
    var e;
    if (data.type in TYPE_MAP) {
      try {
        return window.PLAYER = TYPE_MAP[data.type](data);
      } catch (_error) {
        e = _error;
        return console.error(e);
      }
    }
  };

  window.handleMediaUpdate = function(data) {
    var PLAYER, waiting;
    PLAYER = window.PLAYER;
    if (typeof PLAYER.mediaLength === 'number' && PLAYER.mediaLength > 0 && data.currentTime > PLAYER.mediaLength) {
      return;
    }
    waiting = data.currentTime < 0;
    if (data.id && data.id !== PLAYER.mediaId) {
      if (data.currentTime < 0) {
        data.currentTime = 0;
      }
      PLAYER.load(data);
      PLAYER.play();
    }
    if (waiting) {
      PLAYER.seekTo(0);
      if (PLAYER instanceof YouTubePlayer) {
        PLAYER.pauseSeekRaceCondition = true;
      } else {
        PLAYER.pause();
      }
      return;
    } else if (PLAYER instanceof YouTubePlayer) {
      PLAYER.pauseSeekRaceCondition = false;
    }
    if (CLIENT.leader || !USEROPTS.synch) {
      return;
    }
    if (data.paused && !PLAYER.paused) {
      PLAYER.seekTo(data.currentTime);
      PLAYER.pause();
    } else if (PLAYER.paused) {
      PLAYER.play();
    }
    return PLAYER.getTime(function(seconds) {
      var accuracy, diff, time;
      time = data.currentTime;
      diff = (time - seconds) || time;
      accuracy = USEROPTS.sync_accuracy;
      if (PLAYER.mediaType === 'dm') {
        accuracy = Math.max(accuracy, 5);
      }
      if (diff > accuracy) {
        return PLAYER.seekTo(time);
      } else if (diff < -accuracy) {
        if (PLAYER.mediaType !== 'dm') {
          time += 1;
        }
        return PLAYER.seekTo(time);
      }
    });
  };

  window.removeOld = function(replace) {
    var old;
    $('#sc_volume').remove();
    if (replace == null) {
      replace = $('<div/>').addClass('embed-responsive-item');
    }
    old = $('#ytapiplayer');
    replace.insertBefore(old);
    old.remove();
    replace.attr('id', 'ytapiplayer');
    return replace;
  };

}).call(this);
