(function() {
  var Player, VideoJSPlayer, YouTubePlayer,
    extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;

  Player = (function() {
    function Player(data) {
      this.load(data);
      this.paused = false;
    }

    Player.prototype.load = function(data) {
      this.mediaId = data.id;
      return this.mediaType = data.type;
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
      YouTubePlayer.__super__.constructor.call(this);
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

    YouTubePlayer.prototype.onReady = function() {
      return this.yt.setVolume(VOLUME);
    };

    YouTubePlayer.prototype.onStateChange = function(ev) {};

    return YouTubePlayer;

  })(Player);

}).call(this);
