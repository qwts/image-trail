import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBadge,
  createButton,
  createCard,
  createIconButton,
  createInput,
  createKbd,
  createSectionHeader,
  createSelect,
  createStatusPill,
  createToast,
  createToggle,
} from '../../extension/src/ui/components/primitives.js';

test('Button and IconButton preserve native semantics and dispatch callbacks', () => {
  let activations = 0;
  const button = createButton({
    label: 'Capture',
    variant: 'primary',
    pressed: false,
    waiting: true,
    fullWidth: true,
    onClick: () => {
      activations += 1;
    },
  });
  button.click();
  assert.equal(button.type, 'button');
  assert.equal(button.dataset['variant'], 'primary');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.ok(button.classList.contains('is-waiting'));
  assert.ok(button.classList.contains('is-full-width'));
  assert.equal(activations, 1);

  const icon = createIconButton({ glyph: '⚙', label: 'Settings', pressed: true });
  assert.equal(icon.type, 'button');
  assert.equal(icon.getAttribute('aria-label'), 'Settings');
  assert.equal(icon.title, 'Settings');
  assert.equal(icon.getAttribute('aria-pressed'), 'true');
});

test('Input supports native text and textarea controls without leaking private values', () => {
  let inputEvents = 0;
  const input = createInput({
    ariaLabel: 'Trail URL',
    type: 'url',
    value: 'https://images.example.test/current.jpg',
    invalid: true,
    onInput: () => {
      inputEvents += 1;
    },
  });
  input.dispatchEvent(new Event('input'));
  assert.equal(input.type, 'url');
  assert.equal(input.value, 'https://images.example.test/current.jpg');
  assert.equal(input.getAttribute('aria-label'), 'Trail URL');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(inputEvents, 1);

  const privateInput = createInput({ ariaLabel: 'Private URL', privacyMasked: true });
  assert.equal(privateInput.value, '');
  assert.equal(privateInput.placeholder, 'Private value hidden');
  assert.ok(privateInput.classList.contains('is-private'));
  assert.doesNotMatch(privateInput.outerHTML, /images\.example\.test/u);

  const textarea = createInput({ ariaLabelledBy: 'notes-label', multiline: true, value: 'Notes', rows: 5 });
  assert.equal(textarea.tagName, 'TEXTAREA');
  assert.equal(textarea.getAttribute('rows'), '5');
  assert.equal(textarea.getAttribute('aria-labelledby'), 'notes-label');
});

test('Select and Toggle use native form state and change events', () => {
  let changes = 0;
  const select = createSelect({
    ariaLabel: 'Fit mode',
    value: 'cover',
    items: [
      { value: 'contain', label: 'Contain' },
      { value: 'cover', label: 'Cover' },
      { value: 'disabled', label: 'Disabled', disabled: true },
    ],
    onChange: () => {
      changes += 1;
    },
  });
  select.value = 'contain';
  select.dispatchEvent(new Event('change'));
  assert.equal(select.value, 'contain');
  assert.equal(select.options.length, 3);
  assert.equal(select.options[2]?.disabled, true);
  assert.equal(changes, 1);

  const toggle = createToggle({
    label: 'Privacy mode',
    checked: true,
    onChange: () => {
      changes += 1;
    },
  });
  const checkbox = toggle.querySelector('input');
  assert.ok(checkbox);
  assert.equal(checkbox.type, 'checkbox');
  assert.equal(checkbox.checked, true);
  assert.equal(toggle.textContent, 'Privacy mode');
  checkbox.dispatchEvent(new Event('change'));
  assert.equal(changes, 2);
});

test('feedback primitives expose semantic state without privacy-sensitive copy', () => {
  const badge = createBadge({ label: 'Encrypted', tone: 'encryption', uppercase: true });
  const pill = createStatusPill({ label: 'Loading', tone: 'busy', waiting: true });
  const kbd = createKbd('⌘ C');
  const toast = createToast({ message: 'Captured original.', tone: 'success' });
  const privateToast = createToast({ privacyMasked: true, tone: 'error' });

  assert.equal(badge.dataset['tone'], 'encryption');
  assert.ok(badge.classList.contains('is-uppercase'));
  assert.equal(pill.getAttribute('role'), 'status');
  assert.equal(pill.getAttribute('aria-live'), 'polite');
  assert.equal(kbd.tagName, 'KBD');
  assert.equal(toast.getAttribute('role'), 'status');
  assert.equal(privateToast.getAttribute('role'), 'alert');
  assert.equal(privateToast.textContent, 'ErrorImage Trail needs attention.');
  assert.doesNotMatch(privateToast.outerHTML, /https?:/u);
});

test('Card and SectionHeader compose content and dispatch existing callbacks', () => {
  let actions = 0;
  const action = createButton({ label: 'Refresh' });
  const header = createSectionHeader({
    title: 'Queue',
    actions: [action],
    collapsible: true,
    open: false,
    onToggle: () => {
      actions += 1;
    },
    detachable: true,
    onDetach: () => {
      actions += 1;
    },
  });
  const card = createCard({ children: [header], tone: 'encryption', ariaLabel: 'Queue card' });

  assert.equal(card.getAttribute('role'), 'group');
  assert.equal(card.getAttribute('aria-label'), 'Queue card');
  assert.equal(card.dataset['tone'], 'encryption');
  assert.equal(header.querySelector('h3')?.textContent, 'Queue');
  assert.equal(header.querySelector('[aria-expanded]')?.getAttribute('aria-expanded'), 'false');
  header.querySelector<HTMLButtonElement>('[aria-label="Detach Queue"]')?.click();
  header.querySelector<HTMLButtonElement>('[aria-expanded]')?.click();
  assert.equal(actions, 2);
});
