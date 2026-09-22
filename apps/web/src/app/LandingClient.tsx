'use client';

import { ChatIcon, ScaleIcon } from '@/components/icons';
import Link from 'next/link';
import { useState } from 'react';
import { formatStateName } from './LandingClient.utils';
import {
  ContentCard,
  DisclaimerText,
  FieldGroup,
  FieldLabel,
  Headline,
  HeroSection,
  Highlight,
  LogoBadge,
  ModeBadge,
  ModeCard,
  ModeCards,
  ModeDescription,
  ModeIconWrapper,
  ModeTitle,
  PageFooter,
  StateSelect,
  Subheading,
  Wordmark,
  WordmarkText,
} from './page.styles';

interface Props {
  states: string[];
}

export default function LandingClient({ states }: Props) {
  const [selectedState, setSelectedState] = useState('');

  return (
    <HeroSection>
      <ContentCard>
        <Wordmark>
          <LogoBadge aria-hidden="true">
            <ScaleIcon size={22} color="white" />
          </LogoBadge>
          <WordmarkText>ClearSlate</WordmarkText>
        </Wordmark>

        <Headline>
          Find out if you qualify for <Highlight>record relief</Highlight>
        </Headline>

        <Subheading>
          Answer a few guided questions or describe your situation to our AI agent. We&apos;ll walk
          you through whether your record qualifies for expungement, sealing, or other relief — in
          plain English.
        </Subheading>

        <FieldGroup>
          <FieldLabel htmlFor="state-select">Select your state</FieldLabel>
          <StateSelect
            id="state-select"
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            aria-label="State"
          >
            <option value="">— Choose a state —</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {formatStateName(s)}
              </option>
            ))}
          </StateSelect>
        </FieldGroup>

        <ModeCards $visible={Boolean(selectedState)} aria-hidden={!selectedState}>
          <ModeCard
            as={Link}
            href={selectedState ? `/intake/${selectedState}/quick` : '#'}
            $disabled={!selectedState}
            aria-disabled={!selectedState}
          >
            <ModeIconWrapper aria-hidden="true">
              <ScaleIcon size={22} color="var(--color-blue-400)" />
            </ModeIconWrapper>
            <ModeTitle>Quick Form</ModeTitle>
            <ModeDescription>
              Answer a short series of yes/no questions. Takes about 2 minutes.
            </ModeDescription>
            <ModeBadge>Recommended</ModeBadge>
          </ModeCard>

          <ModeCard
            as={Link}
            href={selectedState ? `/intake/${selectedState}/talk` : '#'}
            $disabled={!selectedState}
            aria-disabled={!selectedState}
          >
            <ModeIconWrapper aria-hidden="true">
              <ChatIcon size={22} color="var(--color-blue-400)" />
            </ModeIconWrapper>
            <ModeTitle>Talk to Agent</ModeTitle>
            <ModeDescription>
              Describe your situation in your own words. Our AI will guide you through.
            </ModeDescription>
            <ModeBadge>AI-powered</ModeBadge>
          </ModeCard>
        </ModeCards>
      </ContentCard>

      <PageFooter>
        <DisclaimerText>
          This tool provides general information only and is not legal advice. For guidance specific
          to your situation, consult a licensed attorney.
        </DisclaimerText>
      </PageFooter>
    </HeroSection>
  );
}
