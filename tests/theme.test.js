import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
function browser({ saved, dark = false, blocked = false } = {}) {
  const listeners = {}, system = { matches: dark, addEventListener: (event, handler) => { listeners[event] = handler; } };
  const root = { dataset: {}, style: {} }, meta = {}, storage = new Map(saved ? [['flamingo-appearance', saved]] : []);
  const buttons = ['light', 'dark', 'system'].map(value => ({ dataset: { themePreference: value }, setAttribute(name, value) { this[name] = value; } }));
  const window = { matchMedia: () => system, addEventListener: (event, handler) => { listeners[event] = handler; } };
  runInNewContext(source, {
    window,
    document: { documentElement: root, querySelector: () => ({ setAttribute: (name, value) => { meta[name] = value; } }), querySelectorAll: () => buttons },
    localStorage: { getItem: key => { if (blocked) throw new Error('Storage blocked'); return storage.get(key); }, setItem: (key, value) => { if (blocked) throw new Error('Storage blocked'); storage.set(key, value); } }
  });
  return { window, root, meta, buttons, system, listeners, storage };
}

test('appearance follows the device until a manual mode is selected', () => {
  const b = browser({ dark: true });
  assert.equal(b.root.dataset.theme, 'dark');
  b.system.matches = false; b.listeners.change();
  assert.equal(b.root.dataset.theme, 'light');
  b.window.FlamingoTheme.set('dark');
  b.listeners.change();
  assert.equal(b.root.dataset.theme, 'dark');
  assert.equal(b.meta.content, '#21151c');
  assert.equal(b.buttons.find(button => button.dataset.themePreference === 'dark')['aria-pressed'], 'true');
  assert.equal(b.buttons.filter(button => button['aria-pressed'] === 'true').length, 1);
});

test('saved selection is restored before the interface loads', () => {
  const b = browser({ saved: 'light', dark: true });
  assert.equal(b.root.dataset.theme, 'light');
  assert.equal(b.root.style.colorScheme, 'light');
  b.window.FlamingoTheme.set('dark');
  assert.equal(browser({ saved: b.storage.get('flamingo-appearance') }).root.dataset.theme, 'dark');
});

test('appearance still changes when browser storage is blocked', () => {
  const b = browser({ blocked: true });
  b.window.FlamingoTheme.set('dark');
  assert.equal(b.root.dataset.theme, 'dark');
  b.window.FlamingoTheme.set('system');
  assert.equal(b.root.dataset.theme, 'light');
});

test('other tabs and cleared preferences are reflected without rerendering forms', () => {
  const b = browser();
  b.listeners.storage({ key: 'flamingo-appearance', newValue: 'dark' });
  assert.equal(b.root.dataset.theme, 'dark');
  b.listeners.storage({ key: null, newValue: null });
  assert.equal(b.window.FlamingoTheme.preference, 'system');
  assert.equal(b.root.dataset.theme, 'light');
  b.listeners.storage({ key: 'unrelated', newValue: 'dark' });
  assert.equal(b.root.dataset.theme, 'light');
});

test('invalid saved modes cannot change the supported palette', () => {
  const b = browser({ saved: 'unknown', dark: true });
  b.window.FlamingoTheme.set('unknown');
  assert.equal(b.window.FlamingoTheme.preference, 'system');
  assert.equal(b.root.dataset.theme, 'dark');
});
