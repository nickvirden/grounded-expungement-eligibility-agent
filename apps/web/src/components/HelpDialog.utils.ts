import type { HelpContent, PlainText } from '@/lib/helpTransform';

/** The dialog heading when the help text has no title; the dialog always needs a name. */
export const UNTITLED_HEADING = 'Help with this question';

/** The trigger reads "Help: <title>", or just "Help" when the help has no title. */
export function triggerParts(title: PlainText | null): { lead: string; title: PlainText | null } {
  return title ? { lead: 'Help:', title } : { lead: 'Help', title: null };
}

export const dialogHeading = (title: PlainText | null): string => title ?? UNTITLED_HEADING;

/**
 * Whether there is anything to show behind the Help button. A help string that is empty or
 * markup with no text yields no title, no rule and no blocks; a button that opens an empty
 * dialog would be worse than no button.
 */
export const hasHelpContent = (c: HelpContent): boolean =>
  c.title !== null || c.directive !== null || c.blocks.length > 0;
