import { render } from '@testing-library/react';
import ChatRichText from './ChatRichText';

// Token shapes as backend/src/services/slackMessageFormat.ts emits them.
const text = (value) => ({ type: 'text', value });

describe('ChatRichText', () => {
  test('renders bold, italic and strike as <b>, <i>, <s>', () => {
    const { container } = render(
      <ChatRichText
        tokens={[
          { type: 'bold', children: [text('bold')] },
          text(' '),
          { type: 'italic', children: [text('it')] },
          text(' '),
          { type: 'strike', children: [text('st')] },
        ]}
      />
    );
    expect(container.querySelector('b')).toHaveTextContent('bold');
    expect(container.querySelector('i')).toHaveTextContent('it');
    expect(container.querySelector('s')).toHaveTextContent('st');
    // The regression: these used to arrive as literal *bold*, _it_, ~st~.
    expect(container.textContent).toBe('bold it st');
  });

  test('renders nested emphasis and entities inside it', () => {
    const { container } = render(
      <ChatRichText
        tokens={[
          {
            type: 'bold',
            children: [
              text('hey '),
              { type: 'italic', children: [text('you')] },
              text(' '),
              { type: 'mention', slackId: 'U1', label: 'Henry' },
            ],
          },
        ]}
      />
    );
    expect(container.querySelector('b > i')).toHaveTextContent('you');
    expect(container.querySelector('b > .cpm-chat-mention')).toHaveTextContent('@Henry');
  });

  test('never emits <span> or <p>, which clubpm-theme.css forces to color: inherit !important', () => {
    const { container } = render(
      <ChatRichText
        tokens={[
          { type: 'strike', children: [{ type: 'bold', children: [text('x')] }] },
          { type: 'code', value: 'y' },
          { type: 'link', href: 'https://x.dev', label: 'z' },
        ]}
      />
    );
    expect(container.querySelector('span, p')).toBeNull();
  });
});
