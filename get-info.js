/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery
 
Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 
The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

var http = require('http');
var https = require('https');

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
                console.log("JSON fail: ", options);
                return;
            }
            callback(res.statusCode, data);
        });
    });

    req.end();
};

// Dailymotion uses HTTPS for anonymous requests... [](/picard)
function getJSONHTTPS(options, callback) {
    var req = https.request(options, function(res){
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
                console.log("JSON fail: ", options);
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

// Look up Dailymotion info
exports.getDMInfo = function(id, callback) {
    var fields = "duration,title"
    getJSONHTTPS({
        host: "api.dailymotion.com",
        port: 443,
        path: "/video/" + id + "?fields=" + fields,
        method: "GET",
        dataType: "jsonp",
        timeout: 1000}, callback);
}
