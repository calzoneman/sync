function Channel(name) {
    MakeEmitter(this);
    var self = this;

    Logger.syslog.log("[LOAD] " + name);

    self.flags = 0;
    self.name = name;
    self.uniqueName = name.toLowerCase();
    self.users = [];
    self.
}
