import styled, { keyframes } from 'styled-components';

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(12px); }
  to   { opacity: 1; transform: translateX(0); }
`;

export const CaseFilePanel = styled.aside`
  grid-area: casefile;
  overflow-y: auto;
  background: var(--color-white);
  padding: var(--space-6);
  border-left: 1px solid var(--color-slate-200);

  @media (max-width: 900px) {
    border-left: none;
    padding: var(--space-4) var(--space-6);
    max-height: 220px;
  }
`;

export const CaseFilePanelTitle = styled.h2`
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-navy-600);
  margin-bottom: var(--space-5);
`;

export const CaseRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-4);
  animation: ${slideIn} 0.3s ease both;
`;

export const CaseLabel = styled.dt`
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-navy-600);
`;

export const CaseValue = styled.dd`
  font-size: 0.9375rem;
  color: var(--color-navy-800);
  font-weight: 500;
`;

interface StatusPillProps {
  $status: 'pending' | 'running' | 'complete' | 'error';
}

export const StatusPill = styled.span<StatusPillProps>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;

  background: ${({ $status }) => {
    if ($status === 'pending') return 'var(--color-slate-100)';
    if ($status === 'running') return 'var(--color-blue-100)';
    if ($status === 'complete') return 'var(--color-green-100)';
    return 'var(--color-red-100)';
  }};
  color: ${({ $status }) => {
    if ($status === 'pending') return 'var(--color-navy-600)';
    if ($status === 'running') return 'var(--color-blue-700)';
    if ($status === 'complete') return 'var(--color-green-700)';
    return 'var(--color-red-700)';
  }};
`;

export const CaseDivider = styled.hr`
  border: none;
  border-top: 1px solid var(--color-slate-200);
  margin: var(--space-4) 0;
`;

export const ResultSection = styled.section`
  animation: ${slideIn} 0.4s ease both;
`;

export const ResultKey = styled.dd`
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-navy-900);
  margin-bottom: var(--space-2);
`;
