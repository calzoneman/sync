var dbAccounts = require("./database/accounts");
var util = require("./utilities");
var crypto = require("crypto");

function sha256(input) {
    var hash = crypto.createHash("sha256");
    hash.update(input);
    return hash.digest("base64");
}

exports.genSession = function (account, expiration, cb) {
    if (expiration instanceof Date) {
        expiration = Date.parse(expiration);
    }

    var salt = crypto.pseudoRandomBytes(24).toString("base64");
    var hashInput = [account.name, account.password, expiration, salt].join(":");
    var hash = sha256(hashInput);

    cb(null, [account.name, expiration, salt, hash].join(":"));
};

exports.verifySession = function (input, cb) {
    if (typeof input !== "string") {
        return cb("Invalid auth string");
    }

    var parts = input.split(":");
    if (parts.length !== 4) {
        return cb("Invalid auth string");
    }

    var name = parts[0];
    var expiration = parts[1];
    var salt = parts[2];
    var hash = parts[3];

    if (Date.now() > parseInt(expiration)) {
        return cb("Session expired");
    }

    dbAccounts.getUser(name, function (err, account) {
        if (err) {
            return cb(err);
        }

        var hashInput = [account.name, account.password, expiration, salt].join(":");
        if (sha256(hashInput) !== hash) {
            return cb("Invalid auth string");
        }

        cb(null, account);
    });
};
