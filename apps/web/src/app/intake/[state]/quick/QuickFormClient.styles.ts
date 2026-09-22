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
  padding: 0 var(--space-6);
  height: 64px;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  position: sticky;
  top: 0;
  z-index: 10;
`;

export const BackButton = styled.a`
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

export const HeaderTitle = styled.span`
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-navy-800);
  flex: 1;
  text-align: center;
`;

export const StepCounter = styled.span`
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-navy-600);
  white-space: nowrap;
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

export const FormBody = styled.main`
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

export const QuestionText = styled.h2`
  font-size: 1.375rem;
  font-weight: 700;
  color: var(--color-navy-900);
  line-height: 1.35;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-3);
`;

export const HelpText = styled.p`
  font-size: 0.9375rem;
  color: var(--color-navy-600);
  line-height: 1.6;
  margin-bottom: var(--space-8);
  padding: var(--space-4);
  background: var(--color-blue-100);
  border-radius: var(--radius-lg);
  border-left: 3px solid var(--color-blue-500);
`;

// ─── Answer buttons ───────────────────────────────────────────────────────────

export const AnswerList = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
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
  color: var(--color-red-600);
  font-size: 0.9375rem;
  margin-top: var(--space-6);
`;

// ─── Path breadcrumbs ─────────────────────────────────────────────────────────

export const PathCrumb = styled.div`
  font-size: 0.75rem;
  color: var(--color-slate-400);
  margin-top: var(--space-8);
  text-align: center;
  font-family: var(--font-mono);
`;
