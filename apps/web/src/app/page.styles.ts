import styled, { css, keyframes } from 'styled-components';

// ─── Animations ───────────────────────────────────────────────────────────────

const fadeInUp = keyframes`
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

// ─── Hero / Page shell ───────────────────────────────────────────────────────

export const HeroSection = styled.section`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8) var(--space-6);
  background: linear-gradient(
    155deg,
    var(--color-navy-950) 0%,
    var(--color-navy-900) 45%,
    #162040 100%
  );
  position: relative;
  overflow: hidden;

  /* Subtle radial glow */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 70% 50% at 50% 0%, #1e3a8a30 0%, transparent 70%);
    pointer-events: none;
  }
`;

export const ContentCard = styled.div`
  position: relative;
  width: 100%;
  max-width: 680px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-xl);
  padding: var(--space-12) var(--space-10);
  backdrop-filter: blur(12px);
  animation: ${fadeInUp} 0.6s ease both;

  @media (max-width: 640px) {
    padding: var(--space-8) var(--space-6);
  }
`;

// ─── Logo / Wordmark ─────────────────────────────────────────────────────────

export const Wordmark = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-8);
`;

export const LogoBadge = styled.div`
  width: 40px;
  height: 40px;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--color-blue-600) 0%, var(--color-blue-400) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const WordmarkText = styled.span`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-white);
  letter-spacing: -0.02em;
`;

// ─── Typography ──────────────────────────────────────────────────────────────

export const Headline = styled.h1`
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-weight: 800;
  color: var(--color-white);
  line-height: 1.15;
  letter-spacing: -0.03em;
  margin-bottom: var(--space-4);
`;

export const Highlight = styled.span`
  background: linear-gradient(90deg, var(--color-blue-400), #818cf8);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
`;

export const Subheading = styled.p`
  font-size: 1.0625rem;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.65;
  margin-bottom: var(--space-10);
  max-width: 520px;
`;

// ─── State picker ─────────────────────────────────────────────────────────────

export const FieldGroup = styled.div`
  margin-bottom: var(--space-8);
`;

export const FieldLabel = styled.label`
  display: block;
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: var(--space-2);
`;

export const StateSelect = styled.select`
  width: 100%;
  padding: var(--space-4) var(--space-5);
  font-size: 1rem;
  font-family: var(--font-sans);
  color: var(--color-white);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-lg);
  outline: none;
  appearance: none;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast);

  option {
    background: var(--color-navy-900);
    color: var(--color-white);
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.1);
  }

  &:focus-visible {
    border-color: var(--color-blue-400);
    background: rgba(255, 255, 255, 0.1);
    outline: 2px solid var(--color-blue-500);
    outline-offset: 2px;
  }
`;

// ─── Mode chooser ─────────────────────────────────────────────────────────────

interface ModeCardsProps {
  $visible: boolean;
}

export const ModeCards = styled.div<ModeCardsProps>`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
  animation: ${fadeIn} 0.35s ease both;
  visibility: ${({ $visible }) => ($visible ? 'visible' : 'hidden')};
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition:
    opacity var(--transition-base),
    visibility var(--transition-base);

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

interface ModeCardProps {
  $disabled?: boolean;
}

export const ModeCard = styled.a<ModeCardProps>`
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-xl);
  color: var(--color-white);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);

  ${({ $disabled }) =>
    $disabled
      ? css`
          opacity: 0.4;
          cursor: not-allowed;
          pointer-events: none;
        `
      : css`
          &:hover {
            background: rgba(59, 130, 246, 0.15);
            border-color: rgba(96, 165, 250, 0.4);
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(59, 130, 246, 0.15);
          }
          &:focus-visible {
            outline: 2px solid var(--color-blue-400);
            outline-offset: 2px;
          }
          &:active {
            transform: translateY(0);
          }
        `}
`;

export const ModeIconWrapper = styled.div`
  width: 44px;
  height: 44px;
  border-radius: var(--radius-lg);
  background: rgba(59, 130, 246, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.375rem;
`;

export const ModeTitle = styled.div`
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-white);
`;

export const ModeDescription = styled.div`
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.5;
`;

export const ModeBadge = styled.span`
  display: inline-block;
  margin-top: auto;
  padding: var(--space-1) var(--space-3);
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: var(--radius-full);
  background: rgba(59, 130, 246, 0.25);
  color: var(--color-blue-400);
  align-self: flex-start;
`;

// ─── Footer ──────────────────────────────────────────────────────────────────

export const PageFooter = styled.footer`
  margin-top: var(--space-12);
  text-align: center;
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.3);
  line-height: 1.6;

  a {
    color: rgba(255, 255, 255, 0.5);
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color var(--transition-fast);

    &:hover {
      color: rgba(255, 255, 255, 0.8);
    }
  }
`;

export const DisclaimerText = styled.p`
  max-width: 520px;
  margin: 0 auto;
`;
