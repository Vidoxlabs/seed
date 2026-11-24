import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

import { parseToolId } from '../src/tool-id.mjs';

const root = resolve(import.meta.dirname, '..');
const capabilityDir = 'docs/capabilities';
const family = new Set(['docs', 'seed', 'capillary', 'myosotis', 'aestivation', 'drosera', 'trellis', 'bloom']);
const statusClaims = new Map([
  ['proposed', ['planned']],
  ['accepted', ['planned', 'specified']],
  ['in-progress', ['planned', 'specified']],
  ['landed', ['implemented', 'observed']],
  ['deferred', ['planned', 'specified']],
]);
const specSections = [
  'Why', 'What it does', 'Contract touchpoints', 'Tool IDs and events', 'Acceptance tests',
  'Slices', 'Non-goals', 'Family rules and conflicts', 'Open owner decisions', 'Evidence', 'Changes',
];

function localFile(relativePath) {
  const parts = relativePath.split('/');
  assert.ok(parts.every(part => /^[a-z0-9_.-]+$/i.test(part) && part !== '.' && part !== '..'),
    'evidence and contract paths must be relative to this checkout');
  let file = root;
  for (const part of parts) {
    file = join(file, part);
    assert.ok(!lstatSync(file).isSymbolicLink(), 'document and evidence paths cannot follow links');
  }
  assert.ok(lstatSync(file).isFile(), 'document and evidence paths must name files');
  return file;
}

function read(relativePath) {
  return readFileSync(localFile(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function expectKeys(record, expected, label) {
  assert.deepEqual(Object.keys(record).sort(), [...expected].sort(), label);
}

const index = JSON.parse(read(`${capabilityDir}/index.json`));
const leads = index.entries.filter(entry => entry.role === 'lead');

test('index-parses-with-known-fields-only', () => {
  expectKeys(index, ['version', 'repo', 'entries'], 'index fields');
  assert.equal(index.version, 1);
  assert.ok(Array.isArray(index.entries) && index.entries.length > 0);
  const listFields = ['toolIds', 'contracts', 'tests', 'prs', 'commits', 'adr'];
  for (const entry of index.entries) {
    expectKeys(entry, ['id', 'role', 'status', 'claim', 'spec', 'slices', 'decision', 'updated', ...listFields], entry.id);
    assert.match(entry.id, /^CAP-\d{2}$/);
    assert.ok(['lead', 'touches'].includes(entry.role), entry.id);
    assert.match(entry.updated, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.decision === null || typeof entry.decision === 'string', entry.id);
    for (const field of listFields) {
      assert.ok(Array.isArray(entry[field]) && entry[field].every(value => typeof value === 'string'), `${entry.id} ${field}`);
    }
    assert.ok(Array.isArray(entry.slices), entry.id);
    for (const slice of entry.slices) {
      expectKeys(slice, ['id', 'title', 'milestone', 'status'], slice.id);
      assert.ok(typeof slice.title === 'string' && slice.title.trim(), slice.id);
    }
  }
});

test('repo-field-matches-package', () => {
  assert.ok(family.has(index.repo));
  assert.equal(index.repo, JSON.parse(read('package.json')).name.split('/').at(-1));
});

test('status-claim-pairing-holds', () => {
  for (const entry of index.entries) {
    assert.ok(statusClaims.get(entry.status)?.includes(entry.claim), entry.id);
    for (const slice of entry.slices) assert.ok(statusClaims.has(slice.status), slice.id);
  }
});

test('landed-has-tests-prs-and-commits', () => {
  for (const id of ['CAP-01', 'CAP-02']) {
    const entry = index.entries.find(candidate => candidate.id === id);
    assert.equal(entry?.status, 'landed', `${id} must record the local scaffold or self-test as landed`);
    assert.ok(entry.slices.length > 0 && entry.slices.every(slice => slice.status === 'landed'), id);
  }
  for (const entry of index.entries) {
    for (const commit of entry.commits) assert.match(commit, /^[a-f0-9]{40}$/, entry.id);
    for (const pr of entry.prs) {
      const match = /^([a-z]+)#[1-9]\d*$/.exec(pr);
      assert.ok(match && family.has(match[1]), entry.id);
    }
    if (entry.status !== 'landed') continue;
    assert.ok(entry.tests.length && entry.prs.length, entry.id);
    // The most recent squash SHA is backfilled when the repository is next touched.
    assert.ok(entry.commits.length >= entry.prs.length - 1, `${entry.id} is missing an earlier squash SHA`);
    for (const path of entry.tests) localFile(path);
  }
});

test('lead-paths-exist', () => {
  for (const entry of leads) {
    assert.match(entry.spec, new RegExp(`^${capabilityDir}/${entry.id}-[a-z0-9-]+\\.md$`));
    localFile(entry.spec);
  }
  for (const entry of index.entries) {
    for (const path of entry.contracts) localFile(path);
  }
});

test('touches-spec-uses-cross-repo-form', () => {
  for (const entry of index.entries.filter(entry => entry.role === 'touches')) {
    const match = new RegExp(`^([a-z]+)/${capabilityDir}/${entry.id}-[a-z0-9-]+\\.md$`).exec(entry.spec);
    assert.ok(match && family.has(match[1]) && match[1] !== index.repo, entry.id);
  }
});

test('every-slice-has-a-milestone', () => {
  for (const entry of index.entries) {
    for (const slice of entry.slices) assert.match(slice.milestone, /^M[0-9]$/, slice.id);
  }
});

test('lead-spec-header-matches-index', () => {
  for (const entry of leads) {
    const header = read(entry.spec).split(/^## /m, 1)[0];
    assert.ok(header.startsWith(`# ${entry.id}: `), entry.id);
    const milestone = entry.slices.map(slice => slice.milestone).sort()[0];
    const fields = { ID: entry.id, Lead: index.repo, Status: entry.status, Claim: entry.claim, Milestone: milestone };
    for (const [key, value] of Object.entries(fields)) {
      const field = header.split('\n').find(line => line.startsWith(`- ${key}: `));
      assert.ok(field?.startsWith(`- ${key}: \`${value}\``), `${entry.id} ${key}`);
    }
  }
});

test('accepted-and-deferred-cite-a-decision', () => {
  for (const entry of index.entries) {
    if (['accepted', 'deferred'].includes(entry.status) || entry.slices.some(slice => ['accepted', 'deferred'].includes(slice.status))) {
      assert.match(entry.decision, /^D-\d{8}-\d{2}$/, entry.id);
    }
  }
});

test('slice-ids-belong-to-entry', () => {
  assert.equal(new Set(index.entries.map(entry => entry.id)).size, index.entries.length);
  for (const entry of index.entries) {
    const pattern = new RegExp(`^${entry.id}\\.[1-9]\\d*$`);
    for (const slice of entry.slices) assert.match(slice.id, pattern);
    assert.equal(new Set(entry.slices.map(slice => slice.id)).size, entry.slices.length, entry.id);
  }
});

test('tool-ids-pass-grammar', () => {
  for (const entry of index.entries) {
    for (const id of entry.toolIds) parseToolId(id);
  }
  for (const entry of leads) {
    const [, section] = read(entry.spec).split(/^### Tool IDs[ \t]*$/m);
    assert.ok(section, entry.id);
    const table = section.split(/^#{2,3} /m, 1)[0];
    const [header, divider, ...rows] = [...table.matchAll(/^\|([^|]*)\|/gm)].map(row => row[1].trim());
    assert.equal(header, 'Tool ID', entry.id);
    assert.match(divider ?? '', /^:?-{3,}:?$/, entry.id);
    for (const row of rows) {
      const id = row.replace(/^`(.*)`$/, '$1');
      if (id !== 'none') parseToolId(id);
    }
  }
});

test('no-em-dash-or-prompt-labels-in-capability-docs', () => {
  for (const name of readdirSync(join(root, capabilityDir))) {
    if (!/\.(md|json)$/.test(name)) continue;
    const text = read(`${capabilityDir}/${name}`);
    assert.doesNotMatch(text, /\u2014/, name);
    assert.doesNotMatch(text, /Part [ABC]\b|\bC[0-5]\b|\bstep \d+\b/, name);
  }
});

test('lead-spec-sections-follow-the-template', () => {
  for (const entry of leads) {
    const text = read(entry.spec);
    assert.deepEqual([...text.matchAll(/^## (.+)$/gm)].map(match => match[1]), specSections, entry.id);
    const [, toolsAndEvents] = text.split(/^## Tool IDs and events$/m);
    const subheadings = toolsAndEvents.split(/^## /m, 1)[0].matchAll(/^### (.+)$/gm);
    assert.deepEqual([...subheadings].map(match => match[1]), ['Tool IDs', 'Events'], entry.id);
  }
});

test('changelog-follows-the-family-convention', () => {
  const changelog = read('docs/CHANGELOG.md');
  assert.match(changelog, /^# Changelog\n\nEarlier[^\n]+\n\n## Unreleased(?:\n|$)/);
  const [, afterUnreleased] = changelog.split(/^## Unreleased$/m);
  const unreleased = afterUnreleased.split(/^## /m, 1)[0].trim();
  if (!unreleased) return;
  const [intro, ...sections] = unreleased.split(/^### /m);
  assert.equal(intro, '');
  const order = ['Added', 'Changed', 'Fixed', 'Removed'];
  let previous = -1;
  for (const section of sections) {
    const [title, ...lines] = section.trim().split('\n');
    const position = order.indexOf(title);
    assert.ok(position > previous, 'changelog subsections follow the prescribed order');
    previous = position;
    const bullets = lines.filter(line => line.trim());
    assert.ok(bullets.length > 0, 'changelog subsections must contain an entry');
    for (const line of bullets) assert.match(line, /^- .+ \(CAP-\d{2}, [a-z]+#[1-9]\d*\)\.?$/);
  }
});

test('adr-convention-pointer-exists', () => {
  assert.ok(read('docs/adr/README.md').trim());
});
