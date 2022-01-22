/* ESLint Config */
module.exports = {
    env: {
        'es2017': true,
        // others envs defined by cascading .eslintrc files
    },
    extends: 'eslint:recommended',
    parser: '@babel/eslint-parser',
    parserOptions: {
        'sourceType': 'module',
    },
    rules: {
        'brace-style': ['error','1tbs',{ 'allowSingleLine': true }],
        'indent': [
            'off', // temporary... a lot of stuff needs to be reformatted | 2020-08-21: I guess it's not so temporary...
            4,
            { 'SwitchCase': 1 }
        ],
        'linebreak-style': ['error','unix'],
        'no-control-regex': ['off'],
        'no-prototype-builtins': ['off'], // should consider cleaning up the code and turning this back on at some point
        'no-trailing-spaces': ['error'],
        'no-unused-vars': [
            'error', {
                'argsIgnorePattern': '^_',
                'varsIgnorePattern': '^_|^Promise$'
            }
        ],
        'semi': ['error','always'],
        'quotes': ['off'] // Old code uses double quotes, new code uses single / template
    },
    ignorePatterns: [
        // These are not ours
        'www/js/dash.all.min.js',
        'www/js/jquery-1.12.4.min.js',
        'www/js/jquery-ui.js',
        'www/js/peertube.js',
        'www/js/playerjs-0.0.12.js',
        'www/js/sc.js',
        'www/js/video.js',
        'www/js/videojs-contrib-hls.min.js',
        'www/js/videojs-dash.js',
        'www/js/videojs-resolution-switcher.js',
    ],
}
