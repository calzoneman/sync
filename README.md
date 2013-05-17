calzoneman/sync
===============

About
-----

CyTube (formerly Sync) is a server/client combination providing media synchronization, chat,
and administration for an arbitrary number of channels.
I began developing this as a hobby project, and when Synchtube announced their closure, I
began polishing it and readying it for the public.

I am hosting a CyTube server at http://cytu.be

The serverside is written in JavaScript and runs on Node.JS.  It makes use
of a MySQL database to store user registrations, cached media metadata, and
data about each channel.

The clientside is written in JavaScript and makes use of Socket.IO and
jQuery as well as the APIs for various media providers.
The web interface uses Bootstrap for layout and styling.

The following media sources are currently supported:
- YouTube (individual videos)
- YouTube Playlists
- Vimeo
- Dailymotion
- Soundcloud
- Livestream.com
- Twitch.tv
- Justin.tv
- Ustream
- RTMP livestreams

Installing
----------

Installation instructions for specific distributions are available here: https://github.com/calzoneman/sync/wiki/Installing

This assumes you have Node.JS installed.
I'm using v0.10, please feel free to report which versions do/do not work.
I recommend using at least v0.8.20 due to a bug in previous versions of node
that caused sketchy client connections to crash the server.

First install MySQL on the server.  There are many online tutorials for setting up MySQL on
various operating systems.
I recommend installing phpMyAdmin so that you have a nice database administration interface.
Create a new user and database, and make sure the user has full permissions for the database.

Then, follow these instructions to install CyTube:

1. Clone this repository (`git clone https://github.com/calzoneman/sync`)
2. cd to the directory containing the source files
3. Install your distribution's `libmysqlclient` package.
3. Install dependencies: `npm install`
4. Edit `config.js` and input your database details and connection port
5. Edit `www/assets/js/iourl.js` and change the value of `IO_URL` to `yourhostname:port` where `port` is the port defined in `config.js`.  Also change `WEB_URL` to `yourhostname:web_port` where `web_port` is the websocket port you defined in `config.js`

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

Licensed under MIT
See LICENSE for the full license text
