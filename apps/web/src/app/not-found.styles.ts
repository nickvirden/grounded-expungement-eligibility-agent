'use client';

import styled from 'styled-components';

export const NotFoundShell = styled.div`
  min-height: 100vh;
  background: var(--color-slate-50);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-6);
`;

export const NotFoundCard = styled.section`
  width: 100%;
  max-width: 640px;
  background: var(--color-white);
  border: 1px solid var(--color-slate-200);
  border-radius: var(--radius-xl);
  padding: var(--space-10);
  box-shadow: var(--shadow-xl);

  @media (max-width: 640px) {
    padding: var(--space-8) var(--space-6);
  }
`;

export const StatusEyebrow = styled.p`
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-navy-600);
  margin-bottom: var(--space-3);
`;

export const NotFoundHeadline = styled.h1`
  font-size: clamp(1.5rem, 3.5vw, 2rem);
  font-weight: 800;
  color: var(--color-navy-900);
  line-height: 1.2;
  letter-spacing: -0.03em;
  margin-bottom: var(--space-4);
`;

export const NotFoundBody = styled.p`
  font-size: 1.0625rem;
  color: var(--color-navy-600);
  line-height: 1.65;
  margin-bottom: var(--space-8);
`;

export const HomeLink = styled.a`
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
    background: var(--color-blue-700);
    transform: translateY(-1px);
  }
  &:focus-visible {
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
  }
`;
