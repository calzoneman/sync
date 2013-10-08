var fs = require('fs');
var io = require('socket.io-client');
var socket = io.connect('http://localhost:1337');
socket.on('connect', function () {
    socket.emit('login', { name: 'test', pw: 'test' });
    socket.emit('joinChannel', { name: 'test' });
});

socket.on('login', testAddVideos);

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

    // burst the first 10
    for (var i = 0; i < 10; i++) {
        console.log('queue', ids[i]);
        socket.emit('queue', {
            id: ids[i],
            type: 'yt',
            pos: 'end'
        });
    }

    for (var i = 10; i < ids.length; i++) {
        (function (i) {
            setTimeout(function () {
                console.log('queue', ids[i]);
                socket.emit('queue', {
                    id: ids[i],
                    type: 'yt',
                    pos: 'end'
                });
            }, 1050 * (i - 9));
        })(i);
    }
}
