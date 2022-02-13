(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('video.js')) : typeof define === 'function' && define.amd ? define(['video.js'], factory) : (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.videojs));
}(this, function (videojs) {
    'use strict';
    function _interopDefaultLegacy(e) {
        return e && typeof e === 'object' && 'default' in e ? e : { 'default': e };
    }
    var videojs__default = /*#__PURE__*/
    _interopDefaultLegacy(videojs);
    /**
   * Checks if `value` is the
   * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
   * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(_.noop);
   * // => true
   *
   * _.isObject(null);
   * // => false
   */
    function isObject(value) {
        var type = typeof value;
        return value != null && (type == 'object' || type == 'function');
    }
    /** Detect free variable `global` from Node.js. */
    var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;
    /** Detect free variable `self`. */
    var freeSelf = typeof self == 'object' && self && self.Object === Object && self;
    /** Used as a reference to the global object. */
    var root = freeGlobal || freeSelf || Function('return this')();
    /**
   * Gets the timestamp of the number of milliseconds that have elapsed since
   * the Unix epoch (1 January 1970 00:00:00 UTC).
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Date
   * @returns {number} Returns the timestamp.
   * @example
   *
   * _.defer(function(stamp) {
   *   console.log(_.now() - stamp);
   * }, _.now());
   * // => Logs the number of milliseconds it took for the deferred invocation.
   */
    var now = function () {
        return root.Date.now();
    };
    /** Used to match a single whitespace character. */
    var reWhitespace = /\s/;
    /**
   * Used by `_.trim` and `_.trimEnd` to get the index of the last non-whitespace
   * character of `string`.
   *
   * @private
   * @param {string} string The string to inspect.
   * @returns {number} Returns the index of the last non-whitespace character.
   */
    function trimmedEndIndex(string) {
        var index = string.length;
        while (index-- && reWhitespace.test(string.charAt(index))) {
        }
        return index;
    }
    /** Used to match leading whitespace. */
    var reTrimStart = /^\s+/;
    /**
   * The base implementation of `_.trim`.
   *
   * @private
   * @param {string} string The string to trim.
   * @returns {string} Returns the trimmed string.
   */
    function baseTrim(string) {
        return string ? string.slice(0, trimmedEndIndex(string) + 1).replace(reTrimStart, '') : string;
    }
    /** Built-in value references. */
    var Symbol = root.Symbol;
    /** Used for built-in method references. */
    var objectProto$1 = Object.prototype;
    /** Used to check objects for own properties. */
    var hasOwnProperty = objectProto$1.hasOwnProperty;
    /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
    var nativeObjectToString$1 = objectProto$1.toString;
    /** Built-in value references. */
    var symToStringTag$1 = Symbol ? Symbol.toStringTag : undefined;
    /**
   * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the raw `toStringTag`.
   */
    function getRawTag(value) {
        var isOwn = hasOwnProperty.call(value, symToStringTag$1), tag = value[symToStringTag$1];
        try {
            value[symToStringTag$1] = undefined;
            var unmasked = true;
        } catch (e) {
        }
        var result = nativeObjectToString$1.call(value);
        if (unmasked) {
            if (isOwn) {
                value[symToStringTag$1] = tag;
            } else {
                delete value[symToStringTag$1];
            }
        }
        return result;
    }
    /** Used for built-in method references. */
    var objectProto = Object.prototype;
    /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
    var nativeObjectToString = objectProto.toString;
    /**
   * Converts `value` to a string using `Object.prototype.toString`.
   *
   * @private
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   */
    function objectToString(value) {
        return nativeObjectToString.call(value);
    }
    /** `Object#toString` result references. */
    var nullTag = '[object Null]', undefinedTag = '[object Undefined]';
    /** Built-in value references. */
    var symToStringTag = Symbol ? Symbol.toStringTag : undefined;
    /**
   * The base implementation of `getTag` without fallbacks for buggy environments.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
    function baseGetTag(value) {
        if (value == null) {
            return value === undefined ? undefinedTag : nullTag;
        }
        return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
    }
    /**
   * Checks if `value` is object-like. A value is object-like if it's not `null`
   * and has a `typeof` result of "object".
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
   * @example
   *
   * _.isObjectLike({});
   * // => true
   *
   * _.isObjectLike([1, 2, 3]);
   * // => true
   *
   * _.isObjectLike(_.noop);
   * // => false
   *
   * _.isObjectLike(null);
   * // => false
   */
    function isObjectLike(value) {
        return value != null && typeof value == 'object';
    }
    /** `Object#toString` result references. */
    var symbolTag = '[object Symbol]';
    /**
   * Checks if `value` is classified as a `Symbol` primitive or object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
   * @example
   *
   * _.isSymbol(Symbol.iterator);
   * // => true
   *
   * _.isSymbol('abc');
   * // => false
   */
    function isSymbol(value) {
        return typeof value == 'symbol' || isObjectLike(value) && baseGetTag(value) == symbolTag;
    }
    /** Used as references for various `Number` constants. */
    var NAN = 0 / 0;
    /** Used to detect bad signed hexadecimal string values. */
    var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
    /** Used to detect binary string values. */
    var reIsBinary = /^0b[01]+$/i;
    /** Used to detect octal string values. */
    var reIsOctal = /^0o[0-7]+$/i;
    /** Built-in method references without a dependency on `root`. */
    var freeParseInt = parseInt;
    /**
   * Converts `value` to a number.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to process.
   * @returns {number} Returns the number.
   * @example
   *
   * _.toNumber(3.2);
   * // => 3.2
   *
   * _.toNumber(Number.MIN_VALUE);
   * // => 5e-324
   *
   * _.toNumber(Infinity);
   * // => Infinity
   *
   * _.toNumber('3.2');
   * // => 3.2
   */
    function toNumber(value) {
        if (typeof value == 'number') {
            return value;
        }
        if (isSymbol(value)) {
            return NAN;
        }
        if (isObject(value)) {
            var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
            value = isObject(other) ? other + '' : other;
        }
        if (typeof value != 'string') {
            return value === 0 ? value : +value;
        }
        value = baseTrim(value);
        var isBinary = reIsBinary.test(value);
        return isBinary || reIsOctal.test(value) ? freeParseInt(value.slice(2), isBinary ? 2 : 8) : reIsBadHex.test(value) ? NAN : +value;
    }
    /** Error message constants. */
    var FUNC_ERROR_TEXT$1 = 'Expected a function';
    /* Built-in method references for those with the same name as other `lodash` methods. */
    var nativeMax = Math.max, nativeMin = Math.min;
    /**
   * Creates a debounced function that delays invoking `func` until after `wait`
   * milliseconds have elapsed since the last time the debounced function was
   * invoked. The debounced function comes with a `cancel` method to cancel
   * delayed `func` invocations and a `flush` method to immediately invoke them.
   * Provide `options` to indicate whether `func` should be invoked on the
   * leading and/or trailing edge of the `wait` timeout. The `func` is invoked
   * with the last arguments provided to the debounced function. Subsequent
   * calls to the debounced function return the result of the last `func`
   * invocation.
   *
   * **Note:** If `leading` and `trailing` options are `true`, `func` is
   * invoked on the trailing edge of the timeout only if the debounced function
   * is invoked more than once during the `wait` timeout.
   *
   * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
   * until to the next tick, similar to `setTimeout` with a timeout of `0`.
   *
   * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
   * for details over the differences between `_.debounce` and `_.throttle`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Function
   * @param {Function} func The function to debounce.
   * @param {number} [wait=0] The number of milliseconds to delay.
   * @param {Object} [options={}] The options object.
   * @param {boolean} [options.leading=false]
   *  Specify invoking on the leading edge of the timeout.
   * @param {number} [options.maxWait]
   *  The maximum time `func` is allowed to be delayed before it's invoked.
   * @param {boolean} [options.trailing=true]
   *  Specify invoking on the trailing edge of the timeout.
   * @returns {Function} Returns the new debounced function.
   * @example
   *
   * // Avoid costly calculations while the window size is in flux.
   * jQuery(window).on('resize', _.debounce(calculateLayout, 150));
   *
   * // Invoke `sendMail` when clicked, debouncing subsequent calls.
   * jQuery(element).on('click', _.debounce(sendMail, 300, {
   *   'leading': true,
   *   'trailing': false
   * }));
   *
   * // Ensure `batchLog` is invoked once after 1 second of debounced calls.
   * var debounced = _.debounce(batchLog, 250, { 'maxWait': 1000 });
   * var source = new EventSource('/stream');
   * jQuery(source).on('message', debounced);
   *
   * // Cancel the trailing debounced invocation.
   * jQuery(window).on('popstate', debounced.cancel);
   */
    function debounce(func, wait, options) {
        var lastArgs, lastThis, maxWait, result, timerId, lastCallTime, lastInvokeTime = 0, leading = false, maxing = false, trailing = true;
        if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT$1);
        }
        wait = toNumber(wait) || 0;
        if (isObject(options)) {
            leading = !!options.leading;
            maxing = 'maxWait' in options;
            maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
            trailing = 'trailing' in options ? !!options.trailing : trailing;
        }
        function invokeFunc(time) {
            var args = lastArgs, thisArg = lastThis;
            lastArgs = lastThis = undefined;
            lastInvokeTime = time;
            result = func.apply(thisArg, args);
            return result;
        }
        function leadingEdge(time) {
            // Reset any `maxWait` timer.
            lastInvokeTime = time;
            // Start the timer for the trailing edge.
            timerId = setTimeout(timerExpired, wait);
            // Invoke the leading edge.
            return leading ? invokeFunc(time) : result;
        }
        function remainingWait(time) {
            var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime, timeWaiting = wait - timeSinceLastCall;
            return maxing ? nativeMin(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting;
        }
        function shouldInvoke(time) {
            var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime;
            // Either this is the first call, activity has stopped and we're at the
            // trailing edge, the system time has gone backwards and we're treating
            // it as the trailing edge, or we've hit the `maxWait` limit.
            return lastCallTime === undefined || timeSinceLastCall >= wait || timeSinceLastCall < 0 || maxing && timeSinceLastInvoke >= maxWait;
        }
        function timerExpired() {
            var time = now();
            if (shouldInvoke(time)) {
                return trailingEdge(time);
            }
            // Restart the timer.
            timerId = setTimeout(timerExpired, remainingWait(time));
        }
        function trailingEdge(time) {
            timerId = undefined;
            // Only invoke if we have `lastArgs` which means `func` has been
            // debounced at least once.
            if (trailing && lastArgs) {
                return invokeFunc(time);
            }
            lastArgs = lastThis = undefined;
            return result;
        }
        function cancel() {
            if (timerId !== undefined) {
                clearTimeout(timerId);
            }
            lastInvokeTime = 0;
            lastArgs = lastCallTime = lastThis = timerId = undefined;
        }
        function flush() {
            return timerId === undefined ? result : trailingEdge(now());
        }
        function debounced() {
            var time = now(), isInvoking = shouldInvoke(time);
            lastArgs = arguments;
            lastThis = this;
            lastCallTime = time;
            if (isInvoking) {
                if (timerId === undefined) {
                    return leadingEdge(lastCallTime);
                }
                if (maxing) {
                    // Handle invocations in a tight loop.
                    clearTimeout(timerId);
                    timerId = setTimeout(timerExpired, wait);
                    return invokeFunc(lastCallTime);
                }
            }
            if (timerId === undefined) {
                timerId = setTimeout(timerExpired, wait);
            }
            return result;
        }
        debounced.cancel = cancel;
        debounced.flush = flush;
        return debounced;
    }
    /** Error message constants. */
    var FUNC_ERROR_TEXT = 'Expected a function';
    /**
    * Creates a throttled function that only invokes `func` at most once per
    * every `wait` milliseconds. The throttled function comes with a `cancel`
    * method to cancel delayed `func` invocations and a `flush` method to
    * immediately invoke them. Provide `options` to indicate whether `func`
    * should be invoked on the leading and/or trailing edge of the `wait`
    * timeout. The `func` is invoked with the last arguments provided to the
    * throttled function. Subsequent calls to the throttled function return the
    * result of the last `func` invocation.
    *
    * **Note:** If `leading` and `trailing` options are `true`, `func` is
    * invoked on the trailing edge of the timeout only if the throttled function
    * is invoked more than once during the `wait` timeout.
    *
    * If `wait` is `0` and `leading` is `false`, `func` invocation is deferred
    * until to the next tick, similar to `setTimeout` with a timeout of `0`.
    *
    * See [David Corbacho's article](https://css-tricks.com/debouncing-throttling-explained-examples/)
    * for details over the differences between `_.throttle` and `_.debounce`.
    *
    * @static
    * @memberOf _
    * @since 0.1.0
    * @category Function
    * @param {Function} func The function to throttle.
    * @param {number} [wait=0] The number of milliseconds to throttle invocations to.
    * @param {Object} [options={}] The options object.
    * @param {boolean} [options.leading=true]
    *  Specify invoking on the leading edge of the timeout.
    * @param {boolean} [options.trailing=true]
    *  Specify invoking on the trailing edge of the timeout.
    * @returns {Function} Returns the new throttled function.
    * @example
    *
    * // Avoid excessively updating the position while scrolling.
    * jQuery(window).on('scroll', _.throttle(updatePosition, 100));
    *
    * // Invoke `renewToken` when the click event is fired, but not more than once every 5 minutes.
    * var throttled = _.throttle(renewToken, 300000, { 'trailing': false });
    * jQuery(element).on('click', throttled);
    *
    * // Cancel the trailing throttled invocation.
    * jQuery(window).on('popstate', throttled.cancel);
    */
    function throttle(func, wait, options) {
        var leading = true, trailing = true;
        if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
        }
        if (isObject(options)) {
            leading = 'leading' in options ? !!options.leading : leading;
            trailing = 'trailing' in options ? !!options.trailing : trailing;
        }
        return debounce(func, wait, {
            'leading': leading,
            'maxWait': wait,
            'trailing': trailing
        });
    }
    const syncTime = (player, audio) => {
        const time = player.currentTime();
        audio.currentTime = time;
    };
    function audioSwitchPlugin(options) {
        const {audioElement, audioTracks, debugInterval, syncInterval, volume, handleDisposal} = options;
        const player = this;
        const checkAudioElement = () => {
            const videoElement = player.el_;
            let newAudio;
            if (typeof audioElement !== 'undefined' && audioElement instanceof HTMLElement) {
                newAudio = audioElement;
                this.audio = newAudio;
            } else {
                newAudio = document.createElement('audio');
                this.audio = newAudio;
                this.isOurAudio = true;
                this.audio.className = 'audioSwitch-audio';
                this.audioParent = document.createElement('div');
                this.audioParent.className = 'audioSwitch-parent';
                this.audioParent.appendChild(this.audio);
                if (videoElement.nextSibling) {
                    videoElement.parentNode.insertBefore(this.audioParent, videoElement.nextSibling);
                } else {
                    videoElement.parentNode.appendChild(this.audioParent);
                }
            }
            return newAudio;
        };
        const audio = checkAudioElement();
        audio.currentTime = 0;
        audio.volume = volume;
        const onAudioTracksChange = (player, audio, event) => {
            var audioTrackList = player.audioTracks();
            let enabledTrack;
            for (let i = 0; i < audioTrackList.length; i++) {
                let track = audioTrackList[i];
                if (track.enabled) {
                    enabledTrack = track;
                    break;
                }
            }
            enabledTrack = enabledTrack || audioTrackList[0];
            if (enabledTrack) {
                const isPlaying = !player.paused();
                if (isPlaying)
                    player.pause();
                audio.setAttribute('src', audioTracks.find(audioTrack => audioTrack.label === enabledTrack.label)?.url);
                syncTime(player, audio);
                if (isPlaying)
                    player.play();
            }
        };
        var audioTrackList = player.audioTracks();
        audioTrackList.addEventListener('change', onAudioTracksChange.bind(null, player, audio));
        if (audioTracks.length > 0) {
            audioTracks[0].kind = 'main';
            audioTracks[0].enabled = true;
            audioTracks.forEach(track => audioTrackList.addTrack(new videojs.AudioTrack(track)));
            audio.setAttribute('src', audioTracks[0].url);
        }
        player.on('dispose', () => {
            this.audio.pause();
            if(this.isOurAudio || handleDisposal){
                this.audio.remove();
                this.audioParent.remove();
            }
        });
        player.on('play', () => {
            syncTime(player, audio);
            if (audio.paused)
                audio.play();
        });
        player.on('pause', () => {
            syncTime(player, audio);
            if (!audio.paused)
                audio.pause();
        });
        player.on('seeked', () => {
            if (!player.paused())
                player.pause();
            player.one('canplay', () => {
                const sync = () => {
                    syncTime(player, audio);
                    audio.removeEventListener('canplay', sync);
                    if (player.paused())
                        player.play();
                };
                audio.addEventListener('canplay', sync);
            });
        });
        player.on('volumechange', () => {
            if (player.muted()) {
                audio.muted = true;
            } else {
                audio.muted = false;
                audio.volume = player.volume();
            }
        });
        if (syncInterval) {
            const syncOnInterval = throttle(() => {
                syncTime(player, audio);
            }, syncInterval);
            player.on('timeupdate', syncOnInterval);
        }
        if (debugInterval) {
            const debugOnInterval = throttle(() => {
                const _audioBefore = audio.currentTime;
                const _videoBefore = player.currentTime();
                console.log('debug', {
                    audio: _audioBefore,
                    video: _videoBefore,
                    diff: _videoBefore - _audioBefore
                });
            }, debugInterval);
            player.on('timeupdate', debugOnInterval);
        }
    }
    videojs__default['default'].registerPlugin('audioSwitch', audioSwitchPlugin);
}));