var $util = require('../lib/utilities.js');

function testBurst() {
    var lim = $util.newRateLimiter();
    var params = {
        burst: 10,
        sustained: 2
    };

    for (var i = 0; i < 10; i++) {
        if (lim.throttle(params)) {
            console.log("[FAIL] Burst: Unexpected throttle");
            return;
        }
    }

    if (!lim.throttle(params)) {
        console.log("[FAIL] Burst: didn't throttle after exceeding burst amount");
        return;
    }

    console.log("[PASS] Burst");
}

function testBurstAndWait() {
    var lim = $util.newRateLimiter();
    var params = {
        burst: 10,
        sustained: 2
    };

    for (var i = 0; i < 9; i++) {
        if (lim.throttle(params)) {
            console.log("[FAIL] Burst & Wait: Unexpected throttle");
            return;
        }
    }

    // Wait a while and try some more
    setTimeout(function () {
        for (var i = 9; i < 17; i++) {
            if (lim.throttle(params)) {
                console.log("[FAIL] Burst & Wait: Unexpected throttle");
                return;
            }
        }
        console.log("[PASS] Burst & Wait");
    }, 6000);
}

testBurst();
testBurstAndWait();
