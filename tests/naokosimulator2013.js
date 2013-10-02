var fs = require('fs');
var io = require('socket.io-client');
var socket = io.connect('http://localhost:1337');
socket.on('connect', function () {
    socket.emit('login', { name: 'test', pw: 'test' });
    socket.emit('joinChannel', { name: 'test' });
});

socket.on('queueFail', function (msg) {
    console.log(msg);
});

/* Stress test adding a lot of videos in a very short timespan */

function testAddVideos() {
    var pl = fs.readFileSync('largepl.json') + '';
    pl = JSON.parse(pl);
    var ids = [];
    for (var i = 0; i < pl.length; i++) {
        if (pl[i].type === 'yt')
            ids.push(pl[i].id);
    }

    for (var i = 0; i < ids.length; i++) {
        (function (i) {
            setTimeout(function () {
                console.log('queue', ids[i]);
                socket.emit('queue', {
                    id: ids[i],
                    type: 'yt',
                    pos: 'end'
                });
            }, 1050 * i);
        })(i);
    }
}

testAddVideos();
