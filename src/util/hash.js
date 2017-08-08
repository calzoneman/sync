import { createHash } from 'crypto';

export function hash(algo, input, digest) {
    const h = createHash(algo);
    h.update(input);
    return h.digest(digest);
}
