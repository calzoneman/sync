(function () {
    var TYPE_FRAME = 0;
    var TYPE_ACK = 1;

    function WSShim(url) {
        this._url = url;
        this._listeners = Object.create(null);
        this._connected = false;

        this._ackId = 0;
        this._pendingAcks = Object.create(null);

        this._openWS();
    }

    WSShim.prototype.listeners = function listeners(frame) {
        if (!Object.prototype.hasOwnProperty.call(this._listeners, frame)) {
            this._listeners[frame] = [];
        }

        return this._listeners[frame];
    };

    WSShim.prototype.on = function on(frame, callback) {
        this.listeners(frame).push(callback);
    };

    WSShim.prototype.once = function on(frame, callback) {
        callback._once = true;
        this.listeners(frame).push(callback);
    };

    WSShim.prototype.emit = function emit(frame, payload, ack) {
        var message = {
            type: TYPE_FRAME,
            frame: frame,
            payload: payload
        };

        if (ack && typeof ack === 'function') {
            message.ackId = ++this._ackId;
            this._pendingAcks[message.ackId] = ack;
        }

        this._ws.send(JSON.stringify(message));
    };

    WSShim.prototype._emit = function _emit(frame, payload) {
        var hasOnce = false;

        this.listeners(frame).forEach(function (cb) {
            try {
                if (cb._once) {
                    hasOnce = true;
                }

                cb(payload);
            } catch (error) {
                console.error('Error in callback for ' + frame + ': ' + error);
            }
        });

        if (hasOnce) {
            this._listeners[frame] = this._listeners[frame].filter(function (cb) {
                return !cb._once;
            });
        }
    };

    WSShim.prototype._onopen = function _onopen() {
        this._connected = true;
    };

    WSShim.prototype._onclose = function _onclose() {
        if (!this._connected) {
            return;
        }

        this._connected = false;
        this._emit('disconnect');

        // TODO: checking for KICKED here is insufficient;
        // need to have some sort of explicit disconnect vs. connection loss
        // check
        if (!KICKED) {
            var self = this;

            function reconnectAsync(cb) {
                self._openWS();

                self._ws.addEventListener('open', function () {
                    cb(null);
                });

                self._ws.addEventListener('error', function (error) {
                    cb(error);
                });
            }

            var retryOpts = {
                delay: 1000,
                jitter: 1000,
                factor: 2,
                maxDelay: 20000
            };

            setTimeout(function () {
                backoffRetry(reconnectAsync, function(){}, retryOpts);
            }, 1000);
        }
    };

    WSShim.prototype._onmessage = function _onmessage(message) {
        try {
            var parsed = JSON.parse(message.data);
            console.log(parsed);
            var type = parsed.type;
            var frame = parsed.frame;
            var payload = parsed.payload;
            var ackId = parsed.ackId;

            if (type === TYPE_ACK && ackId in this._pendingAcks) {
                this._pendingAcks[ackId](payload);
                delete this._pendingAcks[ackId];
            } else if (type === TYPE_FRAME) {
                this._emit(frame, payload);
            }
        } catch (error) {
            console.error('Unparseable message from server: ' + message);
            console.error(error.stack);
            return;
        }
    };

    WSShim.prototype._openWS = function _openWS() {
        if (this._connected) {
            throw new Error('Cannot _openWS() when already connected');
        }

        this._ws = new WebSocket(this._url);
        this._ws.onopen = this._onopen.bind(this);
        this._ws.onclose = this._onclose.bind(this);
        this._ws.onmessage = this._onmessage.bind(this);
        this._connected = false;
    };

    window.WSShim = WSShim;
})();
