var dbAccounts = require("./database/accounts");
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

    cb(null, [account.name, expiration, salt, hash, account.global_rank].join(":"));
};

exports.verifySession = function (input, cb) {
    if (typeof input !== "string") {
        return cb(new Error("Invalid auth string"));
    }

    var parts = input.split(":");
    if (parts.length !== 4 && parts.length !== 5) {
        return cb(new Error("Invalid auth string"));
    }

    const [name, expiration, salt, hash, _global_rank] = parts;

    if (Date.now() > parseInt(expiration, 10)) {
        return cb(new Error("Session expired"));
    }

    dbAccounts.getUser(name, function (err, account) {
        if (err) {
            if (!(err instanceof Error)) err = new Error(err);
            return cb(err);
        }

        var hashInput = [account.name, account.password, expiration, salt].join(":");
        if (sha256(hashInput) !== hash) {
            return cb(new Error("Invalid auth string"));
        }

        cb(null, account);
    });
};
