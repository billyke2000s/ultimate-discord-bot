const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MessageFlags } = require('discord.js');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'music-normalization-'));
process.env.DATA_DIR = dataDir;
const { db, getSettings } = require('../src/lib/db');
const { GuildQueue } = require('../src/lib/music');
const musicCommands = require('../src/commands/music');
const command = musicCommands.commands.find((c) => c.data.name === 'musicsettings');

after(() => {
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function interaction({ guildId = 'test', userId = 'owner', ownerId = 'owner', state = 'on', queue = null } = {}) {
  let reply;
  return {
    guildId,
    guild: { ownerId },
    user: { id: userId },
    options: { getString: (key) => (key === 'state' ? state : null) },
    client: { music: { get: () => queue } },
    reply: async (value) => {
      reply = value;
    },
    response: () => reply,
  };
}

test('normalization is off by default, and only Discord guild owner can change it', async () => {
  assert.equal(getSettings('owner-check').music.normalization, false);
  let calls = 0;
  const queue = {
    normalizationEnabled: false,
    setNormalization: async () => {
      calls++;
    },
  };
  const admin = interaction({ guildId: 'owner-check', userId: 'admin', queue });
  await command.execute(admin);
  assert.equal(admin.response().flags, MessageFlags.Ephemeral);
  assert.match(admin.response().content, /Only the actual server owner/);
  assert.equal(calls, 0);
  assert.equal(getSettings('owner-check').music.normalization, false);

  const owner = interaction({ guildId: 'owner-check', queue });
  await command.execute(owner);
  assert.equal(calls, 1);
  assert.equal(getSettings('owner-check').music.normalization, true);
  assert.match(owner.response().content, /on/);

  owner.options.getString = () => 'off';
  await command.execute(owner);
  assert.equal(calls, 2);
  assert.equal(getSettings('owner-check').music.normalization, false);
});

test('active queue receives peak filter immediately, and off removes it', async () => {
  const calls = [];
  const queue = {
    player: { setFilters: async (filters) => calls.push(filters) },
    normalizationEnabled: false,
    refreshPanel() {},
  };
  await GuildQueue.prototype.setNormalization.call(queue, true);
  assert.equal(queue.normalizationEnabled, true);
  assert.deepEqual(calls[0], {
    pluginFilters: { normalization: { maxAmplitude: 0.45, adaptive: true } },
  });
  await GuildQueue.prototype.setNormalization.call(queue, false);
  assert.equal(queue.normalizationEnabled, false);
  assert.deepEqual(calls[1], { pluginFilters: {} });
});

test('Lavalink filter errors do not save a setting or pretend the change succeeded', async () => {
  const q = {
    normalizationEnabled: false,
    setNormalization: async () => {
      throw new Error('filter not installed');
    },
  };
  const i = interaction({ guildId: 'apply-failure', queue: q });
  await command.execute(i);
  assert.equal(getSettings('apply-failure').music.normalization, false);
  assert.match(i.response().content, /Could not apply normalization/);
  assert.equal(i.response().flags, MessageFlags.Ephemeral);
});

test('disabled by default after restart-compatible settings merge; command is a required on/off choice', () => {
  assert.equal(getSettings('fresh-guild').music.normalization, false);
  const data = command.data.toJSON();
  const option = data.options.find((o) => o.name === 'normalization').options[0];
  assert.deepEqual(
    option.choices.map((x) => x.value),
    ['on', 'off'],
  );
  assert.equal(option.required, true);
});
