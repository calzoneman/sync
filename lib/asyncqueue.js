var AsyncQueue = function () {
    this._q = [];
    this._lock = false;
    this._tm = 0;
};

AsyncQueue.prototype.next = function () {
    if (this._q.length > 0) {
        if (!this.lock())
            return;
        var item = this._q.shift();
        var fn = item[0], tm = item[1];
        this._tm = Date.now() + item[1];
        fn(this);
    }
};

AsyncQueue.prototype.lock = function () {
    if (this._lock) {
        if (this._tm > 0 && Date.now() > this._tm) {
            this._tm = 0;
            return true;
        }
        return false;
    }

    this._lock = true;
    return true;
};

AsyncQueue.prototype.release = function () {
    var self = this;
    if (!self._lock)
        return false;

    self._lock = false;
    setImmediate(function () {
        self.next();
    });
    return true;
};

AsyncQueue.prototype.queue = function (fn) {
    var self = this;
    self._q.push([fn, 20000]);
    self.next();
};

AsyncQueue.prototype.reset = function () {
    this._q = [];
    this._lock = false;
};

module.exports = AsyncQueue;
