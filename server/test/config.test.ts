import assert from 'node:assert/strict';
import test from 'node:test';
import { readConfig } from '../src/config.js';

test('porta padrão 8030 e bind fixo em 127.0.0.1', () => {
  const config = readConfig({});
  assert.equal(config.port, 8030);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.dataDir, 'data');
});

test('PORT vem do ambiente e HOST diferente é recusado', () => {
  assert.equal(readConfig({ PORT: '9000' }).port, 9000);
  assert.throws(() => readConfig({ PORT: '0' }), /PORT inválida/);
  assert.throws(() => readConfig({ PORT: 'abc' }), /PORT inválida/);
  assert.throws(() => readConfig({ HOST: '0.0.0.0' }), /127\.0\.0\.1/);
  assert.equal(readConfig({ HOST: '127.0.0.1', DATA_DIR: 'tmp/rank' }).dataDir, 'tmp/rank');
});
