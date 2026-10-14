import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decideHelp } from '@/lib/helpRuleLedger';
import type { PlainText } from '@/lib/helpTransform';
import { UNTITLED_HEADING, dialogHeading, hasHelpContent, triggerParts } from './HelpDialog.utils';

const content = (help: string) =>
  decideHelp({ state: 'texas', question: 'Q?', help, answers: [{ value: 'Yes' }] }, new Set())
    .content;

describe('triggerParts', () => {
  it('leads with "Help:" before a title', () => {
    assert.deepEqual(triggerParts('Texas Counties' as PlainText), {
      lead: 'Help:',
      title: 'Texas Counties',
    });
  });

  it('falls back to a bare "Help" without a title', () => {
    assert.deepEqual(triggerParts(null), { lead: 'Help', title: null });
  });
});

describe('dialogHeading', () => {
  it('uses the title when there is one', () => {
    assert.equal(dialogHeading('Statute of Limitations' as PlainText), 'Statute of Limitations');
  });

  it('names an untitled dialog so it still has an accessible name', () => {
    assert.equal(dialogHeading(null), UNTITLED_HEADING);
  });
});

describe('hasHelpContent', () => {
  it('is false for empty help and for markup with no text', () => {
    assert.equal(hasHelpContent(content('')), false);
    assert.equal(hasHelpContent(content('<p>  </p><div></div>')), false);
  });

  it('is true for a paragraph of help', () => {
    assert.equal(hasHelpContent(content('<p>Some help.</p>')), true);
  });

  it('is true when the help is only a title', () => {
    assert.equal(hasHelpContent(content('<h5><u>Only a title</u></h5>')), true);
  });
});
