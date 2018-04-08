export function callOnce(fn) {
    let called = false;

    return (...args) => {
        called || fn(...args), called = true;
    };
}
