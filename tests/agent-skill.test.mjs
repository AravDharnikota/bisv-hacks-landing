// Checks the Agent Skills discovery index (agentskills.io discovery v0.2.0). Run: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ROOT, SITE } from '../tools/agent-files.mjs';

const read = f => readFileSync(join(ROOT, f), 'utf8');
const index = JSON.parse(read('.well-known/agent-skills/index.json'));

test('index declares the v0.2.0 schema and lists skills', () => {
  assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
  assert.ok(Array.isArray(index.skills) && index.skills.length > 0);
});

for (const skill of index.skills) {
  test(`skill ${skill.name}: fields, file, name, and digest match`, () => {
    assert.match(skill.name, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'name is lowercase words joined by hyphens');
    assert.ok(skill.name.length <= 64);
    assert.equal(skill.type, 'skill-md');
    assert.ok(skill.description.length > 0 && skill.description.length <= 1024);
    assert.equal(skill.url, `${SITE}/.well-known/agent-skills/${skill.name}/SKILL.md`);

    const file = skill.url.slice(SITE.length + 1);
    assert.ok(existsSync(join(ROOT, file)), `${file} exists`);
    const bytes = readFileSync(join(ROOT, file));
    assert.equal(skill.digest, 'sha256:' + createHash('sha256').update(bytes).digest('hex'), 'digest is the SHA-256 of SKILL.md; recompute it after any edit');

    const front = bytes.toString('utf8').match(/^---\nname: (.+)\ndescription: (.+)\n---\n/);
    assert.ok(front, 'SKILL.md starts with name and description frontmatter');
    assert.equal(front[1], skill.name);
    assert.equal(front[2], skill.description);
  });
}

test('every link in the skill points at a file that exists on the site', () => {
  const md = read('.well-known/agent-skills/bisv-hacks/SKILL.md');
  for (const [, path] of md.matchAll(/https:\/\/bisvhacks\.com\/([^\s)]+)/g)) {
    assert.ok(existsSync(join(ROOT, path)), `${path} exists`);
  }
});

test('llms.txt links the skill index', () => {
  assert.match(read('llms.txt'), /\(https:\/\/bisvhacks\.com\/\.well-known\/agent-skills\/index\.json\)/);
});

test('.nojekyll is present so GitHub Pages serves .well-known', () => {
  assert.ok(existsSync(join(ROOT, '.nojekyll')));
});
