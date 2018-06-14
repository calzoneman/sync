class Multimap {
    constructor() {
        this._items = new Map();
    }

    get(key) {
        if (this._items.has(key)) {
            return this._items.get(key);
        }

        return new Set();
    }

    has(key, value) {
        if (!this._items.has(key)) {
            return false;
        }

        return this._items.get(key).has(value);
    }

    set(key, value) {
        if (!this._items.has(key)) {
            this._items.set(key, new Set());
        }

        return this._items.get(key).add(value);
    }

    delete(key, value) {
        if (!this._items.has(key)) {
            return false;
        }

        const res = this._items.get(key).delete(value);

        if (this._items.get(key).size == 0) {
            this._items.delete(key);
        }

        return res;
    }
}

export { Multimap };
