const assert = require('assert');
global.CyTube = {};
require('../../www/js/tabcomplete');


describe('CyTube.tabCompletionMethods', () => {
    describe('"Longest unique match"', () => {
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
                input: 'johnc',
                position: 5,
                options: ['johncena', 'johnstamos', 'johto'],
                output: {
                    text: 'johncena ',
                    newPosition: 9
                },
                description: 'completes a unique match at the beginning of the string'
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
                input: 'and his name is ',
                position: 16,
                options: ['asdf'],
                output: {
                    text: 'and his name is ',
                    newPosition: 16
                },
                description: 'does not complete when there is an empty prefix'
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
                input: '',
                position: 0,
                options: ['abc', 'def', 'ghi'],
                output: {
                    text: '',
                    newPosition: 0
                },
                description: 'does not complete when the input is empty'
            }
        ];
        testcases.forEach(test => {
            it(test.description, () => {
                assert.deepEqual(
                        CyTube.tabCompleteMethods['Longest unique match'](
                            test.input,
                            test.position,
                            test.options,
                            {}
                        ),
                        test.output
                );
            });
        });
    });

    describe('"Cycle options"', () => {
        const testcases = [
            {
                input: 'hey c',
                position: 5,
                options: ['COBOL', 'Carlos', 'carl', 'john', 'joseph', ''],
                outputs: [
                    {
                        text: 'hey carl ',
                        newPosition: 9
                    },
                    {
                        text: 'hey Carlos ',
                        newPosition: 11
                    },
                    {
                        text: 'hey COBOL ',
                        newPosition: 10
                    },
                    {
                        text: 'hey carl ',
                        newPosition: 9
                    }
                ],
                description: 'cycles through options correctly'
            },
            {
                input: 'c',
                position: 1,
                options: ['COBOL', 'Carlos', 'carl', 'john', 'joseph', ''],
                outputs: [
                    {
                        text: 'carl ',
                        newPosition: 5
                    },
                    {
                        text: 'Carlos ',
                        newPosition: 7
                    },
                    {
                        text: 'COBOL ',
                        newPosition: 6
                    },
                    {
                        text: 'carl ',
                        newPosition: 5
                    }
                ],
                description: 'cycles through options correctly at the beginning of the string'
            },
            {
                input: 'hey ',
                position: 5,
                options: ['COBOL', 'Carlos', 'carl', 'john'],
                outputs: [
                    {
                        text: 'hey ',
                        newPosition: 5
                    }
                ],
                description: 'does not complete when there is an empty prefix'
            },
            {
                input: 'hey c',
                position: 6,
                options: [],
                outputs: [
                    {
                        text: 'hey c',
                        newPosition: 6
                    }
                ],
                description: 'does not complete when there are no options'
            },
            {
                input: '',
                position: 0,
                options: ['COBOL', 'Carlos', 'carl', 'john'],
                outputs: [
                    {
                        text: '',
                        newPosition: 0
                    }
                ],
                description: 'does not complete when the input is empty'
            }
        ];

        const complete = CyTube.tabCompleteMethods['Cycle options'];
        testcases.forEach(test => {
            it(test.description, () => {
                var context = {};
                var currentText = test.input;
                var currentPosition = test.position;
                for (var i = 0; i < test.outputs.length; i++) {
                    var output = complete(currentText, currentPosition, test.options, context);
                    assert.deepEqual(output, test.outputs[i]);
                    currentText = output.text;
                    currentPosition = output.newPosition;
                }
            });
        });

        it('updates the context when the input changes to reduce the # of matches', () => {
            var test = testcases[0];
            var context = {};
            var currentText = test.input;
            var currentPosition = test.position;

            var output = complete(currentText, currentPosition, test.options, context);
            assert.deepEqual(context, {
                start: 4,
                matches: ['carl', 'Carlos', 'COBOL'],
                tabIndex: 0
            });
            currentText = output.text;
            currentPosition = output.newPosition;

            output = complete(currentText, currentPosition, test.options, context);
            assert.deepEqual(context, {
                start: 4,
                matches: ['carl', 'Carlos', 'COBOL'],
                tabIndex: 1
            });
            currentText = output.text.replace(context.matches[1], 'jo').trim();
            currentPosition = 6;

            output = complete(currentText, currentPosition, test.options, context);
            assert.deepEqual(context, {
                start: 4,
                matches: ['john', 'joseph'],
                tabIndex: 0
            });
            assert.deepEqual(output, {
                text: 'hey john ',
                newPosition: 9
            });
        });

        it('clears the context when the input changes to a non-match', () => {
            var test = testcases[0];
            var context = {};
            var currentText = test.input;
            var currentPosition = test.position;

            var output = complete(currentText, currentPosition, test.options, context);
            assert.deepEqual(context, {
                start: 4,
                matches: ['carl', 'Carlos', 'COBOL'],
                tabIndex: 0
            });
            currentText = output.text;
            currentPosition = output.newPosition;

            output = complete(currentText, currentPosition, test.options, context);
            assert.deepEqual(context, {
                start: 4,
                matches: ['carl', 'Carlos', 'COBOL'],
                tabIndex: 1
            });
            currentText = output.text.replace(context.matches[1], 'asdf').trim();
            currentPosition = 8;

            output = complete(currentText, currentPosition, test.options, context);
            assert.deepEqual(context, {});
            assert.deepEqual(output, {
                text: 'hey asdf',
                newPosition: 8
            });
        });
    });
});
