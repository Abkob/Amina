const SIMPLE_GREETING = /^(?:hi|hey|hello|yo|sup|what'?s up|good (?:morning|afternoon|evening))(?:\s+(?:there|man|bro|baby|amina))?$/i;

/**
 * Tiny social turns should not load the complete planning graph or spend a
 * cloud-model request. Return null as soon as the message contains an actual
 * request so normal semantic routing remains authoritative.
 */
export function simpleConversationReply(message: string): string | null {
  const normalized = message
    .trim()
    .replace(/[!?.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!SIMPLE_GREETING.test(normalized)) return null;
  return 'Hey! 👋 What would you like to work on?';
}
