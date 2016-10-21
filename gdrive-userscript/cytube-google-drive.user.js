// ==UserScript==
// @name Google Drive Video Player for {SITENAME}
// @namespace gdcytube
// @description Play Google Drive videos on {SITENAME}
// {INCLUDE_BLOCK}
// @grant unsafeWindow
// @grant GM_xmlhttpRequest
// @connect docs.google.com
// @run-at document-end
// @version 1.3.0
// ==/UserScript==

try {
    function debug(message) {
        if (!unsafeWindow.enableCyTubeGoogleDriveUserscriptDebug) {
            return;
        }

        try {
            unsafeWindow.console.log(message);
        } catch (error) {
            unsafeWindow.console.error(error);
        }
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
        var url = 'https://docs.google.com/get_video_info?authuser='
                + '&docid=' + id
                + '&sle=true'
                + '&hl=en';
        debug('Fetching ' + url);

        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            onload: function (res) {
                try {
                    debug('Got response ' + res.responseText);
                    var data = {};
                    var error;
                    res.responseText.split('&').forEach(function (kv) {
                        var pair = kv.split('=');
                        data[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
                    });

                    if (data.status === 'fail') {
                        var error = 'Google Docs request failed: ' +
                                unescape(data.reason).replace(/\+/g, ' ');
                        return cb(error);
                    }

                    if (!data.fmt_stream_map) {
                        var error = 'Google Docs request failed: ' +
                                'metadata lookup returned no valid links';
                        return cb(error);
                    }

                    data.links = {};
                    data.fmt_stream_map.split(',').forEach(function (item) {
                        var pair = item.split('|');
                        data.links[pair[0]] = pair[1];
                    });
                    data.videoMap = mapLinks(data.links);

                    cb(null, data);
                } catch (error) {
                    unsafeWindow.console.error(error);
                }
            },

            onerror: function () {
                var error = 'Google Docs request failed: ' +
                        'metadata lookup HTTP request failed';
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

    /*
     * Greasemonkey 2.0 has this wonderful sandbox that attempts
     * to prevent script developers from shooting themselves in
     * the foot by removing the trigger from the gun, i.e. it's
     * impossible to cross the boundary between the browser JS VM
     * and the privileged sandbox that can run GM_xmlhttpRequest().
     *
     * So in this case, we have to resort to polling a special
     * variable to see if getGoogleDriveMetadata needs to be called
     * and deliver the result into another special variable that is
     * being polled on the browser side.
     */

    /*
     * Browser side function -- sets gdUserscript.pollID to the
     * ID of the Drive video to be queried and polls
     * gdUserscript.pollResult for the result.
     */
    function getGoogleDriveMetadata_GM(id, callback) {
        debug('Setting GD poll ID to ' + id);
        unsafeWindow.gdUserscript.pollID = id;
        var tries = 0;
        var i = setInterval(function () {
            if (unsafeWindow.gdUserscript.pollResult) {
                debug('Got result');
                clearInterval(i);
                var result = unsafeWindow.gdUserscript.pollResult;
                unsafeWindow.gdUserscript.pollResult = null;
                callback(result.error, result.result);
            } else if (++tries > 100) {
                // Took longer than 10 seconds, give up
                clearInterval(i);
            }
        }, 100);
    }

    /*
     * Sandbox side function -- polls gdUserscript.pollID for
     * the ID of a Drive video to be queried, looks up the
     * metadata, and stores it in gdUserscript.pollResult
     */
    function setupGDPoll() {
        unsafeWindow.gdUserscript = cloneInto({}, unsafeWindow);
        var pollInterval = setInterval(function () {
            if (unsafeWindow.gdUserscript.pollID) {
                var id = unsafeWindow.gdUserscript.pollID;
                unsafeWindow.gdUserscript.pollID = null;
                debug('Polled and got ' + id);
                getVideoInfo(id, function (error, data) {
                    unsafeWindow.gdUserscript.pollResult = cloneInto({
                        error: error,
                        result: data
                    }, unsafeWindow);
                });
            }
        }, 1000);
    }

    function isRunningTampermonkey() {
        try {
            return GM_info.scriptHandler === 'Tampermonkey';
        } catch (error) {
            return false;
        }
    }

    if (isRunningTampermonkey()) {
        unsafeWindow.getGoogleDriveMetadata = getVideoInfo;
    } else {
        debug('Using non-TM polling workaround');
        unsafeWindow.getGoogleDriveMetadata = exportFunction(
                getGoogleDriveMetadata_GM, unsafeWindow);
        setupGDPoll();
    }

    unsafeWindow.console.log('Initialized userscript Google Drive player');
    unsafeWindow.hasDriveUserscript = true;
    unsafeWindow.driveUserscriptVersion = '1.3';
} catch (error) {
    unsafeWindow.console.error(error);
}
