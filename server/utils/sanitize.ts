/**
 * Strip prompt-injection patterns from untrusted strings (entity titles, descriptions)
 * before they are embedded in LLM prompts. Prevents adversarial content in user data
 * from hijacking the AI's instruction context.
 */
export function sanitizeEntityTitle(s: string): string {
  return (s ?? '')
    .replace(/<\|.*?\|>/gs, '')                              // <|INST|>, <|im_start|>, etc.
    .replace(/\[\/?(INST|SYS|SYSTEM)\]/gi, '')              // [INST], [/INST], [SYS]
    .replace(/###\s*(System|User|Assistant)\s*:/gi, '###')  // ### System:
    .replace(/^(System|User|Assistant)\s*:\s*/gim, '')      // leading "System: " on any line
    .trim();
}
