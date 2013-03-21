/**
 * Copyright 2013 Calvin 'calzoneman' Montgomery
 *
 * Licensed under Creative Commons Attribution-NonCommercial 3.0
 * See http://creativecommons.org/licenses/by-nc/3.0/
 *
 */

var http = require('http');

// Helper function for making an HTTP request and getting the result
// as JSON
function getJSON(options, callback) {
    var req = http.request(options, function(res){
        var buffer = '';
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            buffer += chunk;
        });
        res.on('end', function() {
            try {
                var data = JSON.parse(buffer);
            }
            catch(e) {
                console.log("JSON fail: " + options);
                return;
            }
            callback(res.statusCode, data);
        });
    });

    req.end();
};

// Look up YouTube metadata
// Fairly straightforward
exports.getYTInfo = function(id, callback) {
    getJSON({
        host: "gdata.youtube.com",
        port: 80,
        path: "/feeds/api/videos/" + id + "?v=2&alt=json",
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}

// Look up Soundcloud metadata
// Whoever designed this should rethink it.  I'll submit a feedback
// form on their website.
exports.getSCInfo = function(url, callback) {
    const SC_CLIENT = '2e0c82ab5a020f3a7509318146128abd';
    // SoundCloud is dumb
    // I have to request the API URL for the given input URL
    // Because the sound ID isn't in the URL
    getJSON({
        host: "api.soundcloud.com",
        port: 80,
        path: "/resolve.json?url="+url+"&client_id=" + SC_CLIENT,
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, function(status, data) {
            // This time we can ACTUALLY get the data we want
            getJSON({
            host: "api.soundcloud.com",
            port: 80,
            path: data.location,
            method: "GET",
            dataType: "jsonp",
            timeout: 1000}, callback);
        });
}

// Look up Vimeo metadata.  Fairly straightforward
exports.getVIInfo = function(id, callback) {
    getJSON({
        host: "vimeo.com",
        port: 80,
        path: "/api/v2/video/" + id + ".json",
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}

