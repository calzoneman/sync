class TokenBucket {
    constructor(capacity, refillRate) {
        if (typeof refillRate !== 'function') {
            const _refillRate = refillRate;
            refillRate = () => _refillRate;
        }
        if (typeof capacity !== 'function') {
            const _capacity = capacity;
            capacity = () => _capacity;
        }

        this.capacity = capacity;
        this.refillRate = refillRate;
        this.count = capacity();
        this.lastRefill = Date.now();
    }

    throttle() {
        const now = Date.now();
        const delta = Math.floor(
            (now - this.lastRefill) / 1000 * this.refillRate()
        );
        if (delta > 0) {
            this.count = Math.min(this.capacity(), this.count + delta);
            this.lastRefill = now;
        }

        if (this.count === 0) {
            return true;
        } else {
            this.count--;
            return false;
        }
    }
}

export { TokenBucket };
