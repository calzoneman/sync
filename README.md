Read before submitting an issue: https://github.com/calzoneman/sync/wiki/Reporting-an-Issue
===========================================================================================

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
- Ustream.tv
- RTMP livestreams
- Custom `<iframe>` and `<object>` tags

Installing
----------

Installation instructions are available here: https://github.com/calzoneman/sync/wiki/Installing

Running
-------

Start the server: `node index.js`
You should now be able to connect via `yourhostname:port` where `port` is
the port you defined in config.js

Feedback
--------

Please open a GitHub Issue.

License
-------

Licensed under MIT
See LICENSE for the full license text
