// Registry documents the caller already parsed: agents name the tools they may use,
// and every name must be in the tools document. Contract: docs/contracts/tool-id.md
// ("Registry documents"). Ported from the predecessor's tool reference check, without
// its directory, its file paths, or its other registries.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkRegistryDocuments, RegistryDocumentError, admitCaller } from '../src/index.mjs';

const agents = () => ({
  agents: [
    { id: 'maintainer', allowedTools: ['docs.file.read', 'docs.file.list'] },
    { id: 'reader' },
  ],
});
const tools = () => ({ tools: [{ id: 'docs.file.read' }, { id: 'docs.file.list' }, { id: 'docs.file.delete' }] });

test('both documents supplied and every named tool listed is ok', () => {
  const result = checkRegistryDocuments({ agents: agents(), tools: tools() });
  assert.deepEqual(result, { ok: true, missing: [], errors: [] });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.missing) && Object.isFrozen(result.errors));
  assert.deepEqual(checkRegistryDocuments({ agents: {}, tools: { tools: [] } }), { ok: true, missing: [], errors: [] });
});

test('an agent that names an unknown tool is an error naming the agent and the tool', () => {
  const doc = agents();
  doc.agents[0].allowedTools.push('docs.file.purge', 'docs.page.read');
  const result = checkRegistryDocuments({ agents: doc, tools: tools() });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.errors, [
    'agents.maintainer: references unknown tool "docs.file.purge".',
    'agents.maintainer: references unknown tool "docs.page.read".',
  ]);
});

test('a document that was not supplied is named in missing as agents or tools, with no path', () => {
  const noAgents = checkRegistryDocuments({ agents: null, tools: tools() });
  assert.deepEqual(noAgents, { ok: false, missing: ['agents'], errors: [] });
  const noTools = checkRegistryDocuments({ agents: agents(), tools: null });
  assert.deepEqual(noTools.missing, ['tools']);
  assert.equal(noTools.ok, false);
  assert.deepEqual(noTools.errors, [                                           // an empty tools document lists nothing
    'agents.maintainer: references unknown tool "docs.file.read".',
    'agents.maintainer: references unknown tool "docs.file.list".',
  ]);
  const neither = checkRegistryDocuments({ agents: null, tools: null });
  assert.deepEqual(neither, { ok: false, missing: ['agents', 'tools'], errors: [] });
  for (const word of neither.missing) {
    assert.doesNotMatch(word, /[/\\.:]|yaml|json/);
  }
});

test('a document that is neither an object nor null throws', () => {
  for (const bad of [undefined, 'agents.yaml', 42, true, [], () => ({})]) {
    assert.throws(() => checkRegistryDocuments({ agents: bad, tools: tools() }), RegistryDocumentError);
    assert.throws(() => checkRegistryDocuments({ agents: agents(), tools: bad }), RegistryDocumentError);
  }
  assert.throws(() => checkRegistryDocuments(), RegistryDocumentError);
  assert.throws(() => checkRegistryDocuments({ agents: 'registries/agents.yaml', tools: null }), (error) => {
    assert.doesNotMatch(error.message, /registries|yaml/);                 // the refusal does not echo a path
    return true;
  });
});

test('malformed entries are errors, never grants', () => {
  const cases = [
    [{ agents: 'maintainer' }, tools(), 'agents: "agents" must be a list of agents.'],
    [agents(), { tools: { id: 'docs.file.read' } }, 'tools: "tools" must be a list of tools.'],
    [{ agents: [{ allowedTools: ['docs.file.read'] }] }, tools(), 'agents.#0: an agent needs a non-empty string id.'],
    [{ agents: [{ id: 'reader' }, { id: 'reader' }] }, tools(), 'agents.reader: listed more than once.'],
    [{ agents: [{ id: 'reader', allowedTools: 'docs.file.read' }] }, tools(), 'agents.reader: allowedTools must be a list of non-empty tool names.'],
    [{ agents: [{ id: 'reader', allowedTools: ['docs.file.read', ''] }] }, tools(), 'agents.reader: allowedTools must be a list of non-empty tool names.'],
    [agents(), { tools: [{ id: 'docs.file.read' }, null, { id: 'docs.file.list' }] }, 'tools.#1: a tool needs a non-empty string id.'],
    [agents(), { tools: [{ id: 'docs.file.read' }, { id: 'docs.file.read' }, { id: 'docs.file.list' }] }, 'tools.docs.file.read: listed more than once.'],
  ];
  for (const [agentsDoc, toolsDoc, error] of cases) {
    const result = checkRegistryDocuments({ agents: agentsDoc, tools: toolsDoc });
    assert.equal(result.ok, false, error);
    assert.ok(result.errors.includes(error), `${error} not in ${JSON.stringify(result.errors)}`);
  }
});

test('nodes, services, policies, and capabilities are not read', () => {
  const result = checkRegistryDocuments({
    agents: { agents: [{ id: 'maintainer', allowedTools: ['docs.file.read'], allowedNodes: ['n'], allowedServices: ['s'], capabilities: ['c'] }] },
    tools: { tools: [{ id: 'docs.file.read', requiresCapabilities: ['c'] }], nodes: [{ id: 'n' }] },
  });
  assert.deepEqual(result, { ok: true, missing: [], errors: [] });
});

test('the check grants nothing, changes nothing, and leaves admitCaller as it was', () => {
  const agentsDoc = agents();
  const toolsDoc = tools();
  const before = JSON.stringify([agentsDoc, toolsDoc]);
  const result = checkRegistryDocuments({ agents: agentsDoc, tools: toolsDoc });
  assert.deepEqual(Object.keys(result).sort(), ['errors', 'missing', 'ok']);
  assert.equal(JSON.stringify([agentsDoc, toolsDoc]), before);
  // docs.file.delete is in the tools document and on no agent's list: listing it grants it to nobody.
  const registry = {
    callers: [{ id: 'maintainer', enabled: true, allowedTools: agentsDoc.agents[0].allowedTools }],
    commands: [{ command: ['docs', 'delete'], toolId: 'docs.file.delete' }],
  };
  assert.equal(admitCaller(registry, { callerId: 'maintainer', command: ['docs', 'delete'] }).code, 'tool-not-allowed');
});

test('the registry-document module reads no file and opens no directory', () => {
  const source = readFileSync(new URL('../src/registry-documents.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b/m);
  assert.doesNotMatch(source, /node:|readFile|readdir|opendir|process\.|fetch\(|require\(/);
});
