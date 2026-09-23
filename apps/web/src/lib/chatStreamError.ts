/**
 * Maps the Talk-to-Agent flow's real HTTP failure statuses to a distinct,
 * user-visible message.
 *
 * `useChatStream` hits two endpoints (create, then stream) that can each
 * fail for a different reason -- an expired/missing stream token, a replay
 * of an already-started intake, a tripped rate limit, or the agent chat
 * feature being unavailable because SSE_SIGNING_KEY isn't configured. Each
 * gets its own message so a person sees why, not just that it failed.
 */
export type ChatRequestStage = 'create' | 'stream';

export function describeChatError(status: number, stage: ChatRequestStage): string {
  switch (status) {
    case 401:
      return 'Your session is no longer valid. Please start a new conversation.';
    case 403:
      return "This conversation doesn't match your session. Please start a new conversation.";
    case 404:
      return 'This conversation no longer exists. Please start a new conversation.';
    case 409:
      return 'This conversation has already started. Please start a new conversation to try again.';
    case 429:
      return "You're sending requests too quickly. Please wait a moment and try again.";
    case 503:
      return 'The agent chat feature is temporarily unavailable. Please try again later.';
    default:
      return stage === 'create'
        ? `Failed to start session (${status})`
        : `Stream unavailable (${status})`;
  }
}
