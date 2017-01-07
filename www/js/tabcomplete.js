CyTube.tabCompleteMethods = {};

// Bash-style completion
// Only completes as far as it is possible to maintain uniqueness of the completion.
CyTube.tabCompleteMethods['Longest unique prefix'] = function (input, position, options, context) {
    var lower = input.toLowerCase();
    // First, backtrack to the nearest whitespace to find the
    // incomplete string that should be completed.
    var start;
    var incomplete = '';
    for (start = position - 1; start >= 0; start--) {
        if (/\s/.test(lower[start])) {
            start++;
            break;
        }

        incomplete = lower[start] + incomplete;
    }

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

};
