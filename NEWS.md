2016-01-06
==========

This release updates socket.io to version 1.4.0.  The updates to socket.io
include a few security-related fixes, so please be sure to run `npm install`
to ensure the updated version is installed before restarting your CyTube server.

  * https://nodesecurity.io/advisories/67
  * https://github.com/socketio/engine.io/commit/391ce0dc8b88a6609d88db83ea064040a05ab803

2015-10-25
==========

In order to support future clustering support, the legacy `/sioconfig`
endpoint is being deprecated.  Instead, you should make a request to
`/socketconfig/<channel name>.json`.  See [the
documentation](docs/socketconfig.md) for more information.

2015-10-04
==========

  * The channel data storage system has been refactored a bit.  For
    compatibility, the default remains to store JSON objects for each channel in
    the `chandump` folder, however there is now also the option of storing
    channel data in the database.  You can take advantage of this by setting
    `channel-storage: type: 'database'` in your `config.yaml`.
    - In order to migrate existing channel data from the `chandump` files to the
      database, run `node lib/channel-storage/migrate.js`.
  * The database storage method uses foreign keys to associate the channel data
    with the corresponding row in the `channels` table.  This requires that the
    tables be stored using the InnoDB engine rather than MyISAM.  If your CyTube
    tables defaulted to MyISAM, you can fix them by running

    ```sql
    ALTER TABLE `channels` ENGINE = InnoDB;
    ```

2015-09-21
==========

  * CyTube is now transpiled with [babel] to allow the use of ES6/ES2015
    features.  All source files have been moved from `lib` to `src`.
  * Running `npm install` or `npm run postinstall` will prompt you to
    build from `src` to `lib`.
  * Running `npm run build-server` will run the build script without any
    prompts.
  * After updating with `git pull`, you should run `npm install` or `npm run
    build-server` in order to rebuild after the changes.

[babel]: https://babeljs.io/

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
