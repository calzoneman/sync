var Config = require("./config");
var fs = require("fs");
var path = require("path");
var execSync = require("child_process").execSync;

const LOGGER = require('@calzoneman/jsli')('setuid');

var needPermissionsFixed = [
    path.join(__dirname, "..", "chanlogs"),
    path.join(__dirname, "..", "google-drive-subtitles")
];

function fixPermissions(user, group) {
    var uid = resolveUid(user);
    var gid = resolveGid(group);
    needPermissionsFixed.forEach(function (dir) {
        if (fs.existsSync(dir)) {
            fs.chownSync(dir, uid, gid);
        }
    });
}

function resolveUid(user) {
    return parseInt(execSync('id -u ' + user), 10);
}

function resolveGid(group) {
    return parseInt(execSync('id -g ' + group), 10);
}

if (Config.get("setuid.enabled")) {
    setTimeout(function() {
        try {
            fixPermissions(Config.get("setuid.user"), Config.get("setuid.group"));
            LOGGER.info(
                'Old User ID: %s, Old Group ID: %s',
                process.getuid(),
                process.getgid()
            );
            process.setgid(Config.get("setuid.group"));
            process.setuid(Config.get("setuid.user"));
            LOGGER.info(
                'New User ID: %s, New Group ID: %s',
                process.getuid(),
                process.getgid()
            );
        } catch (err) {
            LOGGER.error('Error setting uid: %s', err.stack);
            process.exit(1);
        }
    }, (Config.get("setuid.timeout")));
}
