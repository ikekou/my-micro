import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestLocale, localHref, safeReturnPath } from '../../app/lib/i18n';
import { sharePrompt, managePrompt } from '../../app/lib/prompts';

test('a sign-in return path preserves the device code but rejects external redirects', () => {
  const device = '/device?user_code=ABCD-EFGH&lang=ja';
  assert.equal(safeReturnPath(device), device);
  for (const value of ['https://attacker.invalid', '//attacker.invalid', '/\\attacker.invalid', '/\n/attacker.invalid', '/\t/attacker.invalid']) {
    assert.equal(safeReturnPath(value), '/me/posts');
  }
});

test('language defaults to English and preserves explicit choices and browsing state', () => {
  const headers = { Cookie: 'my-micro-lang=en', 'Accept-Language': 'ja-JP,en;q=0.8' };
  assert.equal(requestLocale(new Request('https://example.invalid/?lang=ja', { headers })), 'ja');
  assert.equal(requestLocale(new Request('https://example.invalid/', { headers })), 'en');
  assert.equal(requestLocale(new Request('https://example.invalid/', { headers: { 'Accept-Language': 'ja-JP' } })), 'en');
  assert.equal(requestLocale(new Request('https://example.invalid/')), 'en');
  assert.equal(requestLocale(new Request('https://example.invalid/', { headers: { Cookie: 'my-micro-lang=ja' } })), 'ja');
  const link = new URL(localHref('/?seed=123&cutoff=2026-09-12T00%3A00%3A00Z&q=scroll#main', 'en'), 'https://example.invalid');
  assert.equal(link.searchParams.get('seed'), '123');
  assert.equal(link.searchParams.get('q'), 'scroll');
  assert.equal(link.searchParams.get('lang'), 'en');
  assert.equal(link.hash, '#main');
});

test('copy prompts name the current service, exact target and public confirmation', () => {
  for (const locale of ['en', 'ja'] as const) {
    const share = sharePrompt(locale, 'https://micro.example');
    assert(share.includes('https://micro.example'));
    assert(share.includes('https://github.com/ikekou/my-micro'));
    assert(share.includes(locale === 'ja' ? '私が確認してから' : 'only after I confirm'));
    for (const operation of ['update', 'delete'] as const) {
      const manage = managePrompt(locale, 'https://micro.example/posts/exact-id', operation);
      assert(manage.includes('https://micro.example/posts/exact-id'));
      assert(manage.includes(locale === 'ja' ? '私が確認してから' : 'only after I confirm'));
    }
  }
});
