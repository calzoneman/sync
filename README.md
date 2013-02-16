calzoneman/sync
===============

About
-----

Sync is a server/client combination I wrote to synchronize media playback
among clients.  It's inspired by Synchtube, but I wanted to make the
interface simpler, add a searchable library for each channel, and it's just
a fun challenge.

The serverside is written in JavaScript and runs on Node.JS.  It makes use
of a MySQL database to store user registrations, cached media metadata, and
data about each channel.

The clientside is written in JavaScript and makes use of Socket.IO and
jQuery.  The web interface uses Bootstrap for layout and styling.

Sync currently supports YouTube, Soundcloud, Vimeo, and TwitchTV.

Installing
----------

This assumes you have Node.JS installed.
I'm using v0.8.20, please feel free to report which versions do/do not work

    1. Clone this repository
    2. `cd` to the directory containing the source files
    3. Install socket.io: `npm install socket.io`
    4. Install connect: `npm install connect`
    5. Install your distribution's `libmysqlclient` package
    6. Install the libmysql node module: `npm install mysql-libmysqlclient`
    7. Edit `config.js` and input your database details and connection port
    8. Edit `www/assets/js/client.js` and change the value of `IO_URL` to `yourhostname:port` where `port` is the port defined in `config.js`

Running
-------

Start the server: `node server.js`
You should now be able to connect via `yourhostname:port` where `port` is
the port you defined in config.js

Feedback
--------

Please open a GitHub Issue.

License
-------

[Licensed under Creative Commons Attribution-NonCommercial 3.0](http://creativecommons.org/licenses/by-nc/3.0/)
See LICENSE for the full license text
