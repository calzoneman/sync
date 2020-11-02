CyTube Custom Content Metadata
==============================

*Last updated: 2019-05-05*

## Purpose ##

CyTube currently supports adding custom audio/video content by allowing the user
to supply a direct URL to an audio/video file.  The server uses `ffprobe` to
probe the file for various metadata, including the codec/container format and
the duration.  This approach has a few disadvantages over the officially
supported media providers, namely:

  * Since it accepts a single file, it is not possible to provide multiple
    source URLs with varying formats or bitrates to allow viewers to select the
    best source for their computer.
    - It also means it is not possible to provide text tracks for subtitles or
      closed captioning, or to provide image URLs for thumbnails/previews.
  * Probing the file with `ffprobe` is slow, especially if the content is hosted
    in a far away network location, which at best is inconvenient and at worst
    results in timeouts and inability to add the content.
  * Parsing the `ffprobe` output is inexact, and may sometimes result in
    detecting the wrong format, or failing to detect the title.

This document specifies a new supported media provider which allows users to
provide a JSON manifest specifying the metadata for custom content in a way that
avoids the above issues and is more flexible for extension.

## Custom Manifest URLs ##

Custom media manifests are added to CyTube by adding a link to a public URL
hosting the JSON metadata manifest.  Pasting the JSON directly into CyTube is
not supported.  Valid JSON manifests must:

  * Have a URL path ending with the file extension `.json` (not counting
    querystring parameters)
  * Be served with the `Content-Type` header set to `application/json`
  * Be retrievable at any time while the item is on the playlist (CyTube may
    re-request the metadata for an item already on the playlist to revalidate)
  * Respond to valid requests with a 200 OK HTTP response code (redirects are
    not supported)
  * Respond within 10 seconds
  * Not exceed 100 KiB in size

## Manifest Format ##

To add custom content, the user provides a JSON object with the following keys:

  * `title`: A nonempty string specifying the title of the content.  For legacy
    reasons, CyTube currently truncates this to 100 UTF-8 characters.
  * `duration`: A non-negative, finite number specifying the duration, in
    seconds, of the content.  This is what the server will use for timing
    purposes.  Decimals are allowed, but CyTube's timer truncates the value as
    an integer number of seconds, so including fractional seconds lends no
    advantage.
  * `live`: An optional boolean (default: `false`) indicating whether the
    content is live or pre-recorded.  For live content, the `duration` is
    ignored, and the server won't advance the playlist automatically.
  * `thumbnail`: An optional string specifying a URL for a thumbnail image of
    the content.  CyTube currently does not support displaying thumbnails in the
    playlist, but this functionality may be offered in the future.
  * `sources`: A nonempty list of playable sources for the content.  The format
    is described below.
  * `textTracks`: An optional list of text tracks for subtitles or closed
    captioning.  The format is described below.

### Source Format ###

Each source entry is a JSON object with the following keys:

  * `url`: A valid URL that browsers can use to retrieve the content.  The URL
    must resolve to a publicly-routed IP address, and must the `https:` scheme.
  * `contentType`: A string representing the MIME type of the content at `url`.
    A list of acceptable MIME types is provided below.
  * `quality`: A number representing the quality level of the source.  The
    supported quality levels are `240`, `360`, `480`, `540`, `720`, `1080`,
    `1440`, and `2160`.  This may be extended in the future.
  * `bitrate`: An optional number indicating the bitrate (in Kbps) of the
    content.  It must be a positive, finite number if provided.  The bitrate is
    not currently used by CyTube, but may be used by extensions or custom
    scripts to determine whether this source is feasible to play on the viewer's
    internet connection.

#### Acceptable MIME Types ####

The following MIME types are accepted for the `contentType` field:

  * `video/mp4`
  * `video/webm`
  * `video/ogg`
  * `application/x-mpegURL` (HLS streams)
    - HLS is only tested with livestreams.  VODs are accepted, but I do not test
      this functionality.
  * `application/dash+xml` (DASH streams)
    - Support for DASH is experimental
  * ~~`rtmp/flv`~~
    - In light of Adobe phasing out support for Flash, and many browsers
      already dropping support, RTMP is not supported by this feature.
      RTMP streams are only supported through the existing `rt:` media
      type.
  * `audio/aac`
  * `audio/ogg`
  * `audio/mpeg`

Other audio or video formats, such as AVI, MKV, and FLAC, are not supported due
to lack of common support across browsers for playing these formats.  For more
information, refer to
[MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Supported_media_formats#Browser_compatibility).

### Text Track Format ###

Each text track entry is a JSON object with the following keys:


  * `url`: A valid URL that browsers can use to retrieve the track.  The URL
    must resolve to a publicly-routed IP address, and must the `https:` scheme.
  * `contentType`: A string representing the MIME type of the track at `url`.
    The only currently supported MIME type is
    [`text/vtt`](https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API).
  * `name`: A name for the text track.  This is displayed in the menu for the
    viewer to select a text track.
  * `default`: Enable track by default.  Optional boolean attribute to enable
    a subtitle track to the user by default.

**Important note regarding text tracks and CORS:**

By default, browsers block requests for WebVTT tracks hosted on different
domains than the current page.  In order for text tracks to work cross-origin,
the `Access-Control-Allow-Origin` header needs to be set by the remote server
when serving the VTT file.  See
[MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin)
for more information about setting this header.

## Example ##

    {
      "title": "Test Video",
      "duration": 10,
      "live": false,
      "thumbnail": "https://example.com/thumb.jpg",
      "sources": [
        {
          "url": "https://example.com/video.mp4",
          "contentType": "video/mp4",
          "quality": 1080,
          "bitrate": 5000
        }
      ],
      "textTracks": [
        {
          "url": "https://example.com/subtitles.vtt",
          "contentType": "text/vtt",
          "name": "English Subtitles",
          "default": true
        }
      ]
    }

## Permissions ##

The permission node to allow users to add custom content is the same as the
permission node for the existing raw file support.  Custom content is considered
as an extension of the existing feature.

## Unsupported/Undefined Behavior ##

The behavior under any the following circumstances is not defined by this
specification, and any technical support in these cases is voided.  This list is
non-exhaustive.

  * Source URLs or text track URLs are hosted on a third-party website that does
    not have knowledge of its content being played on CyTube.
  * The webserver hosting the source or text track URLs serves a different MIME
    type than the one specified in the manifest.
  * The webserver hosting the source or text track URLs serves a file that does
    not match the MIME type specified in the `Content-Type` HTTP header returned
    to the browser.
  * The manifest includes source URLs or text track URLs with expiration times,
    session IDs, etc. in the URL querystring.
