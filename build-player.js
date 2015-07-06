var coffee = require('coffee-script');
var fs = require('fs');
var path = require('path');

var order = [
    'base.coffee',
    'vimeo.coffee',
    'youtube.coffee',
    'dailymotion.coffee',
    'videojs.coffee',
    'raw-file.coffee',
    'soundcloud.coffee',
    'embed.coffee',
    'twitch.coffee',
    'livestream.com.coffee',
    'custom-embed.coffee',
    'rtmp.coffee',
    'hitbox.coffee',
    'ustream.coffee',
    'imgur.coffee',
    'update.coffee'
];

var buffer = '';
order.forEach(function (file) {
    buffer += fs.readFileSync(path.join('player', file)) + '\n';
});

fs.writeFileSync(path.join('www', 'js', 'player.js'), coffee.compile(buffer));
