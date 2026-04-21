import styled from 'styled-components';

export const SkipLink = styled.a`
  position: absolute;
  top: -40px;
  left: 0;
  padding: var(--space-2) var(--space-4);
  background: var(--color-blue-600);
  color: var(--color-white);
  font-weight: 600;
  border-radius: var(--radius-md);
  z-index: 1000;
  transition: top var(--transition-fast);

  &:focus {
    top: var(--space-4);
  }
`;

export const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

export const MainContent = styled.main`
  flex: 1;
`;
