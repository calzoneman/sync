2015-07-25
==========

  * CyTube now supports subtitles for Google Drive videos.  In order to take
    advantage of this, you must upgrade mediaquery by running `npm install
    cytube/mediaquery`.  Subtitles are cached in the google-drive-subtitles
    folder.

2015-07-07
==========

  * CyTube and CyTube/mediaquery have both been updated to use
    calzoneman/status-message-polyfill to polyfill res.statusMessage on older
    versions of node (e.g., v0.10).  After pulling, run `npm install` to update
    this dependency.  This fixes an issue where HTTP status messages from
    mediaquery were reported as `undefined`, and removes the need for manually
    looking up status messages in `lib/ffmpeg.js`.

2015-07-06
==========

  * As part of the video player rewrite, Google Drive and Google+ metadata
    lookups are now offloaded to CyTube/mediaquery.  After pulling the new
    changes, run `npm install` or `npm update` to update the mediaquery
    dependency.

  * `www/js/player.js` is now built from the CoffeeScript source files in the
    `player/` directory.  Instead of modifying it directly, modify the relevant
    player implementations in `player/` and run `npm run build-player` (or `node
    build-player.js`) to generate `www/js/player.js`.

  * Also as part of the video player rewrite, the schema for custom embeds
    changed so any custom embeds stored in the `channel_libraries` table need to
    be updated.  The automatic upgrade script will convert any custom embeds
    that are parseable (i.e., not truncated by the width of the `id` field using
    the old format) and will delete the rest (you may see a lot of WARNING:
    unable to convert xxx messages-- this is normal).  Custom embeds in channel
    playlists in the chandumps will be converted when the channel is loaded.
