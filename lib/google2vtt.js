var cheerio = require('cheerio');
var https = require('https');
var fs = require('fs');
var path = require('path');
var querystring = require('querystring');
var crypto = require('crypto');

var Logger = require('./logger');

function md5(input) {
    var hash = crypto.createHash('md5');
    hash.update(input);
    return hash.digest('base64').replace(/\//g, ' ')
        .replace(/\+/g, '#')
        .replace(/=/g, '-');
}

var slice = Array.prototype.slice;
var subtitleDir = path.resolve(__dirname, '..', 'google-drive-subtitles');

function padZeros(n) {
    n = n.toString();
    if (n.length < 2) n = '0' + n;
    return n;
}

function formatTime(time) {
    var hours = Math.floor(time / 3600);
    time = time % 3600;
    var minutes = Math.floor(time / 60);
    time = time % 60;
    var seconds = Math.floor(time);
    var ms = time - seconds;

    var list = [minutes, seconds];
    if (hours) {
        list.unshift(hours);
    }

    return list.map(padZeros).join(':') + ms.toFixed(3).substring(1);
}

function unescapeHtmlEntities(text) {
    return text.replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

exports.convert = function convertSubtitles(subtitles) {
    var $ = cheerio.load(subtitles, { xmlMode: true });
    var lines = slice.call($('transcript text').map(function (index, elem) {
        var start = parseFloat(elem.attribs.start);
        var end = start + parseFloat(elem.attribs.dur);
        var text = elem.children[0].data;

        var line = formatTime(start) + ' --> ' + formatTime(end);
        line += '\n' + unescapeHtmlEntities(text) + '\n';
        return line;
    }));

    return 'WEBVTT\n\n' + lines.join('\n');
};

exports.attach = function setupRoutes(app) {
    app.get('/gdvtt/:id/:lang/:name.vtt', handleGetSubtitles);
};

function handleGetSubtitles(req, res) {
    var id = req.params.id;
    var lang = req.params.lang;
    var name = req.params.name;
    var vid = req.query.vid;
    if (typeof vid !== 'string' || typeof id !== 'string' || typeof lang !== 'string' ||
            typeof name !== 'string') {
        return res.sendStatus(400);
    }
    var file = [id, lang, md5(name)].join('_') + '.vtt';
    var fileAbsolute = path.join(subtitleDir, file);

    fs.exists(fileAbsolute, function (exists) {
        if (exists) {
            res.sendFile(file, { root: subtitleDir });
        } else {
            fetchSubtitles(id, lang, name, vid, fileAbsolute, function (err) {
                if (err) {
                    Logger.errlog.log(err.stack);
                    return res.sendStatus(500);
                }

                res.sendFile(file, { root: subtitleDir });
            });
        }
    });
}

function fetchSubtitles(id, lang, name, vid, file, cb) {
    var query = {
        id: id,
        v: id,
        vid: vid,
        lang: lang,
        name: name,
        type: 'track',
        kind: undefined
    };

    var url = 'https://drive.google.com/timedtext?' + querystring.stringify(query);
    https.get(url, function (res) {
        if (res.statusCode !== 200) {
            return cb(new Error(res.statusMessage));
        }

        var buf = '';
        res.setEncoding('utf-8');
        res.on('data', function (data) {
            buf += data;
        });

        res.on('end', function () {
            try {
                buf = exports.convert(buf);
            } catch (e) {
                return cb(e);
            }

            fs.writeFile(file, buf, function (err) {
                if (err) {
                    cb(err);
                } else {
                    cb();
                }
            });
        });
    }).on('error', function (err) {
        cb(err);
    });
}
