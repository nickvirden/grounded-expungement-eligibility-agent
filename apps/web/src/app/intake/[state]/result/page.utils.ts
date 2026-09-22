/** Map result keys to display metadata. */
export interface ResultMeta {
  headline: string;
  body: string;
  outcome: 'positive' | 'negative' | 'conditional';
}

const RESULT_META: Record<string, ResultMeta> = {
  expungement: {
    headline: 'You may qualify for expungement',
    body: 'Based on your answers, your record appears to meet the initial criteria for expungement in your state. An expungement would seal your record from most background checks. We recommend consulting with an attorney to confirm and file.',
    outcome: 'positive',
  },
  dwiRecordSealing: {
    headline: 'You may qualify for DWI record sealing',
    body: "Based on your answers, your record may be eligible for sealing under your state's DWI relief program. Record sealing restricts access to your record in most civil and employment contexts.",
    outcome: 'positive',
  },
  dnq: {
    headline: 'Your record does not appear to qualify at this time',
    body: 'Based on your answers, your record does not currently meet the eligibility requirements for expungement or sealing in your state. This may change in the future. An attorney can advise on options or whether you may qualify later.',
    outcome: 'negative',
  },
  dnqy: {
    headline: 'You may qualify in the future',
    body: 'Based on your answers, your record does not qualify right now, but you may become eligible after a waiting period. An attorney can help you understand when and how to apply.',
    outcome: 'conditional',
  },
};

const DEFAULT_META: ResultMeta = {
  headline: 'Eligibility determination complete',
  body: 'We have determined an outcome for your record based on the information you provided. Please consult with an attorney for personalised guidance.',
  outcome: 'conditional',
};

export function getResultMeta(resultKey: string | null): ResultMeta {
  if (!resultKey) return DEFAULT_META;
  // 1. Exact match
  if (resultKey in RESULT_META) return RESULT_META[resultKey] as ResultMeta;
  // 2. Strip state prefix: "texas_expungement" → "expungement"
  const withoutPrefix = resultKey.replace(/^[a-z]+_/, '');
  if (withoutPrefix in RESULT_META) return RESULT_META[withoutPrefix] as ResultMeta;
  // 3. Slug normalisation (case-insensitive, non-alphanumeric stripped)
  const normalised = resultKey.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, meta] of Object.entries(RESULT_META)) {
    if (key.toLowerCase() === normalised) return meta;
  }
  return DEFAULT_META;
}
