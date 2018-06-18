(function () {
    function WSShim(ws) {
        this._ws = ws;
        this._listeners = Object.create(null);

        this._ws.onclose = this._onclose.bind(this);
        this._ws.onmessage = this._onmessage.bind(this);
        this._ws.onerror = this._onerror.bind(this);
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

    WSShim.prototype.emit = function emit(/* args */) {
        var args = Array.prototype.slice.call(arguments).filter(function (it) {
            // TODO: handle ack
            return typeof it !== 'function';
        });

        this._ws.send(JSON.stringify(args));
    };

    WSShim.prototype._emit = function _emit(frame /*, args */) {
        var args = Array.prototype.slice.call(arguments, 1);

        this.listeners(frame).forEach(function (cb) {
            cb.apply(null, args);
        });
    };

    WSShim.prototype._onclose = function _onclose() {
        // TODO: reconnect logic
        this._emit('disconnect');
    };

    WSShim.prototype._onmessage = function _onmessage(message) {
        var args;

        try {
            args = JSON.parse(message.data);
        } catch (error) {
            console.error('Unparseable message from server: ' + message);
            console.error(error.stack);
            return;
        }

        this._emit.apply(this, args);
    };

    WSShim.prototype._onerror = function _onerror() {
        console.error('Dunno how to handle onerror');
    };

    window.WSShim = WSShim;
})();
