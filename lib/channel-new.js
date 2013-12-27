var DEFAULT_FILTERS = [
    new Filter("monospace", "`(.+?)`", "g", "<code>$1</code>"),
    new Filter("bold", "\\*(.+?)\\*", "g", "<strong>$1</strong>"),
    new Filter("italic", "_(.+?)_", "g", "<em>$1</em>"),
    new Filter("strike", "~~(.+?)~~", "g", "<s>$1</s>"),
    new Filter("inline spoiler", "\\[sp\\](.*?)\\[\\/sp\\]", "ig", "<span class=\"spoiler\">$1</span>")
];

function Channel(name) {
    var self = this; // Alias `this` to prevent scoping issues   
    Logger.syslog.log("Loading channel " + name);

    // Defaults
    self.ready = false;
    self.name = name;
    self.uniqueName = name.toLowerCase(); // To prevent casing issues
    self.registered = false; // set to true if the channel exists in the database
    self.users = [];
    self.mutedUsers = new $util.Set();
    self.playlist = new Playlist(self);
    self.plqueue = new AsyncQueue(); // For synchronizing playlist actions
    self.drinks = 0;
    self.leader = null;
    self.chatbuffer = [];
    self.playlistLock = true;
    self.poll = null;
    self.voteskip = null;
    self.permissions = {
        playlistadd: 1.5, // Add video to the playlist
        playlistnext: 1.5, // TODO I don't think this is used
        playlistmove: 1.5, // Move a video on the playlist
        playlistdelete: 2, // Delete a video from the playlist
        playlistjump: 1.5, // Start a different video on the playlist
        playlistaddlist: 1.5, // Add a list of videos to the playlist
        oplaylistadd: -1, // Same as above, but for open (unlocked) playlist
        oplaylistnext: 1.5,
        oplaylistmove: 1.5,
        oplaylistdelete: 2,
        oplaylistjump: 1.5,
        oplaylistaddlist: 1.5,
        playlistaddcustom: 3, // Add custom embed to the playlist
        playlistaddlive: 1.5, // Add a livestream to the playlist
        exceedmaxlength: 2, // Add a video longer than the maximum length set
        addnontemp: 2, // Add a permanent video to the playlist
        settemp: 2, // Toggle temporary status of a playlist item
        playlistgeturl: 1.5, // TODO is this even used?
        playlistshuffle: 2, // Shuffle the playlist
        playlistclear: 2, // Clear the playlist
        pollctl: 1.5, // Open/close polls
        pollvote: -1, // Vote in polls
        viewhiddenpoll: 1.5, // View results of hidden polls
        voteskip: -1, // Vote to skip the current video
        mute: 1.5, // Mute other users
        kick: 1.5, // Kick other users
        ban: 2, // Ban other users
        motdedit: 3, // Edit the MOTD
        filteredit: 3, // Control chat filters
        drink: 1.5, // Use the /d command
        chat: 0 // Send chat messages
    };
    self.opts = {
        allow_voteskip: true, // Allow users to voteskip
        voteskip_ratio: 0.5, // Ratio of skip votes:non-afk users needed to skip the video
        afk_timeout: 600, // Number of seconds before a user is automatically marked afk
        pagetitle: self.name, // Title of the browser tab
        maxlength: 0, // Maximum length (in seconds) of a video queued
        externalcss: "", // Link to external stylesheet
        externaljs: "", // Link to external script
        chat_antiflood: false, // Throttle chat messages
        chat_antiflood_params: {
            burst: 4, // Number of messages to allow with no throttling
            sustained: 1, // Throttle rate (messages/second)
            cooldown: 4 // Number of seconds with no messages before burst is reset
        },
        show_public: false, // List the channel on the index page
        enable_link_regex: true, // Use the built-in link filter
        password: false // Channel password (false -> no password required for entry)
    };
    self.motd = {
        motd: "", // Raw MOTD text
        html: "" // Filtered MOTD text (XSS removed; \n replaced by <br>)
    };
    self.filters = DEFAULT_FILTERS;
    self.banlist = new Banlist();
    self.logger = new Logger.Logger(path.join(__dirname, "../chanlogs",
                                    self.uniqueName + ".log"));
    self.css = ""; // Up to 20KB of inline CSS
    self.js = ""; // Up to 20KB of inline Javascript
    
    self.error = false; // Set to true if something bad happens => don't save state

    self.on("ready", function () {
        self.ready = true;
    });

    // Load from database
    db.channels.load(self, function (err) {
        if (err && err !== "Channel is not registered") {
            return;
        } else {
            // Load state from JSON blob
            self.tryLoadState();
        }
    });
};

Channel.prototype = EventEmitter;

Channel.prototype.tryLoadState = function () {
    var self = this;
    if (self.name === "") {
        return;
    }

    // Don't load state if the channel isn't registered
    if (!self.registered) {
        self.emit("ready");
        return;
    }

    var file = path.join(__dirname, "../chandump", self.uniqueName);
    fs.stat(file, function (err, stats) {
        if (!err) {
            var mb = stats.size / 1048576;
            mb = Math.floor(mb * 100) / 100;
            if (mb > 1) {
                Logger.errlog.log("Large chandump detected: " + self.uniqueName +
                                  " (" + mb + " MiB)");
                self.setMOTD("Your channel file has exceeded the maximum size of 1MB " +
                             "and cannot be loaded.  Please ask an administrator for " +
                             "assistance in restoring it.");
                self.error = true;
                self.emit("ready");
                return;
            }
        }

        self.loadState();
    });
};

/**
 * Load the channel state from disk.
 *
 * SHOULD ONLY BE CALLED FROM tryLoadState
 */
Channel.prototype.loadState = function () {
    var self = this;
    if (self.error) {
        return;
    }

    fs.readFile(path.join(__dirname, "../chandump", self.name),
    function (err, data) {
        if (err) {
            // File didn't exist => start fresh
            if (err.code === "ENOENT") {
                self.emit("ready");
                self.saveState();
            } else {
                Logger.errlog.log("Failed to open channel dump " + self.uniqueName);
                Logger.errlog.log(err);
                self.setMOTD("Internal error when loading channel");
                self.error = true;
                self.emit("ready");
            }
            return;
        }

        try {
            self.logger.log("*** Loading channel state");
            data = JSON.parse(data);

            // Load the playlist
            if ("playlist" in data) {
            }

            // Playlist lock
            self.setLock(data.playlistLock || false);
            
            // Configurables
            if ("opts" in data) {
                for (var key in data.opts) {
                    self.opts[key] = data.opts;
                }
            }

            // Permissions
            if ("permissions" in data) {
                for (var key in data.permissions) {
                    self.permissions[key] = data.permissions[key];
                }
            }

            // Chat filters
            if ("filters" in data) {
                for (var i = 0; i < data.filters.length; i++) {
                    var f = data.filters[i];
                    var filt = new Filter(f.name, f.source, f.flags, f.replace);
                    filt.active = f.active;
                    filt.filterlinks = f.filterlinks;
                    self.updateFilter(filt, false);
                }
            }

        } catch (e) {

        }
    });
};
