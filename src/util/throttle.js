import lo from 'lodash';

export function throttle(fn, timeout) {
    return lo.debounce(fn, timeout, {
        leading: true,
        trailing: true,
        maxWait: timeout
    });
}
