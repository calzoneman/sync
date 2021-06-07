# Raw Videos / Audio #

Want to host your own video/audio files for use on CyTube?  For servers with the
ffprobe module enabled, CyTube supports this!  However, in order to provide a
consistent experience, there are limitations.

## Hosting the File ##

CyTube requires a direct link to the file in order to query it for metadata such
as duration and encoding.  The website where you host the file needs to be able
to serve the video directly (rather than embedding it in a flash
player/iframe/etc.).  It also needs to serve the correct MIME type for the video
in the `Content-Type` HTTP header, e.g. `video/mp4`.

I don't recommend hosting videos on Dropbox-type services, as they aren't built
to distribute video to many users at a time and often have strict bandwidth
limits.  File hosting sites such as Putlocker also cause problems due to being
unable to serve the file directly, or due to binding the link to the IP address
of the user who retrieved it.  For best results when using raw video, host the
video yourself on a VPS or dedicated server with plenty of bandwidth.

Note that CyTube only queries the file for metadata, it does not proxy it for
users!  Every user watching the video will be downloading it individually.

## Encoding the Video ##

Current internet browsers are very limited in what codecs they can play
natively.  Accordingly, CyTube only supports a few codecs:

**Video**

  * MP4 (AV1)
  * MP4 (H.264)
  * WebM (AV1)
  * WebM (VP8)
  * WebM (VP9)
  * Ogg/Theora

**Audio**

  * MP3
  * Ogg/Vorbis

If your video is in some other format (such as MKV or AVI), then it will need to
be re-encoded.  There are plenty of free programs available to re-encode video
files, such as [ffmpeg](http://ffmpeg.org/) and
[handbrake](http://handbrake.fr/).

For best results, encode as an MP4 using H.264.  This is natively supported by
many browsers, and can also be played using a fallback flash player for older
browsers that don't support it natively.  Always encode with the
[faststart](https://trac.ffmpeg.org/wiki/Encode/H.264#faststartforwebvideo)
flag.

### Subtitles ###

Unfortunately, soft-subtitles are not supported right now.  This is something
that may be supported in the future, but currently if you need subtitles, they
will have to be hardsubbed onto the video itself.
