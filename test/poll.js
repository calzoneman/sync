const assert = require('assert');
const { Poll } = require('../lib/poll');

describe('Poll', () => {
    describe('constructor', () => {
        it('constructs a poll', () => {
            let poll = Poll.create(
                'pollster',
                'Which is better?',
                [
                    'Coke',
                    'Pepsi'
                ]
                /* default opts */
            );

            assert.strictEqual(poll.createdBy, 'pollster');
            assert.strictEqual(poll.title, 'Which is better?');
            assert.deepStrictEqual(poll.choices, ['Coke', 'Pepsi']);
            assert.strictEqual(poll.hideVotes, false);
        });

        it('constructs a poll with hidden vote setting', () => {
            let poll = Poll.create(
                'pollster',
                'Which is better?',
                [
                    'Coke',
                    'Pepsi'
                ],
                { hideVotes: true }
            );

            assert.strictEqual(poll.hideVotes, true);
        });

        it('sanitizes title and choices', () => {
            let poll = Poll.create(
                'pollster',
                'Which is better? <script></script>',
                [
                    '<strong>Coke</strong>',
                    'Pepsi'
                ]
                /* default opts */
            );

            assert.strictEqual(poll.title, 'Which is better? &lt;script&gt;&lt;/script&gt;');
            assert.deepStrictEqual(poll.choices, ['&lt;strong&gt;Coke&lt;/strong&gt;', 'Pepsi']);
        });

        it('replaces URLs in title and choices', () => {
            let poll = Poll.create(
                'pollster',
                'Which is better? https://example.com',
                [
                    'Coke https://example.com',
                    'Pepsi'
                ]
                /* default opts */
            );

            assert.strictEqual(
                poll.title,
                'Which is better? <a href="https://example.com" target="_blank" rel="noopener noreferer">https://example.com</a>'
            );
            assert.deepStrictEqual(
                poll.choices,
                [
                    'Coke <a href="https://example.com" target="_blank" rel="noopener noreferer">https://example.com</a>',
                    'Pepsi'
                ]
            );
        });
    });

    describe('#countVote', () => {
        let poll;
        beforeEach(() => {
            poll = Poll.create(
                'pollster',
                'Which is better?',
                [
                    'Coke',
                    'Pepsi'
                ]
                /* default opts */
            );
        });

        it('counts a new vote', () => {
            assert.strictEqual(poll.countVote('userA', 0), true);
            assert.strictEqual(poll.countVote('userB', 1), true);
            assert.strictEqual(poll.countVote('userC', 0), true);

            let { counts } = poll.toUpdateFrame();
            assert.deepStrictEqual(counts, [2, 1]);
        });

        it('does not count a revote for the same choice', () => {
            assert.strictEqual(poll.countVote('userA', 0), true);
            assert.strictEqual(poll.countVote('userA', 0), false);

            let { counts } = poll.toUpdateFrame();
            assert.deepStrictEqual(counts, [1, 0]);
        });

        it('changes a vote to a different choice', () => {
            assert.strictEqual(poll.countVote('userA', 0), true);
            assert.strictEqual(poll.countVote('userA', 1), true);

            let { counts } = poll.toUpdateFrame();
            assert.deepStrictEqual(counts, [0, 1]);
        });

        it('ignores out of range votes', () => {
            assert.strictEqual(poll.countVote('userA', 1000), false);
            assert.strictEqual(poll.countVote('userA', -10), false);

            let { counts } = poll.toUpdateFrame();
            assert.deepStrictEqual(counts, [0, 0]);
        });
    });

    describe('#uncountVote', () => {
        let poll;
        beforeEach(() => {
            poll = Poll.create(
                'pollster',
                'Which is better?',
                [
                    'Coke',
                    'Pepsi'
                ]
                /* default opts */
            );
        });

        it('uncounts an existing vote', () => {
            assert.strictEqual(poll.countVote('userA', 0), true);
            assert.strictEqual(poll.uncountVote('userA', 0), true);

            let { counts } = poll.toUpdateFrame();
            assert.deepStrictEqual(counts, [0, 0]);
        });

        it('does not uncount if there is no existing vote', () => {
            assert.strictEqual(poll.uncountVote('userA', 0), false);

            let { counts } = poll.toUpdateFrame();
            assert.deepStrictEqual(counts, [0, 0]);
        });
    });

    describe('#toUpdateFrame', () => {
        let poll;
        beforeEach(() => {
            poll = Poll.create(
                'pollster',
                'Which is better?',
                [
                    'Coke',
                    'Pepsi'
                ]
                /* default opts */
            );
            poll.countVote('userA', 0);
            poll.countVote('userB', 1);
            poll.countVote('userC', 0);
        });

        it('generates an update frame', () => {
            assert.deepStrictEqual(
                poll.toUpdateFrame(),
                {
                    title: 'Which is better?',
                    options: ['Coke', 'Pepsi'],
                    counts: [2, 1],
                    initiator: 'pollster',
                    timestamp: poll.createdAt.getTime()
                }
            );
        });

        it('hides votes when poll is hidden', () => {
            poll.hideVotes = true;

            assert.deepStrictEqual(
                poll.toUpdateFrame(),
                {
                    title: 'Which is better?',
                    options: ['Coke', 'Pepsi'],
                    counts: ['?', '?'],
                    initiator: 'pollster',
                    timestamp: poll.createdAt.getTime()
                }
            );
        });

        it('displays hidden votes when requested', () => {
            poll.hideVotes = true;

            assert.deepStrictEqual(
                poll.toUpdateFrame(true),
                {
                    title: 'Which is better?',
                    options: ['Coke', 'Pepsi'],
                    counts: ['2?', '1?'],
                    initiator: 'pollster',
                    timestamp: poll.createdAt.getTime()
                }
            );
        });
    });

    describe('#toChannelData/fromChannelData', () => {
        it('round trips a poll', () => {
            let data = {
                title: '&lt;strong&gt;ready?&lt;/strong&gt;',
                initiator: 'aUser',
                options: ['yes', 'no'],
                counts: [0, 1],
                votes:{
                    '1.2.3.4': null, // Previous poll code would set removed votes to null
                    '5.6.7.8': 1
                },
                obscured: false,
                timestamp: 1483414981110
            };

            let poll = Poll.fromChannelData(data);

            // New code does not store null votes
            data.votes = { '5.6.7.8': 1 };
            data.retainVotes = false;
            assert.deepStrictEqual(poll.toChannelData(), data);
        });

        it('coerces a missing timestamp to the current time', () => {
            let data = {
                title: '&lt;strong&gt;ready?&lt;/strong&gt;',
                initiator: 'aUser',
                options: ['yes', 'no'],
                counts: [0, 1],
                votes:{
                    '1.2.3.4': null,
                    '5.6.7.8': 1
                },
                obscured: false
            };

            let now = Date.now();
            let poll = Poll.fromChannelData(data);
            const { timestamp } = poll.toChannelData();
            if (typeof timestamp !== 'number' || isNaN(timestamp))
                assert.fail(`Unexpected timestamp: ${timestamp}`);

            if (Math.abs(timestamp - now) > 1000)
                assert.fail(`Unexpected timestamp: ${timestamp}`);
        });
    });
});
