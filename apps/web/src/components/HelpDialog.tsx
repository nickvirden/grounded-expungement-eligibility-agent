'use client';

import { HelpCircleIcon } from '@/components/icons/index';
import type { HelpBlock, HelpContent, PlainText, StatuteItem } from '@/lib/helpTransform';
import { useId, useRef } from 'react';
import {
  AnswerBox,
  AnswerBoxLabel,
  AnswerBoxText,
  BackButton,
  BackForm,
  CloseButton,
  CloseForm,
  Dialog,
  DialogBody,
  DialogEyebrow,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  HtmlBlock,
  IndexUl,
  StatuteItemLi,
  StatuteLabel,
  StatuteUl,
  Trigger,
  TriggerLabel,
} from './HelpDialog.styles';
import { dialogHeading, triggerParts } from './HelpDialog.utils';

/**
 * The rule sentence a person has reviewed, shown above the Help button. `directive` is decoded
 * plain text, so it is rendered only as a React text child.
 */
export function HowToAnswerBox({ directive }: { directive: PlainText }) {
  return (
    <AnswerBox>
      <AnswerBoxLabel>How to answer</AnswerBoxLabel>
      <AnswerBoxText>{directive}</AnswerBoxText>
    </AnswerBox>
  );
}

function StatuteList({ items }: { items: StatuteItem[] }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: the explicit role keeps list semantics in Safari/VoiceOver, which drops them for `list-style: none`
    <StatuteUl role="list">
      {items.map((item, index) => (
        <StatuteItemLi key={`${item.label}-${index}`}>
          <StatuteLabel>{item.label}</StatuteLabel>
          <span
            // biome-ignore lint/security/noDangerouslySetInnerHtml: inline HTML sanitized by the transform's attribute-free inline profile
            dangerouslySetInnerHTML={{ __html: item.html }}
          />
          {item.children.length > 0 && <StatuteList items={item.children} />}
        </StatuteItemLi>
      ))}
    </StatuteUl>
  );
}

function IndexList({ items }: { items: PlainText[] }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: the explicit role keeps list semantics in Safari/VoiceOver, which drops them for `list-style: none`
    <IndexUl role="list">
      {items.map((entry, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: entries are static text and may repeat
        <li key={`${entry}-${index}`}>{entry}</li>
      ))}
    </IndexUl>
  );
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case 'html':
      return (
        <HtmlBlock
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by the transform's output profile (attribute-free tags, plus h3/h4)
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
    case 'statuteList':
      return <StatuteList items={block.items} />;
    case 'indexList':
      return <IndexList items={block.items} />;
  }
}

/**
 * A "Help: <title>" button that opens the help text in a native modal `<dialog>`: a bottom sheet
 * on phones, a centred dialog above that. `showModal()` makes the page behind inert, so the
 * answer buttons cannot be reached while it is open, and Esc closes it.
 */
export function HelpDialog({ content }: { content: HelpContent }) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A drag that starts inside the sheet (selecting text) and ends on the backdrop produces a
  // click whose target is the dialog. Only a press that also began on the backdrop may close.
  const pressBeganOnBackdrop = useRef(false);

  const { lead, title } = triggerParts(content.title);

  const open = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // Focus the heading, not the first control or the scrolling body: WebKit draws a focus ring
    // around the whole sheet when the body takes focus after a tap. Screen readers announce
    // the dialog name and start reading from here.
    headingRef.current?.focus({ preventScroll: true });
  };

  // WebKit does not focus a button on click, so after a pointer-opened dialog closes there is
  // nothing for the browser to restore focus to and it lands on <body>. Restoring it
  // explicitly keeps keyboard and screen-reader users in place in every engine.
  const returnFocusToTrigger = () => triggerRef.current?.focus();

  return (
    <>
      <Trigger ref={triggerRef} type="button" aria-haspopup="dialog" onClick={open}>
        <HelpCircleIcon size={20} />
        <TriggerLabel>
          <b>{lead}</b>
          {title ? ` ${title}` : null}
        </TriggerLabel>
      </Trigger>

      <Dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        closedby="any"
        onClose={returnFocusToTrigger}
        onPointerDown={(event) => {
          pressBeganOnBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && pressBeganOnBackdrop.current) {
            dialogRef.current?.close();
          }
          pressBeganOnBackdrop.current = false;
        }}
      >
        <DialogHeader>
          <div>
            <DialogEyebrow>Help</DialogEyebrow>
            <DialogTitle id={headingId} ref={headingRef} tabIndex={-1}>
              {dialogHeading(content.title)}
            </DialogTitle>
          </div>
          <CloseForm method="dialog">
            <CloseButton type="submit">Close</CloseButton>
          </CloseForm>
        </DialogHeader>

        {/* Focusable so keyboard users can scroll long help with the arrow keys. */}
        <DialogBody tabIndex={0}>
          {content.blocks.map((block, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks are a static ordered list
            <Block key={index} block={block} />
          ))}
        </DialogBody>

        <DialogFooter>
          <BackForm method="dialog">
            <BackButton type="submit">Back to the question</BackButton>
          </BackForm>
        </DialogFooter>
      </Dialog>
    </>
  );
}
