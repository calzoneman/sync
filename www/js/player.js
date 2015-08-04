(function() {
  var CUSTOM_EMBED_WARNING, CustomEmbedPlayer, DEFAULT_ERROR, DailymotionPlayer, EmbedPlayer, FilePlayer, HITBOX_ERROR, HitboxPlayer, ImgurPlayer, LivestreamPlayer, Player, RTMPPlayer, SoundCloudPlayer, TYPE_MAP, TwitchPlayer, USTREAM_ERROR, UstreamPlayer, VideoJSPlayer, VimeoPlayer, YouTubePlayer, codecToMimeType, genParam, sortSources,
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
          case '240':
            return 'small';
          case '360':
            return 'medium';
          case '480':
            return 'large';
          case '720':
            return 'hd720';
          case '1080':
            return 'hd1080';
          case 'best':
            return 'highres';
          default:
            return 'auto';
        }
      })();
      if (ytQuality !== 'auto') {
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

  window.DailymotionPlayer = DailymotionPlayer = (function(superClass) {
    extend(DailymotionPlayer, superClass);

    function DailymotionPlayer(data) {
      if (!(this instanceof DailymotionPlayer)) {
        return new DailymotionPlayer(data);
      }
      this.setMediaProperties(data);
      this.initialVolumeSet = false;
      waitUntilDefined(window, 'DM', (function(_this) {
        return function() {
          var params, quality;
          removeOld();
          params = {
            autoplay: 1,
            wmode: USEROPTS.wmode_transparent ? 'transparent' : 'opaque',
            logo: 0
          };
          quality = _this.mapQuality(USEROPTS.default_quality);
          if (quality !== 'auto') {
            params.quality = quality;
          }
          _this.dm = DM.player('ytapiplayer', {
            video: data.id,
            width: parseInt(VWIDTH, 10),
            height: parseInt(VHEIGHT, 10),
            params: params
          });
          return _this.dm.addEventListener('apiready', function() {
            _this.dm.ready = true;
            _this.dm.addEventListener('ended', function() {
              if (CLIENT.leader) {
                return socket.emit('playNext');
              }
            });
            _this.dm.addEventListener('pause', function() {
              _this.paused = true;
              if (CLIENT.leader) {
                return sendVideoUpdate();
              }
            });
            return _this.dm.addEventListener('playing', function() {
              _this.paused = false;
              if (CLIENT.leader) {
                sendVideoUpdate();
              }
              if (!_this.initialVolumeSet) {
                _this.setVolume(VOLUME);
                return _this.initialVolumeSet = true;
              }
            });
          });
        };
      })(this));
    }

    DailymotionPlayer.prototype.load = function(data) {
      this.setMediaProperties(data);
      if (this.dm && this.dm.ready) {
        this.dm.load(data.id);
        return this.dm.seek(data.currentTime);
      } else {
        return console.error('WTF?  DailymotionPlayer::load() called but dm is not ready');
      }
    };

    DailymotionPlayer.prototype.pause = function() {
      if (this.dm && this.dm.ready) {
        this.paused = true;
        return this.dm.pause();
      }
    };

    DailymotionPlayer.prototype.play = function() {
      if (this.dm && this.dm.ready) {
        this.paused = false;
        return this.dm.play();
      }
    };

    DailymotionPlayer.prototype.seekTo = function(time) {
      if (this.dm && this.dm.ready) {
        return this.dm.seek(time);
      }
    };

    DailymotionPlayer.prototype.setVolume = function(volume) {
      if (this.dm && this.dm.ready) {
        return this.dm.setVolume(volume);
      }
    };

    DailymotionPlayer.prototype.getTime = function(cb) {
      if (this.dm && this.dm.ready) {
        return cb(this.dm.currentTime);
      } else {
        return cb(0);
      }
    };

    DailymotionPlayer.prototype.getVolume = function(cb) {
      var volume;
      if (this.dm && this.dm.ready) {
        if (this.dm.muted) {
          return cb(0);
        } else {
          volume = this.dm.volume;
          if (volume > 1) {
            volume /= 100;
          }
          return cb(volume);
        }
      } else {
        return cb(VOLUME);
      }
    };

    DailymotionPlayer.prototype.mapQuality = function(quality) {
      switch (String(quality)) {
        case '240':
        case '480':
        case '720':
        case '1080':
          return String(quality);
        case '360':
          return '380';
        case 'best':
          return '1080';
        default:
          return 'auto';
      }
    };

    return DailymotionPlayer;

  })(Player);

  sortSources = function(sources) {
    var flv, flvOrder, idx, j, len, nonflv, pref, qualities, quality, qualityOrder, sourceOrder;
    if (!sources) {
      console.error('sortSources() called with null source list');
      return [];
    }
    qualities = ['1080', '720', '480', '360', '240'];
    pref = String(USEROPTS.default_quality);
    idx = qualities.indexOf(pref);
    if (idx < 0) {
      idx = 2;
    }
    qualityOrder = qualities.slice(idx).concat(qualities.slice(0, idx).reverse());
    sourceOrder = [];
    flvOrder = [];
    for (j = 0, len = qualityOrder.length; j < len; j++) {
      quality = qualityOrder[j];
      if (quality in sources) {
        flv = [];
        nonflv = [];
        sources[quality].forEach(function(source) {
          source.quality = quality;
          if (source.contentType === 'video/flv') {
            return flv.push(source);
          } else {
            return nonflv.push(source);
          }
        });
        sourceOrder = sourceOrder.concat(nonflv);
        flvOrder = flvOrder.concat(flv);
      }
    }
    return sourceOrder.concat(flvOrder).map(function(source) {
      return {
        type: source.contentType,
        src: source.link,
        quality: source.quality
      };
    });
  };

  waitUntilDefined(window, 'videojs', (function(_this) {
    return function() {
      return videojs.options.flash.swf = '/video-js.swf';
    };
  })(this));

  window.VideoJSPlayer = VideoJSPlayer = (function(superClass) {
    extend(VideoJSPlayer, superClass);

    function VideoJSPlayer(data) {
      if (!(this instanceof VideoJSPlayer)) {
        return new VideoJSPlayer(data);
      }
      this.setMediaProperties(data);
      this.loadPlayer(data);
    }

    VideoJSPlayer.prototype.loadPlayer = function(data) {
      return waitUntilDefined(window, 'videojs', (function(_this) {
        return function() {
          var sources, video;
          video = $('<video/>').addClass('video-js vjs-default-skin embed-responsive-item').attr({
            width: '100%',
            height: '100%'
          });
          removeOld(video);
          sources = sortSources(data.meta.direct);
          if (sources.length === 0) {
            console.error('VideoJSPlayer::constructor(): data.meta.direct has no sources!');
            _this.mediaType = null;
            return;
          }
          sources.forEach(function(source) {
            return $('<source/>').attr({
              src: source.src,
              type: source.type,
              'data-quality': source.quality
            }).appendTo(video);
          });
          if (data.meta.gdrive_subtitles) {
            data.meta.gdrive_subtitles.available.forEach(function(subt) {
              var label;
              label = subt.lang_original;
              if (subt.name) {
                label += " (" + subt.name + ")";
              }
              return $('<track/>').attr({
                src: "/gdvtt/" + data.id + "/" + subt.lang + "/" + subt.name + ".vtt?vid=" + data.meta.gdrive_subtitles.vid,
                kind: 'subtitles',
                srclang: subt.lang,
                label: label
              }).appendTo(video);
            });
          }
          _this.player = videojs(video[0], {
            autoplay: true,
            controls: true
          });
          return _this.player.ready(function() {
            _this.setVolume(VOLUME);
            _this.player.on('ended', function() {
              if (CLIENT.leader) {
                return socket.emit('playNext');
              }
            });
            _this.player.on('pause', function() {
              _this.paused = true;
              if (CLIENT.leader) {
                return sendVideoUpdate();
              }
            });
            _this.player.on('play', function() {
              _this.paused = false;
              if (CLIENT.leader) {
                return sendVideoUpdate();
              }
            });
            _this.player.on('seeked', function() {
              return $('.vjs-waiting').removeClass('vjs-waiting');
            });
            return setTimeout(function() {
              return $('#ytapiplayer .vjs-subtitles-button .vjs-menu-item').each(function(i, elem) {
                if (elem.textContent === localStorage.lastSubtitle) {
                  elem.click();
                }
                return elem.onclick = function() {
                  if (elem.attributes['aria-selected'].value === 'true') {
                    return localStorage.lastSubtitle = elem.textContent;
                  }
                };
              });
            }, 1);
          });
        };
      })(this));
    };

    VideoJSPlayer.prototype.load = function(data) {
      this.setMediaProperties(data);
      return this.loadPlayer(data);
    };

    VideoJSPlayer.prototype.play = function() {
      this.paused = false;
      if (this.player && this.player.readyState() > 0) {
        return this.player.play();
      }
    };

    VideoJSPlayer.prototype.pause = function() {
      this.paused = true;
      if (this.player && this.player.readyState() > 0) {
        return this.player.pause();
      }
    };

    VideoJSPlayer.prototype.seekTo = function(time) {
      if (this.player && this.player.readyState() > 0) {
        return this.player.currentTime(time);
      }
    };

    VideoJSPlayer.prototype.setVolume = function(volume) {
      if (this.player) {
        return this.player.volume(volume);
      }
    };

    VideoJSPlayer.prototype.getTime = function(cb) {
      if (this.player && this.player.readyState() > 0) {
        return cb(this.player.currentTime());
      } else {
        return cb(0);
      }
    };

    VideoJSPlayer.prototype.getVolume = function(cb) {
      if (this.player && this.player.readyState() > 0) {
        if (this.player.muted()) {
          return cb(0);
        } else {
          return cb(this.player.volume());
        }
      } else {
        return cb(VOLUME);
      }
    };

    return VideoJSPlayer;

  })(Player);

  codecToMimeType = function(codec) {
    switch (codec) {
      case 'mov/h264':
        return 'video/mp4';
      case 'flv/h264':
        return 'video/flv';
      case 'matroska/vp8':
      case 'matroska/vp9':
        return 'video/webm';
      case 'ogg/theora':
        return 'video/ogg';
      case 'mp3':
        return 'audio/mp3';
      case 'vorbis':
        return 'audio/vorbis';
      default:
        return 'video/flv';
    }
  };

  window.FilePlayer = FilePlayer = (function(superClass) {
    extend(FilePlayer, superClass);

    function FilePlayer(data) {
      if (!(this instanceof FilePlayer)) {
        return new FilePlayer(data);
      }
      data.meta.direct = {
        480: [
          {
            contentType: codecToMimeType(data.meta.codec),
            link: data.id
          }
        ]
      };
      FilePlayer.__super__.constructor.call(this, data);
    }

    FilePlayer.prototype.load = function(data) {
      data.meta.direct = {
        480: [
          {
            contentType: codecToMimeType(data.meta.codec),
            link: data.id
          }
        ]
      };
      return FilePlayer.__super__.load.call(this, data);
    };

    return FilePlayer;

  })(VideoJSPlayer);

  window.SoundCloudPlayer = SoundCloudPlayer = (function(superClass) {
    extend(SoundCloudPlayer, superClass);

    function SoundCloudPlayer(data) {
      if (!(this instanceof SoundCloudPlayer)) {
        return new SoundCloudPlayer(data);
      }
      this.setMediaProperties(data);
      waitUntilDefined(window, 'SC', (function(_this) {
        return function() {
          var soundUrl, volumeSlider, widget;
          removeOld();
          if (data.meta.scuri) {
            soundUrl = data.meta.scuri;
          } else {
            soundUrl = data.id;
          }
          widget = $('<iframe/>').appendTo($('#ytapiplayer'));
          widget.attr({
            id: 'scplayer',
            src: "https://w.soundcloud.com/player/?url=" + soundUrl
          });
          volumeSlider = $('<div/>').attr('id', 'widget-volume').css('top', '170px').insertAfter(widget).slider({
            range: 'min',
            value: VOLUME * 100,
            stop: function(event, ui) {
              return _this.setVolume(ui.value / 100);
            }
          });
          _this.soundcloud = SC.Widget(widget[0]);
          return _this.soundcloud.bind(SC.Widget.Events.READY, function() {
            _this.soundcloud.ready = true;
            _this.setVolume(VOLUME);
            _this.play();
            _this.soundcloud.bind(SC.Widget.Events.PAUSE, function() {
              _this.paused = true;
              if (CLIENT.leader) {
                return sendVideoUpdate();
              }
            });
            _this.soundcloud.bind(SC.Widget.Events.PLAY, function() {
              _this.paused = false;
              if (CLIENT.leader) {
                return sendVideoUpdate();
              }
            });
            return _this.soundcloud.bind(SC.Widget.Events.FINISH, function() {
              if (CLIENT.leader) {
                return socket.emit('playNext');
              }
            });
          });
        };
      })(this));
    }

    SoundCloudPlayer.prototype.load = function(data) {
      var soundUrl;
      this.setMediaProperties(data);
      if (this.soundcloud && this.soundcloud.ready) {
        if (data.meta.scuri) {
          soundUrl = data.meta.scuri;
        } else {
          soundUrl = data.id;
        }
        return this.soundcloud.load(soundUrl, {
          auto_play: true
        });
      } else {
        return console.error('SoundCloudPlayer::load() called but soundcloud is not ready');
      }
    };

    SoundCloudPlayer.prototype.play = function() {
      this.paused = false;
      if (this.soundcloud && this.soundcloud.ready) {
        return this.soundcloud.play();
      }
    };

    SoundCloudPlayer.prototype.pause = function() {
      this.paused = true;
      if (this.soundcloud && this.soundcloud.ready) {
        return this.soundcloud.pause();
      }
    };

    SoundCloudPlayer.prototype.seekTo = function(time) {
      if (this.soundcloud && this.soundcloud.ready) {
        return this.soundcloud.seekTo(time * 1000);
      }
    };

    SoundCloudPlayer.prototype.setVolume = function(volume) {
      if (this.soundcloud && this.soundcloud.ready) {
        return this.soundcloud.setVolume(volume);
      }
    };

    SoundCloudPlayer.prototype.getTime = function(cb) {
      if (this.soundcloud && this.soundcloud.ready) {
        return this.soundcloud.getPosition(function(time) {
          return cb(time / 1000);
        });
      } else {
        return cb(0);
      }
    };

    SoundCloudPlayer.prototype.getVolume = function(cb) {
      if (this.soundcloud && this.soundcloud.ready) {
        return this.soundcloud.getVolume(cb);
      } else {
        return cb(VOLUME);
      }
    };

    return SoundCloudPlayer;

  })(Player);

  DEFAULT_ERROR = 'You are currently connected via HTTPS but the embedded content uses non-secure plain HTTP.  Your browser therefore blocks it from loading due to mixed content policy.  To fix this, embed the video using a secure link if available (https://...), or load this page over plain HTTP by replacing "https://" with "http://" in the address bar (your websocket will still be secured using HTTPS, but this will permit non-secure content to load).';

  genParam = function(name, value) {
    return $('<param/>').attr({
      name: name,
      value: value
    });
  };

  window.EmbedPlayer = EmbedPlayer = (function(superClass) {
    extend(EmbedPlayer, superClass);

    function EmbedPlayer(data) {
      if (!(this instanceof EmbedPlayer)) {
        return new EmbedPlayer(data);
      }
      this.load(data);
    }

    EmbedPlayer.prototype.load = function(data) {
      var embed;
      this.setMediaProperties(data);
      embed = data.meta.embed;
      if (embed == null) {
        console.error('EmbedPlayer::load(): missing meta.embed');
        return;
      }
      if (embed.tag === 'object') {
        this.player = this.loadObject(embed);
      } else {
        this.player = this.loadIframe(embed);
      }
      return removeOld(this.player);
    };

    EmbedPlayer.prototype.loadObject = function(embed) {
      var key, object, ref, value;
      object = $('<object/>').attr({
        type: 'application/x-shockwave-flash',
        data: embed.src
      });
      genParam('allowfullscreen', 'true').appendTo(object);
      genParam('allowscriptaccess', 'always').appendTo(object);
      ref = embed.params;
      for (key in ref) {
        value = ref[key];
        genParam(key, value).appendTo(object);
      }
      return object;
    };

    EmbedPlayer.prototype.loadIframe = function(embed) {
      var alert, error, iframe;
      if (embed.src.indexOf('http:') === 0 && location.protocol === 'https:') {
        if (this.__proto__.mixedContentError != null) {
          error = this.__proto__.mixedContentError;
        } else {
          error = DEFAULT_ERROR;
        }
        alert = makeAlert('Mixed Content Error', error, 'alert-danger').removeClass('col-md-12');
        alert.find('.close').remove();
        return alert;
      } else {
        iframe = $('<iframe/>').attr({
          src: embed.src,
          frameborder: '0'
        });
        return iframe;
      }
    };

    return EmbedPlayer;

  })(Player);

  window.twitchEventCallback = function(events) {
    if (!(PLAYER instanceof TwitchPlayer)) {
      return false;
    }
    return events.forEach(function(event) {
      if (event.event === 'playerInit') {
        PLAYER.twitch.unmute();
        return PLAYER.twitch.ready = true;
      }
    });
  };

  window.TwitchPlayer = TwitchPlayer = (function(superClass) {
    extend(TwitchPlayer, superClass);

    function TwitchPlayer(data) {
      if (!(this instanceof TwitchPlayer)) {
        return new TwitchPlayer(data);
      }
      this.load(data);
    }

    TwitchPlayer.prototype.load = function(data) {
      data.meta.embed = {
        src: '//www-cdn.jtvnw.net/swflibs/TwitchPlayer.swf',
        tag: 'object',
        params: {
          flashvars: "embed=1&hostname=localhost&channel=" + data.id + "& eventsCallback=twitchEventCallback&auto_play=true&start_volume=" + (Math.floor(VOLUME * 100))
        }
      };
      return TwitchPlayer.__super__.load.call(this, data);
    };

    return TwitchPlayer;

  })(EmbedPlayer);

  window.LivestreamPlayer = LivestreamPlayer = (function(superClass) {
    extend(LivestreamPlayer, superClass);

    function LivestreamPlayer(data) {
      if (!(this instanceof LivestreamPlayer)) {
        return new LivestreamPlayer(data);
      }
      this.load(data);
    }

    LivestreamPlayer.prototype.load = function(data) {
      if (LIVESTREAM_CHROMELESS) {
        data.meta.embed = {
          src: 'https://cdn.livestream.com/chromelessPlayer/v20/playerapi.swf',
          tag: 'object',
          params: {
            flashvars: "channel=" + data.id
          }
        };
      } else {
        data.meta.embed = {
          src: "https://cdn.livestream.com/embed/" + data.id + "?layout=4&color=0x000000&iconColorOver=0xe7e7e7&iconColor=0xcccccc",
          tag: 'iframe'
        };
      }
      return LivestreamPlayer.__super__.load.call(this, data);
    };

    return LivestreamPlayer;

  })(EmbedPlayer);

  CUSTOM_EMBED_WARNING = 'This channel is embedding custom content from %link%. Since this content is not trusted, you must click "Embed" below to allow the content to be embedded.<hr>';

  window.CustomEmbedPlayer = CustomEmbedPlayer = (function(superClass) {
    extend(CustomEmbedPlayer, superClass);

    function CustomEmbedPlayer(data) {
      if (!(this instanceof CustomEmbedPlayer)) {
        return new CustomEmbedPlayer(data);
      }
      this.load(data);
    }

    CustomEmbedPlayer.prototype.load = function(data) {
      var alert, embedSrc, link;
      if (data.meta.embed == null) {
        console.error('CustomEmbedPlayer::load(): missing meta.embed');
        return;
      }
      embedSrc = data.meta.embed.src;
      link = "<a href=\"" + embedSrc + "\" target=\"_blank\"><strong>" + embedSrc + "</strong></a>";
      alert = makeAlert('Untrusted Content', CUSTOM_EMBED_WARNING.replace('%link%', link), 'alert-warning').removeClass('col-md-12');
      $('<button/>').addClass('btn btn-default').text('Embed').click((function(_this) {
        return function() {
          return CustomEmbedPlayer.__super__.load.call(_this, data);
        };
      })(this)).appendTo(alert.find('.alert'));
      return removeOld(alert);
    };

    return CustomEmbedPlayer;

  })(EmbedPlayer);

  window.rtmpEventHandler = function(id, event, data) {
    if (event === 'volumechange') {
      return PLAYER.volume = data.muted ? 0 : data.volume;
    }
  };

  window.RTMPPlayer = RTMPPlayer = (function(superClass) {
    extend(RTMPPlayer, superClass);

    function RTMPPlayer(data) {
      if (!(this instanceof RTMPPlayer)) {
        return new RTMPPlayer(data);
      }
      this.volume = VOLUME;
      this.load(data);
    }

    RTMPPlayer.prototype.load = function(data) {
      data.meta.embed = {
        tag: 'object',
        src: 'https://fpdownload.adobe.com/strobe/FlashMediaPlayback_101.swf',
        params: {
          flashvars: "src=" + data.id + "&streamType=live&javascriptCallbackFunction=rtmpEventHandler&autoPlay=true&volume=" + VOLUME
        }
      };
      return RTMPPlayer.__super__.load.call(this, data);
    };

    RTMPPlayer.prototype.getVolume = function(cb) {
      return cb(this.volume);
    };

    return RTMPPlayer;

  })(EmbedPlayer);

  HITBOX_ERROR = 'Hitbox.tv only serves its content over plain HTTP, but you are viewing this page over secure HTTPS.  Your browser therefore blocks the hitbox embed due to mixed content policy.  In order to view hitbox, you must view this page over plain HTTP (change "https://" to "http://" in the address bar)-- your websocket will still be connected using secure HTTPS.  This is something I have asked Hitbox to fix but they have not done so yet.';

  window.HitboxPlayer = HitboxPlayer = (function(superClass) {
    extend(HitboxPlayer, superClass);

    function HitboxPlayer(data) {
      if (!(this instanceof HitboxPlayer)) {
        return new HitboxPlayer(data);
      }
      this.load(data);
    }

    HitboxPlayer.prototype.load = function(data) {
      data.meta.embed = {
        src: "http://hitbox.tv/embed/" + data.id,
        tag: 'iframe'
      };
      return HitboxPlayer.__super__.load.call(this, data);
    };

    HitboxPlayer.prototype.mixedContentError = HITBOX_ERROR;

    return HitboxPlayer;

  })(EmbedPlayer);

  USTREAM_ERROR = 'Ustream.tv\'s embed player only works over plain HTTP, but you are viewing this page over secure HTTPS.  Your browser therefore blocks the ustream embed due to mixed content policy.  In order to view ustream, you must view this page over plain HTTP (change "https://" to "http://" in the address bar)-- your websocket will still be connecting using secure HTTPS.  This is something that ustream needs to fix.';

  window.UstreamPlayer = UstreamPlayer = (function(superClass) {
    extend(UstreamPlayer, superClass);

    function UstreamPlayer(data) {
      if (!(this instanceof UstreamPlayer)) {
        return new UstreamPlayer(data);
      }
      this.load(data);
    }

    UstreamPlayer.prototype.load = function(data) {
      data.meta.embed = {
        tag: 'iframe',
        src: "http://www.ustream.tv/embed/" + data.id + "?v=3&wmode=direct&autoplay=1"
      };
      return UstreamPlayer.__super__.load.call(this, data);
    };

    UstreamPlayer.prototype.mixedContentError = USTREAM_ERROR;

    return UstreamPlayer;

  })(EmbedPlayer);

  window.ImgurPlayer = ImgurPlayer = (function(superClass) {
    extend(ImgurPlayer, superClass);

    function ImgurPlayer(data) {
      if (!(this instanceof ImgurPlayer)) {
        return new ImgurPlayer(data);
      }
      this.load(data);
    }

    ImgurPlayer.prototype.load = function(data) {
      data.meta.embed = {
        tag: 'iframe',
        src: "https://imgur.com/a/" + data.id + "/embed"
      };
      return ImgurPlayer.__super__.load.call(this, data);
    };

    return ImgurPlayer;

  })(EmbedPlayer);

  TYPE_MAP = {
    yt: YouTubePlayer,
    vi: VimeoPlayer,
    dm: DailymotionPlayer,
    gd: VideoJSPlayer,
    gp: VideoJSPlayer,
    fi: FilePlayer,
    jw: FilePlayer,
    sc: SoundCloudPlayer,
    li: LivestreamPlayer,
    tw: TwitchPlayer,
    cu: CustomEmbedPlayer,
    rt: RTMPPlayer,
    hb: HitboxPlayer,
    us: UstreamPlayer,
    im: ImgurPlayer
  };

  window.loadMediaPlayer = function(data) {
    var e;
    if (data.meta.direct) {
      try {
        return window.PLAYER = new VideoJSPlayer(data);
      } catch (_error) {
        e = _error;
        return console.error(e);
      }
    } else if (data.type in TYPE_MAP) {
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
    } else if (PLAYER.paused && !data.paused) {
      PLAYER.play();
    }
    return PLAYER.getTime(function(seconds) {
      var accuracy, diff, time;
      time = data.currentTime;
      diff = (time - seconds) || time;
      accuracy = USEROPTS.sync_accuracy;
      if (PLAYER instanceof DailymotionPlayer) {
        accuracy = Math.max(accuracy, 5);
      }
      if (diff > accuracy) {
        return PLAYER.seekTo(time);
      } else if (diff < -accuracy) {
        if (!(PLAYER instanceof DailymotionPlayer)) {
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
