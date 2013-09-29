var AsyncQueue = function () {
    this._q = [];
    this._lock = false;
    this._tm = 0;
};

AsyncQueue.prototype.next = function () {
    if (this._q.length > 0) {
        if (!this.lock())
            return;
        var fn = this._q.shift();
        fn(this);
    }
};

AsyncQueue.prototype.lock = function () {
    if (this._lock)
        return false;

    this._lock = true;
    return true;
};

AsyncQueue.prototype.release = function () {
    var self = this;
    if (!self._lock)
        return false;

    self._lock = false;
    process.nextTick(function () {
        self.next();
    });
    return true;
};

AsyncQueue.prototype.queue = function (fn) {
    var self = this;
    self._q.push(fn);
    self.next();
};

AsyncQueue.prototype.reset = function () {
    this._q = [];
    this._lock = false;
};
