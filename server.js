var User = require('./user.js').User;
var Config = require('./config.js');
var connect = require('connect');
var app = connect.createServer(connect.static(__dirname+'/www')).listen(Config.IO_PORT);
var io = require('socket.io').listen(app);

exports.channels = {};

io.sockets.on('connection', function(socket) {
    var user = new User(socket, socket.handshake.address.address);
    console.log('New connection from /' + user.ip);
});
