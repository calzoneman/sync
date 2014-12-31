Read before submitting an issue: https://github.com/calzoneman/sync/wiki/Reporting-an-Issue
===========================================================================================

calzoneman/sync
===============

About
-----

CyTube is a web application providing media synchronization, chat, and more for an arbitrary number of channels.
I began developing this as a hobby project, and when synchtube.com announced their closure, I
began polishing it and readying it for the public.

I am hosting a CyTube server at http://cytu.be

The serverside is written in JavaScript and runs on Node.JS.  It makes use
of a MySQL database to store user registrations, cached media metadata, and
data about each channel.

The clientside is written in JavaScript and makes use of Socket.IO and
jQuery as well as the APIs for various media providers.
The web interface uses Bootstrap for layout and styling.

Features
--------
- Standalone web/socket.io server
- Optional SSL support for socket.io and the account API
- Synchronized playback from the following sources:
  - YouTube (individual videos + playlists)
  - Google Docs videos
  - Vimeo
  - Dailymotion
  - Soundcloud
  - Raw video/audio files (via JWPlayer)
- Embedding of the following sources:
  - livestream.com
  - twitch.tv
  - justin.tv
  - ustream.tv
  - RTMP streams
  - Icecast (via JWPlayer)
  - Custom `<iframe>` and `<object>` embeds
- Channel customization
  - HTML Message of the Day
  - CSS
  - JavaScript
  - Permissions
    - Tiered ranks (Site admin > Channel admin > Moderator > Leader > Member > Guest > Anonymous)
  - Chat filters (based on regular expressions)
  - Lock/unlock playlist to allow additions by non-moderators (configurable with permissions)
  - Searchable library of videos
- Integrated YouTube search
- Save/load playlists per user account
- Polls
- Voteskip (can be disabled by a channel moderator)
- Auto-AFK status (can be configured per-channel)
- Leader
  - Grants control of playback to a user (can pause/seek)
  - Can also be used to grant temporary mod-like powers to a user
  - Not necessary for synchronization as the server has an internal timer
- Channel state saves/loads on restart
- Account management
  - Password change
  - Password reset (via email)
  - Profile avatar and text
- Moderation
  - Mute users
  - Kick users
  - Ban users by name
  - Ban users by IP address (and by /24 range)
- Administration
  - Log viewer
  - Global bans
  - Search registered channels and users
  - Currently loaded channels
  - Stats (usercount, channelcount, RAM usage)

Installing
----------

Installation instructions are available here: https://github.com/calzoneman/sync/wiki/CyTube-3.0-Installation-Guide


Feedback
--------

Please open a GitHub Issue.

License
-------

Licensed under MIT.  See LICENSE for the full license text.
