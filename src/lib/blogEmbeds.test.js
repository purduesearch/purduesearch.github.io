import { providersIn, initBlogEmbeds } from './blogEmbeds';

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

const IG = '<div class="cpm-blog-embed" data-embed-url="https://www.instagram.com/p/ABC/">'
  + '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/ABC/" data-instgrm-version="14">'
  + '<a href="https://www.instagram.com/p/ABC/"></a></blockquote></div>';

const TWEET = '<div class="cpm-blog-embed" data-embed-url="https://x.com/a/status/1">'
  + '<blockquote class="twitter-tweet"><a href="https://x.com/a/status/1"></a></blockquote></div>';

const YT = '<div class="cpm-blog-embed"><iframe src="https://www.youtube.com/embed/aaaaaaaaaaa"></iframe></div>';

afterEach(() => {
  document.body.innerHTML = '';
  delete window.instgrm;
  delete window.twttr;
});

const scripts = (id) => document.querySelectorAll(`script#${id}`);

test('detects which provider widgets a rendered post needs', () => {
  expect(providersIn(mount(IG))).toEqual(['instagram']);
  expect(providersIn(mount(TWEET))).toEqual(['twitter']);
  expect(providersIn(mount(YT))).toEqual([]);
});

test('injects the Instagram widget script for an instagram-media blockquote', () => {
  initBlogEmbeds(mount(IG));
  expect(scripts('instagram-embed-js')).toHaveLength(1);
  expect(scripts('instagram-embed-js')[0].src).toBe('https://www.instagram.com/embed.js');
});

const flush = () => new Promise((r) => setTimeout(r, 0));

test('processes the blockquote once the widget script loads', async () => {
  const process = jest.fn();
  initBlogEmbeds(mount(IG));
  const script = scripts('instagram-embed-js')[0];
  window.instgrm = { Embeds: { process } };
  script.dispatchEvent(new Event('load'));
  await flush();
  expect(process).toHaveBeenCalled();
});

test('processes immediately when the widget script is already loaded', async () => {
  const process = jest.fn();
  window.instgrm = { Embeds: { process } };
  const pre = document.createElement('script');
  pre.id = 'instagram-embed-js';
  document.body.appendChild(pre);

  initBlogEmbeds(mount(IG));
  await flush();

  expect(scripts('instagram-embed-js')).toHaveLength(1);
  expect(process).toHaveBeenCalled();
});

test('never injects a widget script a post does not need', () => {
  initBlogEmbeds(mount(YT));
  expect(scripts('instagram-embed-js')).toHaveLength(0);
  expect(scripts('twitter-wjs')).toHaveLength(0);
});
