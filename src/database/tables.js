const LOGGER = require('@calzoneman/jsli')('database/tables');

const TBL_USERS = "" +
    "CREATE TABLE IF NOT EXISTS `users` (" +
        "`id` INT NOT NULL AUTO_INCREMENT," +
        "`name` VARCHAR(20) NOT NULL," +
        "`password` VARCHAR(64) NOT NULL," +
        "`global_rank` INT NOT NULL," +
        "`email` VARCHAR(255) NOT NULL," +
        "`profile` TEXT CHARACTER SET utf8mb4 NOT NULL," +
        "`ip` VARCHAR(39) NOT NULL," +
        "`time` BIGINT NOT NULL," +
        "`name_dedupe` VARCHAR(20) DEFAULT NULL," +
        "PRIMARY KEY(`id`)," +
        "UNIQUE(`name`)," +
        "UNIQUE(`name_dedupe`)) " +
    "CHARACTER SET utf8";

const TBL_CHANNELS = "" +
    "CREATE TABLE IF NOT EXISTS `channels` (" +
        "`id` INT NOT NULL AUTO_INCREMENT," +
        "`name` VARCHAR(30) NOT NULL," +
        "`owner` VARCHAR(20) NOT NULL," +
        "`time` BIGINT NOT NULL," +
        "`last_loaded` TIMESTAMP NOT NULL DEFAULT 0," +
        "`owner_last_seen` TIMESTAMP NOT NULL DEFAULT 0," +
        "PRIMARY KEY (`id`)," +
        "UNIQUE(`name`)," +
        "INDEX(`owner`)," +
        "INDEX(`last_loaded`)," +
        "INDEX(`owner_last_seen`)) " +
    "CHARACTER SET utf8";

const TBL_GLOBAL_BANS = "" +
    "CREATE TABLE IF NOT EXISTS `global_bans` (" +
        "`ip` VARCHAR(39) NOT NULL," +
        "`reason` VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL," +
    "PRIMARY KEY (`ip`)) " +
    "CHARACTER SET utf8";

const TBL_PASSWORD_RESET = "" +
    "CREATE TABLE IF NOT EXISTS `password_reset` (" +
        "`ip` VARCHAR(39) NOT NULL," +
        "`name` VARCHAR(20) NOT NULL," +
        "`hash` VARCHAR(64) NOT NULL," +
        "`email` VARCHAR(255) NOT NULL," +
        "`expire` BIGINT NOT NULL," +
        "PRIMARY KEY (`name`))" +
    "CHARACTER SET utf8";

const TBL_USER_PLAYLISTS = "" +
    "CREATE TABLE IF NOT EXISTS `user_playlists` (" +
        "`user` VARCHAR(20) NOT NULL," +
        "`name` VARCHAR(255) NOT NULL," +
        "`contents` MEDIUMTEXT NOT NULL," +
        "`count` INT NOT NULL," +
        "`duration` INT NOT NULL," +
        "PRIMARY KEY (`user`, `name`))" +
    "CHARACTER SET utf8";

const TBL_ALIASES = "" +
    "CREATE TABLE IF NOT EXISTS `aliases` (" +
        "`visit_id` INT NOT NULL AUTO_INCREMENT," +
        "`ip` VARCHAR(39) NOT NULL," +
        "`name` VARCHAR(20) NOT NULL," +
        "`time` BIGINT NOT NULL," +
        "PRIMARY KEY (`visit_id`), INDEX (`ip`)" +
    ")";

const TBL_META = "" +
    "CREATE TABLE IF NOT EXISTS `meta` (" +
        "`key` VARCHAR(255) NOT NULL," +
        "`value` TEXT NOT NULL," +
        "PRIMARY KEY (`key`))" +
    "CHARACTER SET utf8";

const TBL_LIBRARIES = "" +
    "CREATE TABLE IF NOT EXISTS `channel_libraries` (" +
        "`id` VARCHAR(255) NOT NULL," +
        "`title` VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL," +
        "`seconds` INT NOT NULL," +
        "`type` VARCHAR(2) NOT NULL," +
        "`meta` TEXT NOT NULL," +
        "`channel` VARCHAR(30) NOT NULL," +
        "PRIMARY KEY(`id`, `channel`), INDEX(`channel`, `title`(227))" +
    ") CHARACTER SET utf8";

const TBL_RANKS = "" +
    "CREATE TABLE IF NOT EXISTS `channel_ranks` (" +
        "`name` VARCHAR(20) NOT NULL," +
        "`rank` INT NOT NULL," +
        "`channel` VARCHAR(30) NOT NULL," +
        "PRIMARY KEY(`name`, `channel`)" +
    ") CHARACTER SET utf8";

const TBL_BANS = "" +
    "CREATE TABLE IF NOT EXISTS `channel_bans` (" +
        "`id` INT NOT NULL AUTO_INCREMENT," +
        "`ip` VARCHAR(39) NOT NULL," +
        "`name` VARCHAR(20) NOT NULL," +
        "`bannedby` VARCHAR(20) NOT NULL," +
        "`reason` VARCHAR(255) CHARACTER SET utf8mb4 NOT NULL," +
        "`channel` VARCHAR(30) NOT NULL," +
    "PRIMARY KEY (`id`, `channel`), UNIQUE (`name`, `ip`, `channel`), " +
    "INDEX (`ip`, `channel`), INDEX (`name`, `channel`)" +
    ") CHARACTER SET utf8";

const TBL_CHANNEL_DATA = "" +
    "CREATE TABLE IF NOT EXISTS `channel_data` (" +
        "`channel_id` INT NOT NULL," +
        "`key` VARCHAR(20) NOT NULL," +
        "`value` MEDIUMTEXT CHARACTER SET utf8mb4 NOT NULL," +
    "PRIMARY KEY (`channel_id`, `key`)," +
    "FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE CASCADE" +
    ") CHARACTER SET utf8";

module.exports.init = function (queryfn, cb) {
    var tables = {
        users: TBL_USERS,
        channels: TBL_CHANNELS,
        channel_libraries: TBL_LIBRARIES,
        channel_ranks: TBL_RANKS,
        channel_bans: TBL_BANS,
        global_bans: TBL_GLOBAL_BANS,
        password_reset: TBL_PASSWORD_RESET,
        user_playlists: TBL_USER_PLAYLISTS,
        aliases: TBL_ALIASES,
        meta: TBL_META,
        channel_data: TBL_CHANNEL_DATA
    };

    var AsyncQueue = require("../asyncqueue");
    var aq = new AsyncQueue();
    var hasError = false;
    Object.keys(tables).forEach(function (tbl) {
        aq.queue(function (lock) {
            queryfn(tables[tbl], function (err) {
                if (err) {
                    LOGGER.error(
                        'Failed to create table %s: %s',
                        tbl,
                        err.stack
                    );
                    hasError = true;
                }
                lock.release();
            });
        });
    });

    aq.queue(function (lock) {
        lock.release();
        cb(hasError);
    });
};
