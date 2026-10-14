'use client';

import styled from 'styled-components';

// ─── "How to answer" box ──────────────────────────────────────────────────────
// A tinted, outlined note. It is not a control, so it has no hover or focus state, and it uses
// an outline rather than a left bar so it does not read as a quoted or selectable item.

export const AnswerBox = styled.div`
  background: var(--color-slate-100);
  border: 1px solid var(--color-slate-200);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-3);
`;

export const AnswerBoxLabel = styled.p`
  font-size: 0.8125rem;
  line-height: 1.4;
  font-weight: 700;
  color: var(--color-navy-600);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: var(--space-1);
`;

export const AnswerBoxText = styled.p`
  font-size: 1rem;
  line-height: 1.5;
  font-weight: 600;
  color: var(--color-navy-900);
`;

// ─── Trigger ──────────────────────────────────────────────────────────────────
// Deliberately unlike an answer: no box, no fill, underlined blue text with an icon. Answers
// are full-width bordered boxes, so a visual difference keeps help from reading as a choice.

export const Trigger = styled.button`
  display: flex;
  width: fit-content;
  max-width: 100%;
  align-items: flex-start;
  gap: var(--space-2);
  min-height: 44px;
  padding-block: var(--space-2);
  margin-bottom: var(--space-6);
  border: 0;
  background: none;
  border-radius: var(--radius-sm);
  text-align: left;
  color: var(--color-blue-700);

  & > svg {
    flex: none;
    margin-top: 2px;
  }
`;

export const TriggerLabel = styled.span`
  min-width: 0;
  font-size: 1rem;
  line-height: 1.5;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;

  ${Trigger}:hover & {
    text-decoration-thickness: 2px;
  }

  & b {
    font-weight: 700;
  }
`;

// ─── Dialog ───────────────────────────────────────────────────────────────────

export const Dialog = styled.dialog`
  /* The transparent border gives forced-colors mode an edge to paint; without it the sheet and
     its buttons lose their boundaries there. */
  border: 1px solid transparent;
  padding: 0;
  color: var(--color-navy-800);
  background: var(--color-white);
  box-shadow: var(--shadow-xl);
  width: min(560px, 100% - var(--space-12));
  max-width: none;
  /* The vh line is the fallback for engines without dynamic viewport units. */
  max-height: min(720px, 100vh - var(--space-16));
  max-height: min(720px, 100dvh - var(--space-16));
  margin: auto;
  border-radius: var(--radius-xl);
  /* The body is the scroller. A modal dialog defaults to overflow: auto, which WebKit and Firefox
     treat as a keyboard-focusable scroll container, drawing a focus ring around the whole sheet. */
  overflow: hidden;

  /* WebKit and Firefox move focus onto the dialog itself when Tab wraps past its last or first
     control. The frame is not a control, so it draws no ring; the sheet-sized outline it would
     get from the global focus style reads as a defect. */
  &:focus,
  &:focus-visible {
    outline: none;
  }

  /* Only the open state sets display, so a closed dialog stays hidden. */
  &[open] {
    display: flex;
    flex-direction: column;
  }

  &::backdrop {
    background: color-mix(in srgb, var(--color-navy-900) 55%, transparent);
  }

  /* Bottom sheet on phones. The gap above it shows the page behind, so it reads as a layer. */
  @media (max-width: 640px) {
    width: 100%;
    max-width: 100%;
    margin: auto 0 0 0;
    max-height: calc(100vh - var(--space-12));
    max-height: calc(100dvh - var(--space-12));
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }

  /* A phone in landscape: give the content the height, drop the footer. */
  @media (max-height: 480px) {
    max-height: calc(100vh - var(--space-4));
    max-height: calc(100dvh - var(--space-4));
  }

  @media (prefers-reduced-motion: no-preference) {
    transition:
      transform var(--transition-base),
      opacity var(--transition-base),
      overlay var(--transition-base) allow-discrete,
      display var(--transition-base) allow-discrete;

    &:not([open]) {
      opacity: 0;
      transform: translateY(8px);
    }

    @starting-style {
      &[open] {
        opacity: 0;
        transform: translateY(8px);
      }
    }

    &::backdrop {
      transition:
        background-color var(--transition-fast),
        overlay var(--transition-fast) allow-discrete,
        display var(--transition-fast) allow-discrete;
    }

    @starting-style {
      &[open]::backdrop {
        background-color: transparent;
      }
    }

    @media (max-width: 640px) {
      &:not([open]) {
        opacity: 1;
        transform: translateY(100%);
      }

      @starting-style {
        &[open] {
          opacity: 1;
          transform: translateY(100%);
        }
      }
    }
  }
`;

export const DialogHeader = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-6);
  background: var(--color-slate-50);
  border-bottom: 1px solid var(--color-slate-200);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;

  @media (max-height: 480px) {
    padding-block: var(--space-2);
  }
`;

export const DialogEyebrow = styled.p`
  font-size: 0.75rem;
  line-height: 1.4;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-navy-600);
`;

export const DialogTitle = styled.h2`
  font-size: 1rem;
  line-height: 1.4;
  font-weight: 700;
  color: var(--color-navy-900);

  /* Programmatic focus target on open. It is not interactive, so it draws no ring; focusing it
     (not the scroll body) also keeps WebKit from outlining the whole sheet after a tap. */
  &:focus {
    outline: none;
  }
`;

export const CloseForm = styled.form`
  flex: none;
`;

export const CloseButton = styled.button`
  min-height: 44px;
  min-width: 44px;
  padding-inline: var(--space-3);
  border: 1px solid transparent;
  background: none;
  border-radius: var(--radius-md);
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-blue-700);

  &:hover {
    background: var(--color-slate-100);
  }
`;

/** A sanitized HTML run from the transform (paragraphs, lists, sub-headings). */
export const HtmlBlock = styled.div``;

export const DialogBody = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--space-5) var(--space-6) var(--space-6);
  font-size: 1rem;
  line-height: 1.6;
  color: var(--color-navy-700);

  /* The reset zeroes margins and padding, so rhythm is rebuilt here. */
  /* An inset ring: an outset one is clipped by the scroller's edges. */
  &:focus-visible {
    outline-offset: -2px;
  }

  & > * + *,
  & ${HtmlBlock} > * + * {
    margin-top: var(--space-3);
  }

  & b,
  & strong {
    font-weight: 600;
    color: var(--color-navy-900);
  }

  /* Legacy titles are underlined headings; the dialog header carries the title, so any
     remaining underline is emphasis and is shown as weight instead. */
  & u {
    font-weight: 600;
    text-decoration: none;
  }

  & h3,
  & h4 {
    font-size: 0.9375rem;
    line-height: 1.4;
    font-weight: 700;
    color: var(--color-navy-900);
  }

  & ${HtmlBlock} > h3:not(:first-child),
  & ${HtmlBlock} > h4:not(:first-child) {
    margin-top: var(--space-5);
  }

  & ${HtmlBlock} > h3 + *,
  & ${HtmlBlock} > h4 + * {
    margin-top: var(--space-1);
  }

  & ul,
  & ol {
    padding-inline-start: var(--space-6);
  }

  & ol {
    padding-inline-start: 2em;
    font-variant-numeric: tabular-nums;
  }

  & li {
    line-height: 1.5;
  }

  & li + li {
    margin-top: var(--space-1);
  }

  & li::marker {
    color: var(--color-navy-600);
  }

  & ul ul {
    list-style-type: circle;
    margin-top: var(--space-1);
  }
`;

export const DialogFooter = styled.div`
  flex: none;
  display: flex;
  justify-content: flex-end;
  padding: var(--space-3) var(--space-6) calc(var(--space-3) + env(safe-area-inset-bottom));
  border-top: 1px solid var(--color-slate-200);

  @media (max-height: 480px) {
    display: none;
  }
`;

export const BackForm = styled.form`
  @media (max-width: 640px) {
    width: 100%;
  }
`;

export const BackButton = styled.button`
  min-height: 48px;
  padding-inline: var(--space-5);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  background: var(--color-navy-800);
  color: var(--color-white);
  font-size: 1rem;
  font-weight: 600;

  @media (max-width: 640px) {
    width: 100%;
  }
`;

// ─── Body lists ───────────────────────────────────────────────────────────────

/** A quoted statute: labels in one column, text in the next, no quote rule. */
export const StatuteUl = styled.ul`
  /* Doubled selector: the body's generic list rules have higher specificity than one class. */
  && {
    list-style: none;
    padding: 0;
  }
`;

export const StatuteItemLi = styled.li`
  display: grid;
  grid-template-columns: 2.25em 1fr;
  column-gap: var(--space-1);

  @media (max-width: 640px) {
    grid-template-columns: 2em 1fr;
  }

  & > ul {
    grid-column: 2;
    margin-top: var(--space-1);

    @media (max-width: 640px) {
      grid-column: 1 / -1;
    }
  }
`;

export const StatuteLabel = styled.span`
  font-weight: 600;
  color: var(--color-navy-600);
  font-variant-numeric: tabular-nums;
`;

/**
 * Short entries (the 84 counties) flow in columns sized by width: 2 at the phone sheet width, up
 * to 4 in the centred dialog.
 */
export const IndexUl = styled.ul`
  && {
    list-style: none;
    padding: 0;
    columns: 6.5rem 4;
    column-gap: var(--space-4);
  }

  && > li {
    break-inside: avoid;
    line-height: 1.75;
  }

  && > li + li {
    margin-top: 0;
  }
`;
