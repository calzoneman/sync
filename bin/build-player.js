#!/usr/bin/env node

var coffee = require('coffeescript');
var fs = require('fs');
var path = require('path');

var order = [
    'base.coffee',

    'dailymotion.coffee',
    'peertube.coffee',
    'soundcloud.coffee',
    'twitch.coffee',
    'vimeo.coffee',
    'youtube.coffee',

    'playerjs.coffee',
        'iframechild.coffee',
        'odysee.coffee',
        'streamable.coffee',
    'embed.coffee',
        'custom-embed.coffee',
        'livestream.com.coffee',
        'twitchclip.coffee',
    'videojs.coffee',
        'gdrive-player.coffee',
        'hls.coffee',
        'raw-file.coffee',
        'rtmp.coffee',

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
