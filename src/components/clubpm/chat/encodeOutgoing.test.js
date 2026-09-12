import { encodeOutgoing, decodeForEdit } from './encodeOutgoing';

describe('encodeOutgoing', () => {
  test('escapes Slack control characters', () => {
    expect(encodeOutgoing('a < b && c > d')).toBe('a &lt; b &amp;&amp; c &gt; d');
  });
  test('turns an autocompleted mention into <@U…>', () => {
    expect(encodeOutgoing('hi @Ann Lee!', { 'Ann Lee': 'U1' })).toBe('hi <@U1>!');
  });
  test('longest label wins', () => {
    expect(encodeOutgoing('@Ann and @Ann Lee', { Ann: 'U1', 'Ann Lee': 'U2' })).toBe('<@U1> and <@U2>');
  });
  test('does not match inside a word or an email', () => {
    expect(encodeOutgoing('bob@Ann @Annie', { Ann: 'U1' })).toBe('bob@Ann @Annie');
  });
  test('labels with regex characters are literal', () => {
    expect(encodeOutgoing('cc @Dr. Who', { 'Dr. Who': 'U9' })).toBe('cc <@U9>');
  });
  test('broadcast keywords become special mentions', () => {
    expect(encodeOutgoing('@here and @channel, not @everyoneelse')).toBe('<!here> and <!channel>, not @everyoneelse');
  });
  test('an unknown @word stays plain text', () => {
    expect(encodeOutgoing('ping @nobody')).toBe('ping @nobody');
  });
});

describe('decodeForEdit', () => {
  test('round-trips mentions and formatting', () => {
    const tokens = [
      { type: 'text', value: 'hi ' },
      { type: 'mention', slackId: 'U1', label: 'Ann' },
      { type: 'text', value: ' ' },
      { type: 'bold', children: [{ type: 'text', value: 'x' }] },
      { type: 'text', value: ' ' },
      { type: 'code', value: 'a<b' },
    ];
    const { text, mentions } = decodeForEdit(tokens);
    expect(text).toBe('hi @Ann *x* `a<b`');
    expect(mentions).toEqual({ Ann: 'U1' });
    expect(encodeOutgoing(text, mentions)).toBe('hi <@U1> *x* `a&lt;b`');
  });
  test('broadcast mentions decode to their keyword', () => {
    const { text } = decodeForEdit([{ type: 'mention', slackId: '!here', label: '@here' }]);
    expect(text).toBe('@here');
  });
});
