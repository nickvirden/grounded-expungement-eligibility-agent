import styled from 'styled-components';

export const PathSteps = styled.ol`
  list-style: none;
  counter-reset: path-step;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

interface PathStepProps {
  $density: 'comfortable' | 'compact';
}

export const PathStep = styled.li<PathStepProps>`
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  font-size: ${({ $density }) => ($density === 'compact' ? '0.75rem' : '0.875rem')};
  color: var(--color-navy-600);
  counter-increment: path-step;

  &::before {
    content: counter(path-step);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: ${({ $density }) => ($density === 'compact' ? '18px' : '20px')};
    height: ${({ $density }) => ($density === 'compact' ? '18px' : '20px')};
    border-radius: 50%;
    background: var(--color-slate-200);
    color: var(--color-navy-600);
    font-size: ${({ $density }) => ($density === 'compact' ? '0.625rem' : '0.6875rem')};
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }
`;

export const PathStepBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const PathStepQuestion = styled.div`
  font-weight: 600;
  color: var(--color-navy-800);

  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }
`;

export const PathStepAnswer = styled.div`
  color: var(--color-navy-600);

  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }
`;

export const PathStepRaw = styled.div`
  font-family: var(--font-mono);
  color: var(--color-navy-600);
`;
