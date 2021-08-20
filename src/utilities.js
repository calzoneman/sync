(function () {
    const root = module.exports;
    const net = require("net");
    const crypto = require("crypto");

    root.isValidChannelName = function (name) {
        return name.match(/^[\w-]{1,30}$/);
    },

    root.isValidUserName = function (name) {
        return name.match(/^[\w-]{1,20}$/);
    },

    root.isValidEmail = function (email) {
        if (typeof email !== "string") {
            return false;
        }

        if (email.length > 255) {
            return false;
        }

        if (!email.match(/^[^@]+?@[^@]+$/)) {
            return false;
        }

        if (email.match(/^[^@]+?@(localhost|127\.0\.0\.1)$/)) {
            return false;
        }

        return true;
    },

    root.randomSalt = function (length) {
        var chars = "abcdefgihjklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
                  + "0123456789!@#$%^&*_+=~";
        var salt = [];
        for(var i = 0; i < length; i++) {
            salt.push(chars[parseInt(Math.random()*chars.length)]);
        }
        return salt.join('');
    },

    root.getIPRange = function (ip) {
        if (net.isIPv6(ip)) {
            return root.expandIPv6(ip)
                   .replace(/((?:[0-9a-f]{4}:){3}[0-9a-f]{4}):(?:[0-9a-f]{4}:){3}[0-9a-f]{4}/, "$1");
        } else {
            return ip.replace(/((?:[0-9]+\.){2}[0-9]+)\.[0-9]+/, "$1");
        }
    },

    root.getWideIPRange = function (ip) {
        if (net.isIPv6(ip)) {
            return root.expandIPv6(ip)
                   .replace(/((?:[0-9a-f]{4}:){2}[0-9a-f]{4}):(?:[0-9a-f]{4}:){4}[0-9a-f]{4}/, "$1");
        } else {
            return ip.replace(/([0-9]+\.[0-9]+)\.[0-9]+\.[0-9]+/, "$1");
        }
    },

    root.expandIPv6 = function (ip) {
        var result = "0000:0000:0000:0000:0000:0000:0000:0000".split(":");
        var parts = ip.split("::");
        var left = parts[0].split(":");
        var i = 0;
        left.forEach(function (block) {
            while (block.length < 4) {
                block = "0" + block;
            }
            result[i++] = block;
        });

        if (parts.length > 1) {
            var right = parts[1].split(":");
            i = 7;
            right.forEach(function (block) {
                while (block.length < 4) {
                    block = "0" + block;
                }
                result[i--] = block;
            });
        }

        return result.join(":");
    },

    root.formatTime = function (sec) {
        if(sec === "--:--")
            return sec;

        sec = Math.floor(+sec);
        var h = "", m = "", s = "";

        if(sec >= 3600) {
            h = "" + Math.floor(sec / 3600);
            if(h.length < 2)
                h = "0" + h;
            sec %= 3600;
        }

        m = "" + Math.floor(sec / 60);
        if(m.length < 2)
            m = "0" + m;

        s = "" + (sec % 60);
        if(s.length < 2)
            s = "0" + s;

        if(h === "")
            return [m, s].join(":");

        return [h, m, s].join(":");
    },

    root.parseTime = function (time) {
        var parts = time.split(":").reverse();
        var seconds = 0;
        // TODO: consider refactoring to remove this suppression
        /* eslint no-fallthrough: off */
        switch (parts.length) {
            case 3:
                seconds += parseInt(parts[2]) * 3600;
            case 2:
                seconds += parseInt(parts[1]) * 60;
            case 1:
                seconds += parseInt(parts[0]);
                break;
            default:
                break;
        }
        return seconds;
    },

    root.newRateLimiter = function () {
        return {
            count: 0,
            lastTime: 0,
            throttle: function (opts) {
                if (typeof opts === "undefined")
                    opts = {};

                var burst = +opts.burst,
                    sustained = +opts.sustained,
                    cooldown = +opts.cooldown;

                if (isNaN(burst))
                    burst = 10;

                if (isNaN(sustained))
                    sustained = 2;

                if (isNaN(cooldown))
                    cooldown = burst / sustained;

                // Cooled down, allow and clear buffer
                if (this.lastTime < Date.now() - cooldown*1000) {
                    this.count = 1;
                    this.lastTime = Date.now();
                    return false;
                }

                // Haven't reached burst cap yet, allow
                if (this.count < burst) {
                    this.count++;
                    this.lastTime = Date.now();
                    return false;
                }

                var diff = Date.now() - this.lastTime;
                if (diff < 1000/sustained)
                    return true;

                this.lastTime = Date.now();
                return false;
            }
        };
    },

    root.formatLink = function (id, type, _meta) {
        switch (type) {
            case "yt":
                return "https://youtu.be/" + id;
            case "vi":
                return "https://vimeo.com/" + id;
            case "dm":
                return "https://dailymotion.com/video/" + id;
            case "sc":
                return id;
            case "li":
                return "https://livestream.com/" + id;
            case "tw":
                return "https://twitch.tv/" + id;
            case "rt":
                return id;
            case "us":
                return "https://ustream.tv/channel/" + id;
            case "gd":
                return "https://docs.google.com/file/d/" + id;
            case "fi":
                return id;
            case "hb":
                return "https://www.smashcast.tv/" + id;
            case "hl":
                return id;
            case "sb":
                return "https://streamable.com/" + id;
            case "tc":
                return "https://clips.twitch.tv/" + id;
            case "cm":
                return id;
            default:
                return "";
        }
    },

    root.isLive = function (type) {
        switch (type) {
            case "li":
            case "tw":
            case "us":
            case "rt":
            case "cu":
            case "hb":
            case "hl":
                return true;
            default:
                return false;
        }
    },

    root.sha1 = function (data) {
        if (!crypto) {
            return "";
        }
        var shasum = crypto.createHash("sha1");
        shasum.update(data);
        return shasum.digest("hex");
    },

    root.cloakIP = function (ip) {
        if (ip.match(/\d+\.\d+(\.\d+)?(\.\d+)?/)) {
            return cloakIPv4(ip);
        } else if (ip.match(/([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4}/)) {
            return cloakIPv6(ip);
        } else {
            return ip;
        }

        function iphash(data, len) {
            var md5 = crypto.createHash("md5");
            md5.update(data);
            return md5.digest("base64").substring(0, len);
        }

        function cloakIPv4(ip) {
            var parts = ip.split(".");
            var accumulator = "";

            parts = parts.map(function (segment, i) {
                var part = iphash(accumulator + segment + i, 3);
                accumulator += segment;
                return part;
            });

            while (parts.length < 4) parts.push("*");
            return parts.join(".");
        }

        function cloakIPv6(ip) {
            var parts = ip.split(":");
            parts.splice(4, 4);
            var accumulator = "";

            parts = parts.map(function (segment, i) {
                var part = iphash(accumulator + segment + i, 4);
                accumulator += segment;
                return part;
            });

            while (parts.length < 4) parts.push("*");
            return parts.join(":");
        }
    };
})();
