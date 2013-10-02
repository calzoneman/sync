/*
The MIT License (MIT)
Copyright (c) 2013 Calvin Montgomery

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

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
