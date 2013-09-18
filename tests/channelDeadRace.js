var io = require('socket.io-client');

function testLogin() {
    var socket = io.connect('http://localhost:1337');
    socket.on('connect', function () {
        socket.emit('login', { name: 'test', pw: 'test' });
        socket.emit('joinChannel', { name: 'test' });
        socket.disconnect();
    });
}

function testBan() {
    var socket = io.connect('http://localhost:1337');
    socket.on('connect', function () {
        socket.emit('login', { name: 'test', pw: 'test' });
        socket.emit('joinChannel', { name: 'test' });
        socket.emit('chatMsg', { msg: '/ban asdf' });
        socket.disconnect();
    });
}

function testRankChange() {
    var socket = io.connect('http://localhost:1337');
    socket.on('connect', function () {
        socket.emit('login', { name: 'test', pw: 'test' });
        socket.emit('joinChannel', { name: 'test' });
        socket.emit('setChannelRank', { user: 'test2', rank: 2 });
        socket.disconnect();
    });
}

testLogin();
testBan();
testRankChange();
