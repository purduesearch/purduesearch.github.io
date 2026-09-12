/**
 * Composer text ⇄ Slack mrkdwn.
 *
 * Slack requires &, < and > escaped in message text — they are the control
 * characters of <@U…>, <#C…> and <url|label> — and a mention only pings when it
 * is sent as <@U…>. Plain "@Name" is inert text.
 *
 * `mentions` maps the exact label autocomplete inserted (without the "@") to a
 * Slack user id. Longest labels are replaced first so "@Ann Lee" beats "@Ann".
 */
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeSlack = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function encodeOutgoing(text, mentions = {}) {
  let out = escapeSlack(text);
  const labels = Object.keys(mentions).filter(Boolean).sort((a, b) => b.length - a.length);
  for (const label of labels) {
    const re = new RegExp(`(^|[^\\w@])@${escapeRegExp(escapeSlack(label))}(?![\\w])`, 'g');
    out = out.replace(re, (_m, pre) => `${pre}<@${mentions[label]}>`);
  }
  return out.replace(/(^|[^\w@])@(channel|here|everyone)(?![\w])/g, (_m, pre, kw) => `${pre}<!${kw}>`);
}

const BROADCAST = new Set(['channel', 'here', 'everyone']);

/** A message's rendered tokens → editable composer text + its mention map. */
export function decodeForEdit(tokens) {
  const mentions = {};
  const walk = (list) => (list ?? []).map((t) => {
    switch (t.type) {
      case 'text': return t.value;
      case 'mention': {
        const bare = String(t.label ?? '').replace(/^@+/, '');
        if (String(t.slackId).startsWith('!')) {
          const kw = String(t.slackId).slice(1).split('^')[0];
          return `@${BROADCAST.has(kw) ? kw : bare}`;
        }
        mentions[bare] = t.slackId;
        return `@${bare}`;
      }
      case 'channel': return `#${t.label}`;
      case 'link': return t.href;
      case 'code': return `\`${t.value}\``;
      case 'codeblock': return `\`\`\`\n${t.value}\n\`\`\``;
      case 'emoji': return `:${t.name}:`;
      case 'bold': return `*${walk(t.children)}*`;
      case 'italic': return `_${walk(t.children)}_`;
      case 'strike': return `~${walk(t.children)}~`;
      default: return '';
    }
  }).join('');
  return { text: walk(tokens), mentions };
}
