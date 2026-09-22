'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon } from '@/components/icons';
import { useChatStream } from '@/hooks/useChatStream';
import CaseFileCard from './CaseFileCard';
import {
  BackLink,
  ChatColumn,
  ErrorBannerChat,
  InputArea,
  MessageBubble,
  MessageList,
  NarrativeTextarea,
  SendButton,
  TalkHeader,
  TalkHeaderTitle,
  TalkShell,
  TypingCursor,
  WelcomeMessage,
} from './TalkClient.styles';

interface Props {
  state: string;
  stateName: string;
}

const WELCOME = (stateName: string) =>
  `Hi! I'm the ClearSlate eligibility assistant. I'll help you find out if your record qualifies for relief in ${stateName}.\n\nTo get started, please describe your situation in as much detail as you're comfortable sharing — for example: what you were charged with, whether you were convicted, approximately when this happened, and whether you served any sentence.`;

export default function TalkClient({ state, stateName }: Props) {
  const { messages, intakeId, report, isLoading, error, send } = useChatStream();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasStarted = messages.length > 0;
  const agentStatus = isLoading ? 'running' : report ? 'complete' : error ? 'error' : 'pending';

  // Auto-scroll message list on new content
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const narrative = draft.trim();
    if (!narrative || isLoading) return;
    setDraft('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await send(state, narrative);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <TalkShell>
      <TalkHeader>
        <BackLink as={Link} href="/" aria-label="Back to home">
          ← Back
        </BackLink>
        <TalkHeaderTitle>Talk to Agent — {stateName}</TalkHeaderTitle>
        <span />
      </TalkHeader>

      <ChatColumn aria-label="Chat conversation">
        <MessageList ref={listRef} role="log" aria-live="polite" aria-label="Messages">
          {!hasStarted && <WelcomeMessage>{WELCOME(stateName)}</WelcomeMessage>}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              $role={msg.role}
              aria-label={msg.role === 'user' ? 'Your message' : 'Agent message'}
            >
              {msg.content}
              {msg.isStreaming && <TypingCursor aria-hidden="true" />}
            </MessageBubble>
          ))}
        </MessageList>

        {error && (
          <ErrorBannerChat role="alert">
            {error} — please try refreshing or starting over.
          </ErrorBannerChat>
        )}

        <InputArea onSubmit={(e) => void handleSubmit(e)} aria-label="Send message">
          <NarrativeTextarea
            ref={textareaRef}
            value={draft}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder={
              hasStarted ? 'Continue the conversation…' : 'Describe your situation…'
            }
            disabled={isLoading}
            rows={2}
            aria-label="Message input"
          />
          <SendButton
            type="submit"
            disabled={isLoading || !draft.trim()}
            aria-label="Send message"
          >
            <ArrowRightIcon size={20} color="white" aria-hidden="true" />
          </SendButton>
        </InputArea>
      </ChatColumn>

      <CaseFileCard
        state={state}
        intakeId={intakeId}
        status={agentStatus}
        report={report}
      />
    </TalkShell>
  );
}
