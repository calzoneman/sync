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
    }
};
