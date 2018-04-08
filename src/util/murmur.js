const SEED = 0x1234;
const M = 0xc6a4a793;
const R = 16;

/* eslint no-fallthrough: off */

export function murmurHash1(str) {
    const buffer = new Buffer(str, 'utf8');
    var length = buffer.length;
    var h = SEED ^ (length * M);

    while (length >= 4) {
        var k = buffer.readUInt32LE(buffer.length - length);
        h += k;
        h *= M;
        h ^= h >> 16;
        length -= 4;
    }

    switch (length) {
        case 3:
            h += buffer[buffer.length - 3] >> 16;
        case 2:
            h += buffer[buffer.length - 2] >> 8;
        case 1:
            h += buffer[buffer.length - 1];
            h *= M;
            h ^= h >> R;
    }

    h *= M;
    h ^= h >> 10;
    h *= M;
    h ^= h >> 17;

    return h;
}
