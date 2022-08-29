#!/usr/bin/env node

var coffee = require('coffeescript');
var fs = require('fs');
var path = require('path');

var order = [
    'base.coffee',

    'dailymotion.coffee',
    'niconico.coffee',
    'peertube.coffee',
    'soundcloud.coffee',
    'twitch.coffee',
    'vimeo.coffee',
    'youtube.coffee',

    // playerjs-based players
    'playerjs.coffee',
    'iframechild.coffee',
    'odysee.coffee',
    'streamable.coffee',

    // iframe embed-based players
    'embed.coffee',
    'custom-embed.coffee',
    'livestream.com.coffee',
    'twitchclip.coffee',

    // video.js-based players
    'videojs.coffee',
    'gdrive-player.coffee',
    'hls.coffee',
    'raw-file.coffee',
    'rtmp.coffee',

    // mediaUpdate handler
    'update.coffee'
];

var buffer = '';
order.forEach(function (file) {
    buffer += fs.readFileSync(
        path.join(__dirname, '..', 'player', file)
    ) + '\n';
});

fs.writeFileSync(
    path.join(__dirname, '..', 'www', 'js', 'player.js'),
    coffee.compile(buffer)
);
