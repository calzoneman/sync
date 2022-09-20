class SimpleCache {
    constructor({ maxElem, maxAge }) {
        this.maxElem = maxElem;
        this.maxAge = maxAge;
        this.cache = new Map();

        setInterval(() => {
            this.cleanup();
        }, maxAge).unref();
    }

    put(key, value) {
        this.cache.set(key, { value: value, at: Date.now() });

        if (this.cache.size > this.maxElem) {
            this.cache.delete(this.cache.keys().next().value);
        }
    }

    get(key) {
        let val = this.cache.get(key);

        if (val != null && Date.now() < val.at + this.maxAge) {
            return val.value;
        } else {
            return null;
        }
    }

    delete(key) {
        this.cache.delete(key);
    }

    cleanup() {
        let now = Date.now();

        for (let [key, value] of this.cache) {
            if (value.at < now - this.maxAge) {
                this.cache.delete(key);
            }
        }
    }
}

export { SimpleCache };
