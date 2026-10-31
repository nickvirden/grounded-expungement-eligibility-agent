'use client';

import styled, { css, keyframes } from 'styled-components';

// ─── Animations ───────────────────────────────────────────────────────────────

const slideInRight = keyframes`
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
`;

// ─── Page shell ───────────────────────────────────────────────────────────────

export const PageShell = styled.div`
  min-height: 100vh;
  background: var(--color-slate-50);
  display: flex;
  flex-direction: column;
`;

// ─── Header ───────────────────────────────────────────────────────────────────

export const FormHeader = styled.header`
  background: var(--color-white);
  border-bottom: 1px solid var(--color-slate-200);
  padding-inline: var(--space-6);
  padding-block: var(--space-2);
  min-height: 64px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: 'back title counter';
  align-items: center;
  column-gap: var(--space-4);
  row-gap: var(--space-1);
  position: sticky;
  top: 0;
  z-index: 10;

  /* The counter text ("12 answered · about 88 left") does not fit beside the back link and the
     title on a narrow screen or at large text sizes, so it drops to its own row instead of
     overflowing the viewport. */
  @media (max-width: 30em) {
    grid-template-columns: auto 1fr;
    grid-template-areas:
      'back title'
      'counter counter';
  }
`;

export const BackButton = styled.a`
  grid-area: back;
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

export const HeaderTitle = styled.h1`
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-navy-800);
  grid-area: title;
  min-width: 0;
  text-align: center;
  overflow-wrap: break-word;
`;

export const StepCounter = styled.span`
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-navy-600);
  grid-area: counter;
  min-width: 0;
  text-align: end;
`;

// ─── Progress bar ─────────────────────────────────────────────────────────────

export const ProgressTrack = styled.div`
  height: 3px;
  background: var(--color-slate-200);
  position: relative;
  overflow: hidden;
`;

interface ProgressFillProps {
  $pct: number;
}

export const ProgressFill = styled.div<ProgressFillProps>`
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  width: ${({ $pct }) => `${Math.round($pct * 100)}%`};
  background: linear-gradient(90deg, var(--color-blue-600), var(--color-blue-400));
  transition: width 0.4s ease;
`;

// ─── Main content area ────────────────────────────────────────────────────────

export const FormBody = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-10) var(--space-6);
`;

export const FormCard = styled.div`
  width: 100%;
  max-width: 600px;
  background: var(--color-white);
  border: 1px solid var(--color-slate-200);
  border-radius: var(--radius-xl);
  padding: var(--space-10) var(--space-10);
  box-shadow: var(--shadow-lg);
  animation: ${slideInRight} 0.3s ease both;

  @media (max-width: 640px) {
    padding: var(--space-8) var(--space-6);
  }
`;

// ─── Question area ────────────────────────────────────────────────────────────

// Both headings take focus programmatically when the card changes, so the ring marks where
// reading resumes.
const headingFocusRing = css`
  &:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 4px;
    border-radius: var(--radius-md);
  }
`;

export const QuestionText = styled.h2`
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--color-navy-900);
  line-height: 1.35;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-3);
  /* Keeps the focused heading out from under the sticky header when focus scrolls it into view. */
  scroll-margin-top: var(--space-24);
  ${headingFocusRing}
  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }
`;

// ─── Answer buttons ───────────────────────────────────────────────────────────

export const AnswerList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  list-style: none;
  margin: 0;
  padding: 0;
`;

export const AnswerListItem = styled.li`
  list-style: none;
  margin: 0;
  padding: 0;
`;

interface AnswerButtonProps {
  $selected?: boolean;
  $disabled?: boolean;
}

export const AnswerButton = styled.button<AnswerButtonProps>`
  width: 100%;
  padding: var(--space-4) var(--space-5);
  font-size: 1rem;
  font-weight: 500;
  text-align: left;
  background: var(--color-slate-50);
  border: 2px solid var(--color-slate-200);
  border-radius: var(--radius-lg);
  color: var(--color-navy-800);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);

  ${({ $selected }) =>
    $selected &&
    css`
      background: var(--color-blue-100);
      border-color: var(--color-blue-500);
      color: var(--color-blue-600);
    `}

  ${({ $disabled }) =>
    $disabled
      ? css`
          opacity: 0.5;
          cursor: not-allowed;
        `
      : css`
          cursor: pointer;
          &:hover {
            background: var(--color-blue-100);
            border-color: var(--color-blue-400);
            color: var(--color-navy-900);
          }
          &:focus-visible {
            outline: 2px solid var(--color-blue-500);
            outline-offset: 2px;
          }
        `}
`;

// ─── Loading state ────────────────────────────────────────────────────────────

export const LoadingDot = styled.span`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-blue-500);
  animation: ${pulse} 1.2s ease-in-out infinite;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }
  &:nth-child(3) {
    animation-delay: 0.4s;
  }
`;

export const LoadingRow = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  justify-content: center;
`;

// ─── Error banner ─────────────────────────────────────────────────────────────

export const ErrorBanner = styled.div`
  padding: var(--space-4) var(--space-5);
  background: var(--color-red-100);
  border: 1px solid #fca5a5;
  border-radius: var(--radius-lg);
  color: var(--color-red-700);
  font-size: 0.9375rem;
  margin-top: var(--space-6);
`;

// ─── Path breadcrumbs ─────────────────────────────────────────────────────────

export const PathCrumb = styled.ol`
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-2);
  font-size: 0.75rem;
  color: var(--color-navy-600);
  margin-top: var(--space-8);
  text-align: center;
`;

export const PathCrumbItem = styled.li`
  &:not(:last-child)::after {
    content: '→';
    margin-left: var(--space-2);
    color: var(--color-navy-600);
  }
`;

// ─── Loop exit ────────────────────────────────────────────────────────────────

export const ExitPanel = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

export const ExitTitle = styled.h2`
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--color-navy-900);
  line-height: 1.35;
  letter-spacing: -0.02em;
  ${headingFocusRing}
`;

export const ExitText = styled.p`
  font-size: 1rem;
  line-height: 1.5;
  color: var(--color-navy-800);
`;

export const ExitActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-2);
`;

// Both actions carry a text label and a border or fill, so neither depends on colour alone.
const exitAction = css`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: var(--space-3) var(--space-6);
  font-size: 0.9375rem;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);

  &:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
  }
`;

export const ExitPrimaryAction = styled.button`
  ${exitAction}
  background: var(--color-blue-600);
  border: 2px solid var(--color-blue-600);
  color: var(--color-white);
  font-weight: 600;

  &:hover {
    background: var(--color-blue-700);
    border-color: var(--color-blue-700);
  }
`;

export const ExitSecondaryAction = styled.a`
  ${exitAction}
  background: var(--color-white);
  border: 2px solid var(--color-navy-600);
  color: var(--color-navy-700);
  font-weight: 500;

  &:hover {
    background: var(--color-slate-100);
  }
`;
