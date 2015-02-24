var Config = require("./config");

if (Config.get("setuid.enabled")) {
    setTimeout(function() {
        try {
            console.log('Old User ID: ' + process.getuid() + ', Old Group ID: ' + process.getgid());
            process.setgid(Config.get("setuid.group"));
            process.setuid(Config.get("setuid.user"));
            console.log('New User ID: ' + process.getuid() + ', New Group ID: ' + process.getgid());
        } catch (err) {
            console.log('Cowardly refusing to keep the process alive as root.');
            process.exit(1);
        }
    }, (Config.get("setuid.timeout")));
};
