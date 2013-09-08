var io = require('socket.io-client');

var socket = io.connect('http://localhost:1337');

// connect, join a room, then disconnect as quickly as possible
socket.on('connect', function () {
    socket.emit('joinChannel', { name: 'test' });
    socket.disconnect();
});
