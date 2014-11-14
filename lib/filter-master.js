function FilterMaster(worker) {
    this.waiting = {};
    this.worker = worker;
    this.id = 0;

    this.worker.on("message", this.handleMessage.bind(this));
}

FilterMaster.prototype.filterMessage = function (channel, message, cb) {
    var req = {
        cmd: "filter",
        channel: channel.name,
        message: message,
        id: this.id++
    };

    var resdata = {
        cb: cb,
        channel: channel,
        message: message,
        time: Date.now()
    };

    this.waiting[req.id] = resdata;
    this.worker.send(req);
};

FilterMaster.prototype.handleMessage = function (data) {
    if (data.cmd === "filterResult") {
        var res = this.waiting[data.id];
        if (!res) return;
        delete this.waiting[data.id];

        if (data.error) {
            // TODO log error
            return;
        }

        res.cb(data.message);
    } else if (data.cmd === "needFilterData") {
        var res = this.waiting[data.id];
        if (!res) return;

        var data = {
            filters: res.channel.modules.filters.filters.pack(),
            channel: res.channel.name,

    }
};
