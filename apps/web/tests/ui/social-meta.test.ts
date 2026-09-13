import assert from 'node:assert/strict';
import { test } from 'node:test';
import { socialMeta } from '../../app/lib/social-meta';

const context = { matches: [{ id: 'root', loaderData: { origin: 'https://micro.example', locale: 'en' } }], location: { pathname: '/posts/example', search: '?seed=123&cutoff=now&user_code=PRIVATE&lang=en' } };
const value = (tags: ReturnType<typeof socialMeta>, key: string) => tags.find(tag => ('property' in tag && tag.property === key) || ('name' in tag && tag.name === key));
test('social previews use absolute public URLs without browsing or authorization parameters', () => {
  const tags = socialMeta(context, { title: 'A personal setup — My Micro', description: 'My shortcuts' });
  assert.deepEqual(value(tags, 'og:url'), { property: 'og:url', content: 'https://micro.example/posts/example' });
  assert.deepEqual(value(tags, 'og:image'), { property: 'og:image', content: 'https://micro.example/social/my-micro.png' });
  assert.deepEqual(value(tags, 'twitter:card'), { name: 'twitter:card', content: 'summary_large_image' });
  assert.deepEqual(value(tags, 'og:title'), { property: 'og:title', content: 'A personal setup — My Micro' });
  assert(!JSON.stringify(tags).includes('PRIVATE'));
});
test('Japanese links retain language and unavailable posts do not advertise a preview', () => {
  const tags = socialMeta({ ...context, matches: [{ id: 'root', loaderData: { origin: 'https://micro.example', locale: 'ja' } }], location: { ...context.location, search: '?lang=ja&cursor=secret' } });
  assert.deepEqual(value(tags, 'og:url'), { property: 'og:url', content: 'https://micro.example/posts/example?lang=ja' });
  assert.deepEqual(value(tags, 'og:locale'), { property: 'og:locale', content: 'ja_JP' });
  const missing = socialMeta(context, { unavailable: true });
  assert.equal(value(missing, 'og:image'), undefined);
  assert.deepEqual(value(missing, 'robots'), { name: 'robots', content: 'noindex' });
});
