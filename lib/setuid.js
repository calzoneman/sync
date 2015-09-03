var Config = require("./config");
var fs = require("fs");
var path = require("path");

var needPermissionsFixed = [
    path.join(__dirname, "..", "chanlogs"),
    path.join(__dirname, "..", "chandump"),
    path.join(__dirname, "..", "google-drive-subtitles")
];

function fixPermissions(uid, gid) {
    needPermissionsFixed.forEach(function (dir) {
        if (fs.existsSync(dir)) {
            fs.chownSync(dir, uid, gid);
        }
    });
}

if (Config.get("setuid.enabled")) {
    setTimeout(function() {
        try {
            fixPermissions();
            console.log("Old User ID: " + process.getuid() + ", Old Group ID: " +
                    process.getgid());
            process.setgid(Config.get("setuid.group"));
            process.setuid(Config.get("setuid.user"));
            console.log("New User ID: " + process.getuid() + ", New Group ID: "
                    + process.getgid());
        } catch (err) {
            console.log("Cowardly refusing to keep the process alive as root.");
            process.exit(1);
        }
    }, (Config.get("setuid.timeout")));
};
