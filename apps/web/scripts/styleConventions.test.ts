import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findStyleViolations } from './styleConventions.js';

const STYLES = 'src/app/thing.styles.ts';
const rules = (path: string, source: string) =>
  findStyleViolations(path, source).map((v) => v.rule);

describe('missing-use-client', () => {
  const passing: Array<[string, string]> = [
    ['single quotes with semicolon', "'use client';\nimport x from 'y';\n"],
    ['double quotes with semicolon', '"use client";\nimport x from "y";\n'],
    ['no semicolon', "'use client'\nimport x from 'y'\n"],
    ['after a license block comment', "/* License */\n'use client';\nimport x from 'y';\n"],
    ['after a line comment', "// header\n'use client';\n"],
    ['after a BOM', "\uFEFF'use client';\n"],
    ['followed by a trailing line comment', "'use client' // nonce registry\nimport x from 'y'\n"],
    ['followed by a trailing block comment', "'use client' /* nonce registry */\n"],
  ];
  for (const [name, source] of passing) {
    it(`accepts a styles file with the directive: ${name}`, () => {
      assert.deepEqual(rules(STYLES, source), []);
    });
  }

  const failing: Array<[string, string]> = [
    ['no directive', "import styled from 'styled-components';\n"],
    ['directive after an import', "import x from 'y';\n'use client';\n"],
    ['use server instead', "'use server';\nimport x from 'y';\n"],
    ['directive only inside a comment', "// 'use client';\nimport x from 'y';\n"],
    ['directive inside a block comment', "/* 'use client'; */\nimport x from 'y';\n"],
    ['use client in a template literal', "`'use client'`;\nimport x from 'y';\n"],
  ];
  for (const [name, source] of failing) {
    it(`reports a styles file without a leading directive: ${name}`, () => {
      const violations = findStyleViolations(STYLES, source);
      assert.deepEqual(
        violations.map((v) => [v.rule, v.line]),
        [['missing-use-client', 1]],
      );
    });
  }

  it('applies to .styles.tsx files', () => {
    assert.deepEqual(rules('src/a.styles.tsx', 'export {};\n'), ['missing-use-client']);
  });

  it('never applies to non-styles files', () => {
    assert.deepEqual(
      rules('src/app/Page.tsx', 'export default function P() { return null; }\n'),
      [],
    );
  });
});

describe('inline-style-prop', () => {
  it('reports style={{...}} with its line number', () => {
    const source = 'const a = 1;\nconst b = <div style={{ color: "red" }} />;\n';
    assert.deepEqual(
      findStyleViolations('src/A.tsx', source).map((v) => [v.rule, v.line]),
      [['inline-style-prop', 2]],
    );
  });

  it('reports style = {x} with spaces around the equals sign', () => {
    assert.deepEqual(rules('src/A.tsx', 'const b = <div style = {x} />;\n'), ['inline-style-prop']);
  });

  it('reports violations on consecutive lines', () => {
    const source = '<a style={{}} />\n<b style={{}} />\n';
    assert.deepEqual(
      findStyleViolations('src/A.tsx', source).map((v) => v.line),
      [1, 2],
    );
  });

  it('applies to styles files too', () => {
    assert.deepEqual(rules(STYLES, "'use client';\nconst a = <i style={{}} />;\n"), [
      'inline-style-prop',
    ]);
  });

  it('ignores declaration files', () => {
    assert.deepEqual(rules('src/types.d.ts', 'style={{}}\n'), []);
  });

  it('ignores lookalike props and identifiers', () => {
    assert.deepEqual(rules('src/A.tsx', '<A styleProps={{ a: 1 }} />\n<StyledWrapper />\n'), []);
  });
});

describe('inline-style-tag', () => {
  it('reports a bare <style> tag', () => {
    assert.deepEqual(rules('src/A.tsx', '<style>{css}</style>\n'), ['inline-style-tag']);
  });

  it('reports a <style> tag with attributes', () => {
    assert.deepEqual(rules('src/A.tsx', '<style nonce={n}>{css}</style>\n'), ['inline-style-tag']);
  });

  it('ignores styled-components usage', () => {
    const source = 'const W = styled.div<Props>`color: red;`;\n<StyledWrapper>x</StyledWrapper>\n';
    assert.deepEqual(rules('src/A.tsx', source), []);
  });
});
