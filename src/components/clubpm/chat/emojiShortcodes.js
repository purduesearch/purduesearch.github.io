/**
 * Common Slack shortcodes → Unicode, for rendering message CONTENT (reactions
 * and :shortcode: text). Not an icon set — UI icons stay Font Awesome.
 * Unknown names fall back to their :name: text; workspace custom emoji come
 * from the server as image URLs.
 */
const MAP = {
  '+1': '👍', thumbsup: '👍', '-1': '👎', thumbsdown: '👎',
  white_check_mark: '✅', heavy_check_mark: '✔️', x: '❌', eyes: '👀',
  tada: '🎉', partying_face: '🥳', heart: '❤️', white_heart: '🤍',
  joy: '😂', smile: '😄', grinning: '😀', laughing: '😆', slightly_smiling_face: '🙂',
  wink: '😉', upside_down_face: '🙃', sweat_smile: '😅', sob: '😭', heart_eyes: '😍',
  thinking_face: '🤔', facepalm: '🤦', shrug: '🤷', saluting_face: '🫡',
  pray: '🙏', clap: '👏', raised_hands: '🙌', wave: '👋', ok_hand: '👌', muscle: '💪',
  fire: '🔥', rocket: '🚀', star: '⭐', sparkles: '✨', '100': '💯', bulb: '💡', memo: '📝',
  warning: '⚠️', rotating_light: '🚨', question: '❓', exclamation: '❗', hourglass_flowing_sand: '⏳',
};

/** "+1::skin-tone-3" → 👍 (skin tones fall back to the base glyph). */
export function emojiChar(name) {
  if (!name) return null;
  return MAP[String(name).split('::')[0]] ?? null;
}

export const QUICK_REACTIONS = ['+1', 'white_check_mark', 'eyes', 'tada', 'heart', 'joy'];
