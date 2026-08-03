import { describe, expect, it } from 'vitest';
import { simpleConversationReply } from '../../../server/services/conversationFastPath.js';

describe('simple conversation fast path', () => {
  it.each(['hi', 'Hello!', 'hey man', 'hey baby ?', 'good morning', "what's up?"])(
    'answers the greeting %j without a model request',
    message => {
      expect(simpleConversationReply(message)).toBe('Hey! 👋 What would you like to work on?');
    },
  );

  it.each([
    'hey, move my tasks to tomorrow',
    'hello can you review my schedule?',
    'what is overdue?',
    'plan this week',
  ])('does not intercept a real request: %j', message => {
    expect(simpleConversationReply(message)).toBeNull();
  });
});
