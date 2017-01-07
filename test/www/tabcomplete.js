const assert = require('assert');
global.CyTube = {};
require('../../www/js/tabcomplete');

const testcases = [
    {
        input: 'and his name is j',
        position: 17,
        options: ['johncena', 'johnstamos', 'johto'],
        output: {
            text: 'and his name is joh',
            newPosition: 19
        },
        description: 'completes the longest unique substring'
    },
    {
        input: 'and his name is johnc',
        position: 21,
        options: ['johncena', 'johnstamos', 'johto'],
        output: {
            text: 'and his name is johncena ',
            newPosition: 25
        },
        description: 'completes a unique match'
    },
    {
        input: 'and his name is johnc',
        position: 21,
        options: ['asdf'],
        output: {
            text: 'and his name is johnc',
            newPosition: 21
        },
        description: 'does not complete when there is no match'
    },
    {
        input: 'and his name is johnc',
        position: 21,
        options: [],
        output: {
            text: 'and his name is johnc',
            newPosition: 21
        },
        description: 'does not complete when there are no options'
    },
    {
        input: ' ',
        position: 1,
        options: ['abc', 'def', 'ghi'],
        output: {
            text: ' ',
            newPosition: 1
        },
        description: 'does not complete when the input is empty'
    }
];

describe('CyTube.tabCompletionMethods', () => {
    describe('#Longest unique prefix', () => {
        testcases.forEach(test => {
            it(test.description, () => {
                assert.deepEqual(test.output,
                        CyTube.tabCompleteMethods['Longest unique prefix'](
                            test.input,
                            test.position,
                            test.options,
                            {}
                        )
                );
            });
        });
    });
});
