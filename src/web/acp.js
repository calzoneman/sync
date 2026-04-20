var path = require("path");
var fs = require("fs");
var webserver = require("./webserver");
var sendPug = require("./pug").sendPug;
var Logger = require("../logger");

let ioConfig;

function checkAdmin(cb) {
    return async function (req, res) {
        const user = await webserver.authorize(req);
        if (!user) {
            return res.send(403);
        }

        if (user.global_rank < 255) {
            res.send(403);
            Logger.eventlog.log("[acp] Attempted GET "+req.path+" from non-admin " +
                                user.name + "@" + req.realIP);
            return;
        }

        cb(req, res, user);
    };
}

/**
 * Handles a request for the ACP
 */
function handleAcp(req, res, _user) {
    const ioServers = ioConfig.getSocketEndpoints();
    const chosenServer = ioServers[0];

    if (!chosenServer) {
        res.status(500).text("No suitable socket.io address for ACP");
        return;
    }

    sendPug(res, "acp", {
        ioServers: JSON.stringify(ioServers),
        sioSource: `${chosenServer.url}/socket.io/socket.io.js`
    });
}

/**
 * Streams the last length bytes of file to the given HTTP response
 */
function readLog(res, file, length) {
    fs.stat(file, function (err, data) {
        if (err) {
            res.send(500);
            return;
        }

        var start = Math.max(0, data.size - length);
        if (isNaN(start)) {
            res.send(500);
        }
        var end = Math.max(0, data.size - 1);
        if (isNaN(end)) {
            res.send(500);
        }
        fs.createReadStream(file, { start: start, end: end })
            .pipe(res);
    });
}

/**
 * Handles a request to read the syslog
 */
function handleReadSyslog(req, res) {
    readLog(res, path.join(__dirname, "..", "..", "sys.log"), 1048576);
}

/**
 * Handles a request to read the error log
 */
function handleReadErrlog(req, res) {
    readLog(res, path.join(__dirname, "..", "..", "error.log"), 1048576);
}

/**
 * Handles a request to read the http log
 */
function handleReadHttplog(req, res) {
    readLog(res, path.join(__dirname, "..", "..", "http.log"), 1048576);
}

/**
 * Handles a request to read the event log
 */
function handleReadEventlog(req, res) {
    readLog(res, path.join(__dirname, "..", "..", "events.log"), 1048576);
}

/**
 * Handles a request to read a channel log
 */
function handleReadChanlog(req, res) {
    if (!req.params.name.match(/^[\w-]{1,30}$/)) {
        res.send(400);
        return;
    }
    readLog(res, path.join(__dirname, "..", "..", "chanlogs", req.params.name + ".log"), 1048576);
}

module.exports = {
    init: function (app, _ioConfig) {
        ioConfig = _ioConfig;

        app.get("/acp", checkAdmin(handleAcp));
        app.get("/acp/syslog", checkAdmin(handleReadSyslog));
        app.get("/acp/errlog", checkAdmin(handleReadErrlog));
        app.get("/acp/httplog", checkAdmin(handleReadHttplog));
        app.get("/acp/eventlog", checkAdmin(handleReadEventlog));
        app.get("/acp/chanlog/:name", checkAdmin(handleReadChanlog));
    }
};
