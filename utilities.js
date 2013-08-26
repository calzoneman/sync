module.exports = {
    isValidChannelName: function (name) {
        return name.match(/^[\w-_]{1,30}$/);
    },

    isValidUserName: function (name) {
        return name.match(/^[\w-_]{1,20}$/);
    },

    randomSalt: function (length) {
        var chars = "abcdefgihjklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
                  + "0123456789!@#$%^&*_+=~";
        var salt = [];
        for(var i = 0; i < length; i++) {
            salt.push(chars[parseInt(Math.random()*chars.length)]);
        }
        return salt.join('');
    },

    maskIP: function (ip) {
        if(ip.match(/^\d+\.\d+\.\d+\.\d+$/)) {
            // standard 32 bit IP
            return ip.replace(/\d+\.\d+\.(\d+\.\d+)/, "x.x.$1");
        } else if(ip.match(/^\d+\.\d+\.\d+/)) {
            // /24 range
            return ip.replace(/\d+\.\d+\.(\d+)/, "x.x.$1.*");
        }
    },

    formatTime: function (sec) {
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
    }
};
