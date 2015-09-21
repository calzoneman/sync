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
var subtitleLock = {};
var ONE_HOUR = 60 * 60 * 1000;
var ONE_DAY = 24 * ONE_HOUR;

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

function fixText(text) {
    return text.replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/-->/g, '--&gt;');
}

exports.convert = function convertSubtitles(subtitles) {
    var $ = cheerio.load(subtitles, { xmlMode: true });
    var lines = slice.call($('transcript text').map(function (index, elem) {
        var start = parseFloat(elem.attribs.start);
        var end = start + parseFloat(elem.attribs.dur);
        var text;
        if (elem.children.length) {
            text = elem.children[0].data;
        } else {
            text = '';
        }

        var line = formatTime(start) + ' --> ' + formatTime(end);
        line += '\n' + fixText(text) + '\n';
        return line;
    }));

    return 'WEBVTT\n\n' + lines.join('\n');
};

exports.attach = function setupRoutes(app) {
    app.get('/gdvtt/:id/:lang/(:name)?.vtt', handleGetSubtitles);
};

function handleGetSubtitles(req, res) {
    var id = req.params.id;
    var lang = req.params.lang;
    var name = req.params.name || '';
    var vid = req.query.vid;
    if (typeof vid !== 'string' || typeof id !== 'string' || typeof lang !== 'string') {
        return res.sendStatus(400);
    }
    var file = [id, lang, md5(name)].join('_') + '.vtt';
    var fileAbsolute = path.join(subtitleDir, file);

    takeSubtitleLock(fileAbsolute, function () {
        fs.exists(fileAbsolute, function (exists) {
            if (exists) {
                res.sendFile(file, { root: subtitleDir });
                delete subtitleLock[fileAbsolute];
            } else {
                fetchSubtitles(id, lang, name, vid, fileAbsolute, function (err) {
                    delete subtitleLock[fileAbsolute];
                    if (err) {
                        Logger.errlog.log(err.stack);
                        return res.sendStatus(500);
                    }

                    res.sendFile(file, { root: subtitleDir });
                });
            }
        });
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
                    Logger.syslog.log('Saved subtitle file ' + file);
                    cb();
                }
            });
        });
    }).on('error', function (err) {
        cb(err);
    });
}

function clearOldSubtitles() {
    fs.readdir(subtitleDir, function (err, files) {
        if (err) {
            Logger.errlog.log(err.stack);
            return;
        }

        files.forEach(function (file) {
            fs.stat(path.join(subtitleDir, file), function (err, stats) {
                if (err) {
                    Logger.errlog.log(err.stack);
                    return;
                }

                if (stats.mtime.getTime() < Date.now() - ONE_DAY) {
                    Logger.syslog.log('Deleting old subtitle file: ' + file);
                    fs.unlink(path.join(subtitleDir, file));
                }
            });
        });
    });
}

function takeSubtitleLock(filename, cb) {
    if (!subtitleLock.hasOwnProperty(filename)) {
        subtitleLock[filename] = true;
        return setImmediate(cb);
    }

    var tries = 1;
    var interval = setInterval(function () {
        tries++;
        if (!subtitleLock.hasOwnProperty(filename) || tries >= 5) {
            subtitleLock[filename] = true;
            clearInterval(interval);
            return setImmediate(cb);
        }
    }, 200);
}

setInterval(clearOldSubtitles, ONE_HOUR);
clearOldSubtitles();
