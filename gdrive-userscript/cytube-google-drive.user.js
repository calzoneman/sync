// ==UserScript==
// @name Google Drive Video Player for {SITENAME}
// @namespace gdcytube
// @description Play Google Drive videos on {SITENAME}
// {INCLUDE_BLOCK}
// @grant unsafeWindow
// @grant GM_xmlhttpRequest
// @grant GM.xmlHttpRequest
// @connect docs.google.com
// @connect drive.google.com
// @connect content-workspacevideo-pa.googleapis.com
// @run-at document-end
// @version 1.8.0
// ==/UserScript==

try {
    function debug(message) {
        try {
            unsafeWindow.console.log('[Drive]', message);
        } catch (error) {
            unsafeWindow.console.error(error);
        }
    }

    function httpRequest(opts) {
        if (typeof GM_xmlhttpRequest === 'undefined') {
            // Assume GM4.0
            debug('Using GM4.0 GM.xmlHttpRequest');
            GM.xmlHttpRequest(opts);
        } else {
            debug('Using old-style GM_xmlhttpRequest');
            GM_xmlhttpRequest(opts);
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

    // Public web-client key used by Google Drive's own video player / yt-dlp.
    var PLAYBACK_API_KEY = 'AIzaSyDVQw45DwoYh632gvsP5vPDqEKvb-Ywnb8';
    var PLAYBACK_API =
        'https://content-workspacevideo-pa.googleapis.com/v1/drive/media';

    function getVideoInfo(id, cb) {
        var url = PLAYBACK_API + '/' + encodeURIComponent(id)
                + '/playback?key=' + PLAYBACK_API_KEY;
        debug('Fetching ' + url);

        httpRequest({
            method: 'GET',
            url: url,
            headers: {
                Referer: 'https://drive.google.com/'
            },
            onload: function (res) {
                try {
                    debug('Got response status ' + res.status);

                    if (res.status !== 200) {
                        debug('Response status not 200: ' + res.status);
                        var failMsg = 'Google Drive request failed: HTTP ' + res.status;
                        try {
                            var failDoc = JSON.parse(res.responseText);
                            if (failDoc && failDoc.error && failDoc.error.message) {
                                failMsg = 'Google Drive request failed: ' +
                                          failDoc.error.message;
                            }
                        } catch (_e) {}
                        if (res.status === 401 || res.status === 403 || res.status === 404) {
                            failMsg = 'Google Drive video not found, or it is not shared publicly';
                        }
                        return cb(failMsg);
                    }

                    var doc = JSON.parse(res.responseText);
                    var error;

                    if (doc.error) {
                        error = 'Google Drive request failed: ' +
                                (doc.error.message || 'unplayable');
                        return cb(error);
                    }

                    var formatData = doc.mediaStreamingData
                        && doc.mediaStreamingData.formatStreamingData;
                    var progressive = (formatData && formatData.progressiveTranscodes) || [];
                    if (!progressive.length) {
                        error = (
                            'Google has removed the video streams associated' +
                            ' with this item.  It can no longer be played.'
                        );
                        return cb(error);
                    }

                    var data = {
                        title: (doc.mediaMetadata && doc.mediaMetadata.title) || id,
                        links: {}
                    };
                    progressive.forEach(function (fmt) {
                        if (fmt && fmt.itag && fmt.url) {
                            data.links[String(fmt.itag)] = fmt.url;
                        }
                    });
                    data.videoMap = mapLinks(data.links);

                    cb(null, data);
                } catch (error) {
                    unsafeWindow.console.error(error);
                    cb('Google Drive request failed: ' + (error.message || error));
                }
            },

            onerror: function () {
                var error = 'Google Drive request failed: ' +
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

    var TM_COMPATIBLES = [
        'Tampermonkey',
        'Violentmonkey' // https://github.com/calzoneman/sync/issues/713
    ];

    function isTampermonkeyCompatible() {
        try {
            return TM_COMPATIBLES.indexOf(GM_info.scriptHandler) >= 0;
        } catch (error) {
            return false;
        }
    }

    if (isTampermonkeyCompatible()) {
        unsafeWindow.getGoogleDriveMetadata = getVideoInfo;
    } else {
        debug('Using non-TM polling workaround');
        unsafeWindow.getGoogleDriveMetadata = exportFunction(
                getGoogleDriveMetadata_GM, unsafeWindow);
        setupGDPoll();
    }

    unsafeWindow.console.log('Initialized userscript Google Drive player');
    unsafeWindow.hasDriveUserscript = true;
    // Checked against GS_VERSION from data.js
    unsafeWindow.driveUserscriptVersion = '1.8';
} catch (error) {
    unsafeWindow.console.error(error);
}
