Adding subtitles to Google Drive
================================

  1. Upload your video to Google Drive
  2. Right click the video in Google Drive and click Manage caption tracks
  3. Click Add new captions or transcripts
  4. Upload a supported subtitle file
    * I have verified that Google Drive will accept .srt and .vtt subtitles.  It
      might accept others as well, but I have not tested them.

Once you have uploaded your subtitles, they should be available the next time
the video is refreshed by CyTube (either restart it or delete the playlist item
and add it again).  On the video you should see a speech bubble icon in the
controls, which will pop up a menu of available subtitle tracks.

## Limitations ##

  * Google Drive converts the subtitles you upload into a custom format which
    loses some information from the original captions.  For example, annotations
    for who is speaking are not preserved.
  * As far as I know, Google Drive is not able to automatically detect when
    subtitle tracks are embedded within the video file.  You must upload the
    subtitles separately (there are plenty of tools to extract
    captions/subtitles from MKV and MP4 files).
