var $util = require("../utilities");
var bcrypt = require("bcrypt");
var db = require("../database");
var Config = require("../config");
import { promisify } from "bluebird";

const LOGGER = require('@calzoneman/jsli')('database/accounts');

var registrationLock = {};
var blackHole = function () { };

function parseProfile(data) {
    try {
        var profile = JSON.parse(data.profile);
        profile.image = profile.image || "";
        profile.text = profile.text || "";
        data.profile = profile;
    } catch (error) {
        data.profile = { image: "", text: "" };
    }
}

module.exports = {
    init: function () {
    },

    /**
     * Convert a username for deduplication purposes.
     * Collapses visibily similar characters into a single character.
     * @param name
     */
    dedupeUsername: function dedupeUsername(name) {
        return name.replace(/[Il1]/ig, '1')
            .replace(/[o0]/ig, '0')
            .replace(/[_-]/g, '_');
    },

    /**
     * Check if a username is taken
     */
    isUsernameTaken: function (name, callback) {
        db.query("SELECT name FROM `users` WHERE name = ? or name_dedupe = ?",
                 [name, module.exports.dedupeUsername(name)],
        function (err, rows) {
            if (err) {
                callback(err, true);
                return;
            }

            let matched = null;

            rows.forEach(row => {
                if (row.name === name) {
                    matched = name;
                } else if (matched === null) {
                    matched = row.name;
                }
            });

            callback(
                null,
                rows.length > 0,
                matched
            );
        });
    },

    /**
     * Search for a user by any field
     */
    search: function (where, like, fields, callback) {
        // Don't allow search to return password hashes
        if (fields.indexOf("password") !== -1) {
            fields.splice(fields.indexOf("password"));
        }

        db.query(`SELECT ${fields.join(",")} FROM \`users\` WHERE ${where} LIKE ?`,
                 ["%"+like+"%"],
        function (err, rows) {
            if (err) {
                callback(err, true);
                return;
            }
            callback(null, rows);
        });
    },

    getUser: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        db.query("SELECT * FROM `users` WHERE name = ? AND inactive = FALSE",
                 [name],
                 function (err, rows) {
            if (err) {
                callback(err, true);
                return;
            }

            if (rows.length !== 1) {
                return callback("User does not exist");
            }

            parseProfile(rows[0]);
            callback(null, rows[0]);
        });
    },

    /**
     * Registers a new user account
     */
    register: function (name, pw, email, ip, callback) {
        // Start off with a boatload of error checking
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (typeof name !== "string" || typeof pw !== "string") {
            callback("You must provide a nonempty username and password", null);
            return;
        }
        var lname = name.toLowerCase();

        if (registrationLock[lname]) {
            callback("There is already a registration in progress for "+name,
                     null);
            return;
        }

        if (!$util.isValidUserName(name)) {
            callback("Invalid username.  Usernames may consist of 1-20 " +
                     "characters a-z, A-Z, 0-9, -, _, and accented letters.",
                     null);
            return;
        }

        if (typeof email !== "string") {
            email = "";
        }

        if (typeof ip !== "string") {
            ip = "";
        }

        // From this point forward, actual registration happens
        // registrationLock prevents concurrent database activity
        // on the same user account
        registrationLock[lname] = true;

        this.getAccounts(ip, function (err, accts) {
            if (err) {
                delete registrationLock[lname];
                callback(err, null);
                return;
            }

            if (accts.length >= Config.get("max-accounts-per-ip")) {
                delete registrationLock[lname];
                callback("You have registered too many accounts from this "+
                         "computer.", null);
                return;
            }

            module.exports.isUsernameTaken(name, function (err, taken, matched) {
                if (err) {
                    delete registrationLock[lname];
                    callback(err, null);
                    return;
                }

                if (taken) {
                    delete registrationLock[lname];

                    if (matched === name) {
                        callback(
                            `Please choose a different username: "${name}" ` +
                            `is already registered.`,
                            null
                        );
                    } else {
                        callback(
                            `Please choose a different username: "${name}" ` +
                            `too closely matches an existing name.  ` +
                            `For example, "Joe" (lowercase 'o'), and ` +
                            `"j0e" (zero) are not considered unique.`,
                            null
                        );
                    }
                    return;
                }

                bcrypt.hash(pw, 10, function (err, hash) {
                    if (err) {
                        delete registrationLock[lname];
                        callback(err, null);
                        return;
                    }

                    db.query("INSERT INTO `users` " +
                             "(`name`, `password`, `global_rank`, `email`, `profile`, `ip`, `time`, `name_dedupe`)" +
                             " VALUES " +
                             "(?, ?, ?, ?, '', ?, ?, ?)",
                             [name, hash, 1, email, ip, Date.now(), module.exports.dedupeUsername(name)],
                    function (err, _res) {
                        delete registrationLock[lname];
                        if (err) {
                            callback(err, null);
                        } else {
                            callback(null, {
                                name: name,
                                hash: hash
                            });
                        }
                    });
                });
            });
        });
    },

    /**
     * Verify a username/password pair
     */
    verifyLogin: function (name, pw, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (typeof name !== "string" || typeof pw !== "string") {
            callback("Invalid username/password combination", null);
            return;
        }

        if (!$util.isValidUserName(name)) {
            callback(`Invalid username "${name}"`);
            return;
        }

        /* Passwords are capped at 100 characters to prevent a potential
           denial of service vector through causing the server to hash
           ridiculously long strings.
        */
        pw = pw.substring(0, 100);

        /* Note: rather than hash the password and then query based on name and
           password, I query by name, then use bcrypt.compare() to check that
           the hashes match.
        */

        db.query("SELECT * FROM `users` WHERE name=? AND inactive = FALSE",
                 [name],
        function (err, rows) {
            if (err) {
                callback(err, null);
                return;
            }

            if (rows.length === 0) {
                callback("User does not exist", null);
                return;
            }

            bcrypt.compare(pw, rows[0].password, function (err, match) {
                if (err) {
                    callback(err, null);
                } else if (!match) {
                    callback("Invalid username/password combination", null);
                } else {
                    parseProfile(rows[0]);
                    callback(null, rows[0]);
                }
            });
        });
    },

    /**
     * Change a user's password
     */
    setPassword: function (name, pw, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (typeof name !== "string" || typeof pw !== "string") {
            callback("Invalid username/password combination", null);
            return;
        }

        /* Passwords are capped at 100 characters to prevent a potential
           denial of service vector through causing the server to hash
           ridiculously long strings.
        */
        pw = pw.substring(0, 100);

        bcrypt.hash(pw, 10, function (err, hash) {
            if (err) {
                callback(err, null);
                return;
            }

            db.query("UPDATE `users` SET password=? WHERE name=?",
                     [hash, name],
            function (err, _result) {
                callback(err, err ? null : true);
            });
        });
    },

    /**
     * Lookup a user's global rank
     */
    getGlobalRank: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (typeof name !== "string") {
            callback("Invalid username", null);
            return;
        }

        if (!name) {
            callback(null, -1);
            return;
        }

        db.query("SELECT global_rank FROM `users` WHERE name=?", [name],
        function (err, rows) {
            if (err) {
                callback(err, null);
            } else if (rows.length === 0) {
                callback(null, 0);
            } else {
                callback(null, rows[0].global_rank);
            }
        });
    },

    /**
     * Updates a user's global rank
     */
    setGlobalRank: function (name, rank, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (typeof name !== "string") {
            callback("Invalid username", null);
            return;
        }

        if (typeof rank !== "number") {
            callback("Invalid rank", null);
            return;
        }

        db.query("UPDATE `users` SET global_rank=? WHERE name=?", [rank, name],
        function (err, _result) {
            callback(err, err ? null : true);
        });
    },

    /**
     * Lookup multiple users' global rank in one query
     */
    getGlobalRanks: function (names, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (!(names instanceof Array)) {
            callback("Expected array of names, got " + typeof names, null);
            return;
        }

        if (names.length === 0) {
            return callback(null, []);
        }

        var list = "(" + names.map(function () { return "?";}).join(",") + ")";

        db.query("SELECT global_rank FROM `users` WHERE name IN " + list, names,
        function (err, rows) {
            if (err) {
                callback(err, null);
            } else if (rows.length === 0) {
                callback(null, []);
            } else {
                callback(null, rows.map(function (x) { return x.global_rank; }));
            }
        });
    },

    /**
     * Lookup a user's email
     */
    getEmail: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (typeof name !== "string") {
            callback("Invalid username", null);
            return;
        }

        db.query("SELECT email FROM `users` WHERE name=? AND inactive = FALSE", [name],
        function (err, rows) {
            if (err) {
                callback(err, null);
            } else if (rows.length === 0) {
                callback("User does not exist", null);
            } else {
                callback(null, rows[0].email);
            }
        });
    },

    /**
     * Updates a user's email
     */
    setEmail: function (name, email, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (typeof name !== "string") {
            callback("Invalid username", null);
            return;
        }

        if (typeof email !== "string") {
            callback("Invalid email", null);
            return;
        }

        db.query("UPDATE `users` SET email=? WHERE name=?", [email, name],
        function (err, _result) {
            callback(err, err ? null : true);
        });
    },

    /**
     * Lookup a user's profile
     */
    getProfile: function (name, callback) {
        if (typeof callback !== "function") {
            return;
        }

        if (typeof name !== "string") {
            callback("Invalid username", null);
            return;
        }

        db.query("SELECT profile FROM `users` WHERE name=?", [name],
        function (err, rows) {
            if (err) {
                callback(err, null);
            } else if (rows.length === 0) {
                callback("User does not exist", null);
            } else {
                var userprof = {
                    image: "",
                    text: ""
                };

                if (rows[0].profile === "") {
                    callback(null, userprof);
                    return;
                }

                try {
                    var profile = JSON.parse(rows[0].profile);
                    userprof.image = profile.image || "";
                    userprof.text = profile.text || "";
                    callback(null, userprof);
                } catch (e) {
                    LOGGER.error("Corrupt profile: " + rows[0].profile +
                        " (user: " + name + ")");
                    callback(null, userprof);
                }
            }
        });
    },

    /**
     * Updates a user's profile
     */
    setProfile: function (name, profile, callback) {
        if (typeof callback !== "function") {
            callback = blackHole;
        }

        if (typeof name !== "string") {
            callback("Invalid username", null);
            return;
        }

        if (typeof profile !== "object") {
            callback("Invalid profile", null);
            return;
        }

        // Cast to string to guarantee string type
        profile.image += "";
        profile.text += "";

        // Limit size
        profile.image = profile.image.substring(0, 255);
        profile.text = profile.text.substring(0, 255);

        // Stringify the literal to guarantee I only get the keys I want
        var profilejson = JSON.stringify({
            image: profile.image,
            text: profile.text
        });

        db.query("UPDATE `users` SET profile=? WHERE name=?", [profilejson, name],
        function (err, _result) {
            callback(err, err ? null : true);
        });
    },

    /**
     * Retrieves all names registered from a given IP
     */
    getAccounts: function (ip, callback) {
        if (typeof callback !== "function") {
            return;
        }

        db.query("SELECT name,global_rank FROM `users` WHERE `ip`=?", [ip],
                 callback);
    },

    requestAccountDeletion: id => {
        return db.getDB().runTransaction(async tx => {
            try {
                let user = await tx.table('users').where({ id }).first();
                await tx.table('user_deletion_requests')
                        .insert({
                            user_id: id
                        });
                await tx.table('users')
                        .where({ id })
                        .update({ password: '', inactive: true });

                // TODO: ideally password reset should be by user_id and not name
                // For now, we need to make sure to clear it
                await tx.table('password_reset')
                        .where({ name: user.name })
                        .delete();
            } catch (error) {
                // Ignore unique violation -- probably caused by a duplicate request
                if (error.code !== 'ER_DUP_ENTRY') {
                    throw error;
                }
            }
        });
    },

    findAccountsPendingDeletion: () => {
        return db.getDB().runTransaction(tx => {
            let lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000);
            return tx.table('user_deletion_requests')
                    .where('user_deletion_requests.created_at', '<', lastWeek)
                    .join('users', 'user_deletion_requests.user_id', '=', 'users.id')
                    .select('users.id', 'users.name');
        });
    },

    purgeAccount: id => {
        return db.getDB().runTransaction(async tx => {
            let user = await tx.table('users').where({ id }).first();
            if (!user) {
                return false;
            }

            await tx.table('channel_ranks').where({ name: user.name }).delete();
            await tx.table('user_playlists').where({ user: user.name }).delete();
            await tx.table('users').where({ id }).delete();
            return true;
        });
    }
};

module.exports.verifyLoginAsync = promisify(module.exports.verifyLogin);
