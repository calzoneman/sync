(function () {
    var TYPE_FRAME = 0;
    var TYPE_ACK = 1;

    function WSShim(ws) {
        this._ws = ws;
        this._listeners = Object.create(null);

        this._ws.onclose = this._onclose.bind(this);
        this._ws.onmessage = this._onmessage.bind(this);
        this._ws.onerror = this._onerror.bind(this);

        this._ackId = 0;
        this._pendingAcks = Object.create(null);
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
        this.listeners(frame).forEach(function (cb) {
            try {
                cb(payload);
            } catch (error) {
                console.error('Error in callback for ' + frame + ': ' + error);
            }
        });
    };

    WSShim.prototype._onclose = function _onclose() {
        // TODO: reconnect logic
        this._emit('disconnect');
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

    WSShim.prototype._onerror = function _onerror() {
        console.error('Dunno how to handle onerror');
    };

    window.WSShim = WSShim;
})();
