var Callbacks = {
    /* Connection failed */
    error: function (reason) {
        if (reason && reason.returnValue === true) {
            return;
        }

        var fail = $('<div/>').addClass('alert alert-error')
            .appendTo($('#announcements'));

        $('<h3/>').text('Uh-oh!').appendTo(fail);
        $('<p/>').html('The socket.io connection failed.  Please check that '+
                       'the connection was not blocked by a firewall or '+
                       'antivirus software.');
    },

    /* Connection succeeded */
    connect: function () {
        socket.emit('join', {
            channel: CHANNEL
        });

        /* if rejoining after the connection failed, resend password */
        if (CHANNEL.opts.password) {
            socket.once('needPassword', function () {
                socket.emit('channelPassword', {
                    password: CHANNEL.opts.password
                });
            });
        }

        /* guest login */
        if (NAME && !LOGGEDIN) {
            socket.emit('login', {
                name: NAME
            });
        }
    },
};
