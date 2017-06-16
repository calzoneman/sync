# Google Drive Userscript Setup

In response to increasing difficulty and complexity of maintaining Google Drive
support, the native player is being phased out in favor of requiring a
userscript to allow each client to fetch the video stream links for themselves.
Users will be prompted with a link to `/google_drive_userscript`, which explains
the situation and instructs how to install the userscript.

As a server admin, you must generate the userscript from the template by using
the following command:

```sh
npm run generate-userscript <site name> <url> [<url>...]
```

The first argument is the site name as it will appear in the userscript title.
The remaining arguments are the URL patterns on which the script will run.  For
example, for cytu.be I use:

```sh
npm run generate-userscript CyTube http://cytu.be/r/* https://cytu.be/r/*
```

This will generate `www/js/cytube-google-drive.user.js`. If you've changed the channel path, be sure to take that into account.
