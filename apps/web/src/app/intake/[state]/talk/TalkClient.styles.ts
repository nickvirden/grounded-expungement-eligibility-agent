import styled, { css, keyframes } from 'styled-components';

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
`;

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ─── Page layout ─────────────────────────────────────────────────────────────

export const TalkShell = styled.div`
  height: 100vh;
  display: grid;
  grid-template-rows: 64px 1fr;
  grid-template-columns: 1fr 360px;
  grid-template-areas:
    'header  header'
    'chat    casefile';
  background: var(--color-slate-50);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    grid-template-rows: 64px 1fr auto;
    grid-template-areas:
      'header'
      'chat'
      'casefile';
  }
`;

// ─── Header ───────────────────────────────────────────────────────────────────

export const TalkHeader = styled.header`
  grid-area: header;
  background: var(--color-white);
  border-bottom: 1px solid var(--color-slate-200);
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  position: sticky;
  top: 0;
  z-index: 10;
`;

export const BackLink = styled.a`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-navy-600);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  transition:
    color var(--transition-fast),
    background var(--transition-fast);

  &:hover {
    color: var(--color-navy-800);
    background: var(--color-slate-100);
  }
`;

export const TalkHeaderTitle = styled.span`
  flex: 1;
  text-align: center;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-navy-800);
`;

// ─── Chat column ─────────────────────────────────────────────────────────────

export const ChatColumn = styled.section`
  grid-area: chat;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--color-slate-200);

  @media (max-width: 900px) {
    border-right: none;
    border-bottom: 1px solid var(--color-slate-200);
  }
`;

export const MessageList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  scroll-behavior: smooth;
`;

interface BubbleProps {
  $role: 'user' | 'agent';
}

export const MessageBubble = styled.div<BubbleProps>`
  max-width: 80%;
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-xl);
  font-size: 0.9375rem;
  line-height: 1.6;
  animation: ${fadeIn} 0.2s ease both;
  white-space: pre-wrap;
  word-break: break-word;

  ${({ $role }) =>
    $role === 'user'
      ? css`
          align-self: flex-end;
          background: var(--color-blue-600);
          color: var(--color-white);
          border-bottom-right-radius: var(--radius-sm);
        `
      : css`
          align-self: flex-start;
          background: var(--color-white);
          color: var(--color-navy-800);
          border: 1px solid var(--color-slate-200);
          border-bottom-left-radius: var(--radius-sm);
          box-shadow: var(--shadow-sm);
        `}
`;

export const TypingCursor = styled.span`
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-navy-600);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: ${blink} 1s step-end infinite;
`;

export const WelcomeMessage = styled.div`
  align-self: flex-start;
  max-width: 80%;
  padding: var(--space-4) var(--space-5);
  background: var(--color-white);
  border: 1px solid var(--color-slate-200);
  border-radius: var(--radius-xl);
  border-bottom-left-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  font-size: 0.9375rem;
  line-height: 1.6;
  color: var(--color-navy-800);
`;

// ─── Input area ───────────────────────────────────────────────────────────────

export const InputArea = styled.form`
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-slate-200);
  background: var(--color-white);
  display: flex;
  gap: var(--space-3);
  align-items: flex-end;
`;

export const NarrativeTextarea = styled.textarea`
  flex: 1;
  min-height: 52px;
  max-height: 160px;
  padding: var(--space-3) var(--space-4);
  font-size: 0.9375rem;
  font-family: var(--font-sans);
  color: var(--color-navy-800);
  background: var(--color-slate-50);
  border: 1px solid var(--color-slate-200);
  border-radius: var(--radius-lg);
  resize: none;
  line-height: 1.5;
  overflow-y: auto;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast);

  &:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
    background: var(--color-white);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &::placeholder {
    color: var(--color-slate-400);
  }
`;

interface SendButtonProps {
  $loading?: boolean;
}

export const SendButton = styled.button<SendButtonProps>`
  height: 52px;
  width: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-blue-600);
  color: var(--color-white);
  border: none;
  border-radius: var(--radius-lg);
  transition:
    background var(--transition-fast),
    transform var(--transition-fast);

  &:hover:not(:disabled) {
    background: #1d4ed8;
    transform: translateY(-1px);
  }

  &:disabled {
    background: var(--color-slate-400);
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
  }
`;

export const ErrorBannerChat = styled.div`
  margin: 0 var(--space-6) var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-red-100);
  border: 1px solid #fca5a5;
  border-radius: var(--radius-lg);
  color: var(--color-red-600);
  font-size: 0.875rem;
`;
