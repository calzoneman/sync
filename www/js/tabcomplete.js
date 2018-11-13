CyTube.tabCompleteMethods = {};

// Bash-style completion
// Only completes as far as it is possible to maintain uniqueness of the completion.
CyTube.tabCompleteMethods['Longest unique match'] = function (input, position, options, context) {
    var lower = input.toLowerCase();
    // First, backtrack to the nearest whitespace to find the
    // incomplete string that should be completed.
    var start;
    var incomplete = '';
    for (start = position - 1; start >= 0; start--) {
        if (/\s/.test(lower[start])) {
            break;
        }

        incomplete = lower[start] + incomplete;
    }
    start++;

    // Nothing to complete
    if (!incomplete.length) {
        return {
            text: input,
            newPosition: position
        };
    }

    var matches = options.filter(function (option) {
        return option.toLowerCase().indexOf(incomplete) === 0;
    });

    var completed;
    var isFullMatch = false;
    if (matches.length === 0) {
        return {
            text: input,
            newPosition: position
        };
    } else if (matches.length === 1) {
        // Unique match
        completed = matches[0];
        isFullMatch = true;
    } else {
        // There is not a unique match, find the longest possible prefix
        // that results in a unique completion
        // Do this by comparing each match to the next and trimming to the
        // first index where they differ.
        var currentPrefix = null;
        for (var i = 0; i < matches.length - 1; i++) {
            var first = matches[i];
            var second = matches[i+1];
            var nextPrefix = '';
            for (var j = 0; (currentPrefix === null || j < currentPrefix.length)
                    && j < first.length
                    && j < second.length; j++) {
                if (first[j].toLowerCase() === second[j].toLowerCase()) {
                    nextPrefix += first[j];
                } else {
                    break;
                }
            }

            if (currentPrefix === null || nextPrefix.length < currentPrefix.length) {
                currentPrefix = nextPrefix;
            }
        }

        completed = currentPrefix;
    }

    var space = isFullMatch ? ' ' : '';
    return {
        text: input.substring(0, start) + completed + space + input.substring(position),
        newPosition: start + completed.length + space.length
    };
};

// Zsh-style completion.
// Always complete a full option, and cycle through available options on successive tabs
CyTube.tabCompleteMethods['Cycle options'] = function (input, position, options, context) {
    if (typeof context.start !== 'undefined') {
        var currentCompletion = input.substring(context.start, position - 1);
        if (currentCompletion === context.matches[context.tabIndex]) {
            context.tabIndex = (context.tabIndex + 1) % context.matches.length;
            var completed = context.matches[context.tabIndex];
            return {
                text: input.substring(0, context.start) + completed + ' ' + input.substring(position),
                newPosition: context.start + completed.length + 1
            };
        } else {
            delete context.matches;
            delete context.tabIndex;
            delete context.start;
        }
    }

    var lower = input.toLowerCase();
    // First, backtrack to the nearest whitespace to find the
    // incomplete string that should be completed.
    var start;
    var incomplete = '';
    for (start = position - 1; start >= 0; start--) {
        if (/\s/.test(lower[start])) {
            break;
        }

        incomplete = lower[start] + incomplete;
    }
    start++;

    // Nothing to complete
    if (!incomplete.length) {
        return {
            text: input,
            newPosition: position
        };
    }

    var matches = options.filter(function (option) {
        return option.toLowerCase().indexOf(incomplete) === 0;
    }).sort(function (a, b) {
        var aLower = a.toLowerCase();
        var bLower = b.toLowerCase();

        if (aLower > bLower) {
            return 1;
        } else if (aLower < bLower) {
            return -1;
        } else {
            return 0;
        }
    });

    if (matches.length === 0) {
        return {
            text: input,
            newPosition: position
        };
    }

    context.start = start;
    context.matches = matches;
    context.tabIndex = 0;
    return {
        text: input.substring(0, start) + matches[0] + ' ' + input.substring(position),
        newPosition: start + matches[0].length + 1
    };
};
