import styled, { keyframes } from 'styled-components';

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

export const ResultShell = styled.div`
  min-height: 100vh;
  background: var(--color-slate-50);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-6);
`;

export const ResultCard = styled.article`
  width: 100%;
  max-width: 640px;
  background: var(--color-white);
  border: 1px solid var(--color-slate-200);
  border-radius: var(--radius-xl);
  padding: var(--space-10);
  box-shadow: var(--shadow-xl);
  animation: ${fadeInUp} 0.5s ease both;

  @media (max-width: 640px) {
    padding: var(--space-8) var(--space-6);
  }
`;

interface OutcomeBadgeProps {
  $outcome: 'positive' | 'negative' | 'conditional';
}

export const OutcomeBadge = styled.div<OutcomeBadgeProps>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-full);
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: var(--space-5);
  background: ${({ $outcome }) => {
    if ($outcome === 'positive') return 'var(--color-green-100)';
    if ($outcome === 'negative') return 'var(--color-red-100)';
    return 'var(--color-amber-100)';
  }};
  color: ${({ $outcome }) => {
    if ($outcome === 'positive') return 'var(--color-green-600)';
    if ($outcome === 'negative') return 'var(--color-red-600)';
    return 'var(--color-amber-600)';
  }};
`;

export const ResultHeadline = styled.h1`
  font-size: clamp(1.5rem, 3.5vw, 2rem);
  font-weight: 800;
  color: var(--color-navy-900);
  line-height: 1.2;
  letter-spacing: -0.03em;
  margin-bottom: var(--space-4);
`;

export const ResultBody = styled.p`
  font-size: 1.0625rem;
  color: var(--color-navy-600);
  line-height: 1.65;
  margin-bottom: var(--space-8);
`;

export const PathSection = styled.section`
  border-top: 1px solid var(--color-slate-200);
  padding-top: var(--space-6);
  margin-top: var(--space-2);
`;

export const SectionTitle = styled.h2`
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-navy-600);
  margin-bottom: var(--space-3);
`;

export const PathSteps = styled.ol`
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

export const PathStep = styled.li`
  font-size: 0.875rem;
  font-family: var(--font-mono);
  color: var(--color-slate-400);
  display: flex;
  align-items: center;
  gap: var(--space-2);

  &::before {
    content: counter(step);
    counter-increment: step;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-slate-200);
    color: var(--color-navy-600);
    font-size: 0.6875rem;
    font-weight: 700;
    flex-shrink: 0;
  }
`;

export const ActionRow = styled.div`
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-8);
  flex-wrap: wrap;
`;

export const PrimaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  background: var(--color-blue-600);
  color: var(--color-white);
  font-size: 0.9375rem;
  font-weight: 600;
  border-radius: var(--radius-lg);
  transition:
    background var(--transition-fast),
    transform var(--transition-fast);

  &:hover {
    background: #1d4ed8;
    transform: translateY(-1px);
  }
  &:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
  }
`;

export const SecondaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-6);
  background: var(--color-white);
  color: var(--color-navy-700);
  font-size: 0.9375rem;
  font-weight: 500;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-slate-200);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);

  &:hover {
    background: var(--color-slate-100);
    border-color: var(--color-slate-300);
  }
  &:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
  }
`;

export const Disclaimer = styled.p`
  margin-top: var(--space-8);
  font-size: 0.8125rem;
  color: var(--color-slate-400);
  line-height: 1.6;
  border-top: 1px solid var(--color-slate-200);
  padding-top: var(--space-6);
`;
