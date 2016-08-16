// ==UserScript==
// @name Google Drive Video Player for {SITENAME}
// @namespace gdcytube
// @description Play Google Drive videos on {SITENAME}
// {INCLUDE_BLOCK}
// @grant unsafeWindow
// @grant GM_xmlhttpRequest
// @connect docs.google.com
// @run-at document-end
// @version 1.0.0
// ==/UserScript==

(function () {
    function debug(message) {
        if (!unsafeWindow.enableCyTubeGoogleDriveUserscriptDebug) {
            return;
        }

        unsafeWindow.console.log.apply(unsafeWindow.console, arguments);
    }

    var ITAG_QMAP = {
        37: 1080,
        46: 1080,
        22: 720,
        45: 720,
        59: 480,
        44: 480,
        35: 480,
        18: 360,
        43: 360,
        34: 360
    };

    var ITAG_CMAP = {
        43: 'video/webm',
        44: 'video/webm',
        45: 'video/webm',
        46: 'video/webm',
        18: 'video/mp4',
        22: 'video/mp4',
        37: 'video/mp4',
        59: 'video/mp4',
        35: 'video/flv',
        34: 'video/flv'
    };

    function getVideoInfo(id, cb) {
        var url = 'https://docs.google.com/file/d/' + id + '/get_video_info';
        debug('Fetching ' + url);

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function (res) {
                var data = {};
                var error;
                res.responseText.split('&').forEach(function (kv) {
                    var pair = kv.split('=');
                    data[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
                });

                if (data.status === 'fail') {
                    error = new Error('Google Docs request failed: ' +
                            'metadata indicated status=fail');
                    error.response = res.responseText;
                    error.reason = 'RESPONSE_STATUS_FAIL';
                    return cb(error);
                }

                if (!data.fmt_stream_map) {
                    error = new Error('Google Docs request failed: ' +
                            'metadata lookup returned no valid links');
                    error.response = res.responseText;
                    error.reason = 'MISSING_LINKS';
                    return cb(error);
                }

                data.links = {};
                data.fmt_stream_map.split(',').forEach(function (item) {
                    var pair = item.split('|');
                    data.links[pair[0]] = pair[1];
                });

                cb(null, data);
            },

            onerror: function () {
                var error = new Error('Google Docs request failed: ' +
                        'metadata lookup HTTP request failed');
                error.reason = 'HTTP_ONERROR';
                return cb(error);
            }
        });
    }

    function mapLinks(links) {
        var videos = {
            1080: [],
            720: [],
            480: [],
            360: []
        };

        Object.keys(links).forEach(function (itag) {
            itag = parseInt(itag, 10);
            if (!ITAG_QMAP.hasOwnProperty(itag)) {
                return;
            }

            videos[ITAG_QMAP[itag]].push({
                itag: itag,
                contentType: ITAG_CMAP[itag],
                link: links[itag]
            });
        });

        return videos;
    }

    function GoogleDrivePlayer(data) {
        if (!(this instanceof GoogleDrivePlayer)) {
            return new GoogleDrivePlayer(data);
        }

        this.setMediaProperties(data);
        this.load(data);
    }

    GoogleDrivePlayer.prototype = Object.create(unsafeWindow.VideoJSPlayer.prototype);

    GoogleDrivePlayer.prototype.load = function (data) {
        var self = this;
        getVideoInfo(data.id, function (err, videoData) {
            if (err) {
                debug(err);
                var alertBox = unsafeWindow.document.createElement('div');
                alertBox.className = 'alert alert-danger';
                alertBox.textContent = err.message;
                document.getElementById('ytapiplayer').appendChild(alertBox);
                return;
            }

            debug('Retrieved links: ' + JSON.stringify(videoData.links));
            data.meta.direct = mapLinks(videoData.links);
            unsafeWindow.VideoJSPlayer.prototype.loadPlayer.call(self, data);
        });
    };

    unsafeWindow.GoogleDrivePlayer = GoogleDrivePlayer;
    unsafeWindow.console.log('Initialized userscript Google Drive player');
    unsafeWindow.hasDriveUserscript = true;
})();
