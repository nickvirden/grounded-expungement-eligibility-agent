/** Map result keys to display metadata. */
export interface ResultMeta {
  headline: string;
  body: string;
  outcome: 'positive' | 'negative' | 'conditional';
}

const EXPUNGEMENT: ResultMeta = {
  headline: 'You may qualify for expungement',
  body: 'Based on your answers, your record appears to meet the initial criteria for expungement in your state. An expungement would seal your record from most background checks. We recommend consulting with an attorney to confirm and file.',
  outcome: 'positive',
};

const DWI_SEALING: ResultMeta = {
  headline: 'You may qualify for DWI record sealing',
  body: "Based on your answers, your record may be eligible for sealing under your state's DWI relief program. Record sealing restricts access to your record in most civil and employment contexts.",
  outcome: 'positive',
};

const DOES_NOT_QUALIFY: ResultMeta = {
  headline: 'Your record does not appear to qualify at this time',
  body: 'Based on your answers, your record does not currently meet the eligibility requirements for expungement or sealing in your state. This may change in the future. An attorney can advise on options or whether you may qualify later.',
  outcome: 'negative',
};

const DOES_NOT_QUALIFY_YET: ResultMeta = {
  headline: 'You may qualify in the future',
  body: 'Based on your answers, your record does not qualify right now, but you may become eligible after a waiting period. An attorney can help you understand when and how to apply.',
  outcome: 'conditional',
};

const JUVENILE_SEALING: ResultMeta = {
  headline: 'You may qualify for juvenile record sealing',
  body: 'Based on your answers, a record from when you were a minor may be eligible for sealing. Sealing restricts access to the record in most civil and employment contexts. We recommend consulting with an attorney to confirm and file.',
  outcome: 'positive',
};

const CONVICTION_SET_ASIDE: ResultMeta = {
  headline: 'You may qualify to have a conviction set aside',
  body: 'Based on your answers, your conviction may be eligible to be set aside by a court. The details and effect of a set-aside depend on your case. We recommend consulting with an attorney to confirm and file.',
  outcome: 'positive',
};

const FELONY_SEALING: ResultMeta = {
  headline: 'You may qualify for felony record sealing',
  body: 'Based on your answers, a felony on your record may be eligible for sealing. Sealing restricts access to your record in most civil and employment contexts. We recommend consulting with an attorney to confirm and file.',
  outcome: 'positive',
};

const MISDEMEANOR_SEALING: ResultMeta = {
  headline: 'You may qualify for misdemeanor record sealing',
  body: 'Based on your answers, a misdemeanor on your record may be eligible for sealing. Sealing restricts access to your record in most civil and employment contexts. We recommend consulting with an attorney to confirm and file.',
  outcome: 'positive',
};

const AUTOMATIC_SEALING: ResultMeta = {
  headline: 'Your record may be sealed automatically',
  body: 'Based on your answers, your record may qualify for automatic sealing, which can happen without you filing anything. An attorney can help you confirm whether it has happened and what to do if it has not.',
  outcome: 'positive',
};

const PARDON: ResultMeta = {
  headline: 'A pardon may be your best option',
  body: 'Based on your answers, expungement or sealing does not appear to be available for your record, but a pardon may be. A pardon is a separate process from expungement. An attorney can explain what it involves and whether to pursue it.',
  outcome: 'conditional',
};

const RESEARCH: ResultMeta = {
  headline: 'Your situation needs a closer look',
  body: 'Based on your answers, your record does not fit one of the standard outcomes, so we cannot give you a determination. An attorney can review the details of your case and advise on your options.',
  outcome: 'conditional',
};

/**
 * Keyed by the result keys the rule engine emits: the Texas tree's result
 * label, lowercased with spaces turned into underscores. The short camelCase
 * keys (`expungement`, `dnq`, ...) are the tree's own result identifiers,
 * which older result URLs still carry.
 */
const RESULT_META: Record<string, ResultMeta> = {
  texas_expungement: EXPUNGEMENT,
  texas_dwi_record_sealing: DWI_SEALING,
  texas_juvenile_record_sealing: JUVENILE_SEALING,
  texas_conviction_set_aside: CONVICTION_SET_ASIDE,
  texas_felony_record_sealing: FELONY_SEALING,
  texas_misdemeanor_record_sealing: MISDEMEANOR_SEALING,
  texas_automatic_record_sealing: AUTOMATIC_SEALING,
  texas_pardon_ebook: PARDON,
  does_not_qualify: DOES_NOT_QUALIFY,
  does_not_qualify_yet: DOES_NOT_QUALIFY_YET,
  research: RESEARCH,

  expungement: EXPUNGEMENT,
  dwiRecordSealing: DWI_SEALING,
  juvenileSealing: JUVENILE_SEALING,
  convictionSetAside: CONVICTION_SET_ASIDE,
  felonyRecordSealing: FELONY_SEALING,
  misdemeanorRecordSealing: MISDEMEANOR_SEALING,
  automaticRecordSealing: AUTOMATIC_SEALING,
  pardonBook: PARDON,
  dnq: DOES_NOT_QUALIFY,
  dnqy: DOES_NOT_QUALIFY_YET,
};

const DEFAULT_META: ResultMeta = {
  headline: 'Eligibility determination complete',
  body: 'We have determined an outcome for your record based on the information you provided. Please consult with an attorney for personalised guidance.',
  outcome: 'conditional',
};

export function getResultMeta(resultKey: string | null): ResultMeta {
  if (!resultKey) return DEFAULT_META;
  // hasOwn, not `in`: a key like "constructor" must not resolve through the
  // object prototype.
  // 1. Exact match
  if (Object.hasOwn(RESULT_META, resultKey)) return RESULT_META[resultKey] as ResultMeta;
  // 2. Strip state prefix: "texas_expungement" → "expungement"
  const withoutPrefix = resultKey.replace(/^[a-z]+_/, '');
  if (Object.hasOwn(RESULT_META, withoutPrefix)) return RESULT_META[withoutPrefix] as ResultMeta;
  // 3. Slug normalisation (case-insensitive, non-alphanumeric stripped)
  const normalised = resultKey.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [key, meta] of Object.entries(RESULT_META)) {
    if (key.toLowerCase() === normalised) return meta;
  }
  return DEFAULT_META;
}
