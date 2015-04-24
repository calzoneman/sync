(function() {
  var Player, VideoJSPlayer, YouTubePlayer,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Player = (function() {
    function Player(data) {
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

  window.Player = Player;

  window.removeOld = function(replace) {
    var old;
    $('#sc_volume').remove();
    if (replace == null) {
      replace = $('<div/>').addClass('embed-responsive-item');
    }
    old = $('#ytapiplayer');
    replace.insertBefore(old);
    old.remove();
    return replace.attr('id', 'ytapiplayer');
  };

  VideoJSPlayer = (function(superClass) {
    extend(VideoJSPlayer, superClass);

    function VideoJSPlayer(data) {}

    VideoJSPlayer.prototype.load = function(data) {
      var video;
      return video = $('<video/>').addClass('video-js vjs-default-skin embed-responsive-item');
    };

    return VideoJSPlayer;

  })(Player);

  YouTubePlayer = (function(superClass) {
    extend(YouTubePlayer, superClass);

    function YouTubePlayer(data) {
      this.setMediaProperties(data);
      this.qualityRaceCondition = true;
      this.pauseSeekRaceCondition = true;
      waitUntilDefined(window, 'YT', (function(_this) {
        return function() {
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
        };
      })(this));
    }

    YouTubePlayer.prototype.load = function(data) {
      YouTubePlayer.__super__.load.call(this, data);
      if (this.yt) {
        this.yt.loadVideoById(data.id, data.currentTime);
        this.qualityRaceCondition = true;
        if (USEROPTS.default_quality) {
          return this.yt.setPlaybackQuality(USEROPTS.default_quality);
        }
      }
    };

    YouTubePlayer.prototype.onReady = function() {
      return this.yt.setVolume(VOLUME);
    };

    YouTubePlayer.prototype.onStateChange = function(ev) {
      if (this.qualityRaceCondition) {
        this.qualityRaceCondition = false;
        this.yt.setPlaybackQuality(USEROPTS.default_quality);
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
      YouTubePlayer.__super__.play.call(this);
      if (this.yt) {
        return this.yt.playVideo();
      }
    };

    YouTubePlayer.prototype.pause = function() {
      YouTubePlayer.__super__.pause.call(this);
      if (this.yt) {
        return this.yt.pauseVideo();
      }
    };

    YouTubePlayer.prototype.seekTo = function(time) {
      if (this.yt) {
        return this.yt.seekTo(time, true);
      }
    };

    YouTubePlayer.prototype.setVolume = function(volume) {
      if (this.yt) {
        if (volume > 0) {
          this.yt.unMute();
        }
        return this.yt.setVolume(volume * 100);
      }
    };

    YouTubePlayer.prototype.getTime = function(cb) {
      if (this.yt) {
        return cb(this.yt.getCurrentTime());
      }
    };

    YouTubePlayer.prototype.getVolume = function(cb) {
      if (this.yt) {
        if (this.yt.isMuted()) {
          return 0;
        } else {
          return this.yt.getVolume() / 100.0;
        }
      }
    };

    return YouTubePlayer;

  })(Player);

}).call(this);
