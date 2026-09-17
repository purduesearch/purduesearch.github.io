// Phase 3 browser checks against production React components + fixture API.
// Touch/viewport emulation is useful regression evidence, never a real-device pass.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '../evidence/phase3');
const APP = process.env.APP_URL || 'http://localhost:3000';
const API = process.env.FIXTURE_URL || 'http://localhost:3001';
fs.mkdirSync(OUT, { recursive: true });

const checks = [];
const screenshots = [];
const consoleErrors = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
}
async function fixture(query) { return (await fetch(`${API}/__fixture/${query}`)).json(); }
async function setViewport(client, width, height, mobile = true) {
  await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await client.send('Emulation.setTouchEmulationEnabled', mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await client.send('Emulation.setEmulatedMedia', { features: mobile
    ? [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }]
    : [{ name: 'pointer', value: 'fine' }, { name: 'hover', value: 'hover' }] });
}
async function go(client, url, waitMs = 1300) {
  await client.send('Page.navigate', { url: 'about:blank' });
  await sleep(100);
  await client.send('Page.navigate', { url });
  for (let i = 0; i < 60; i += 1) {
    await sleep(150);
    if (await client.eval(`document.readyState === 'complete' && !!document.querySelector('.pm-shell')`).catch(() => false)) break;
  }
  await sleep(waitMs);
}
async function click(client, selector) {
  const ok = await client.eval(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)return false; el.scrollIntoView({block:'nearest'}); el.click(); return true; })()`);
  if (!ok) throw new Error(`Missing ${selector}`);
  await sleep(500);
}
async function fill(client, selector, value) {
  const ok = await client.eval(`(() => { const el=document.querySelector(${JSON.stringify(selector)}); if(!el)return false; el.focus(); const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
  if (!ok) throw new Error(`Missing ${selector}`);
  await sleep(250);
}
async function shot(client, name) {
  const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  screenshots.push(`evidence/phase3/${name}.png`);
}
async function visible(client, selector) {
  return client.eval(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return false; const r=e.getBoundingClientRect(),s=getComputedStyle(e); return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0; })()`);
}

const { client, close } = await launchChrome();
client.on('Runtime.consoleAPICalled', event => {
  if (event.type === 'error') consoleErrors.push(event.args.map(a => a.value ?? a.description ?? '').join(' '));
});
try {
  await client.send('Runtime.enable');
  await client.send('Page.enable');
  await fixture('state?persona=member&failChatSend=0');
  await fixture('reset-log');

  await setViewport(client, 390, 844, true);
  await go(client, `${APP}/clubpm/chat`);
  const list = await client.eval(`({url:location.pathname+location.search, list:!!document.querySelector('.cpm-chatpage--list'), people:document.querySelector('[data-tour-id="chat.people"]')?.textContent, unread:document.querySelectorAll('.cpm-chatpage-item.unread').length, muted:document.querySelectorAll('.cpm-chatpage-muted').length, overflow:document.documentElement.scrollWidth-innerWidth})`);
  check('phone /chat stays on list', list.url === '/clubpm/chat' && list.list, list);
  check('People & DMs is a visible list entry', /People/.test(list.people || '') && await visible(client, '[data-tour-id="chat.people"]'));
  check('unread and mute state remain visible', list.unread > 0 && list.muted > 0, list);
  check('phone channel list has no page overflow', list.overflow <= 0, list.overflow);
  await shot(client, 'chat-list-p390');

  await click(client, '.cpm-chatpage-item');
  check('list drill-down opens one conversation pane', (await client.eval(`location.pathname`)) === '/clubpm/chat/C_FIX_GENERAL' && await visible(client, '.cpm-chatpage-main') && !(await visible(client, '.cpm-chatpage-side')));
  await client.eval(`history.back()`); await sleep(700);
  check('browser Back returns conversation to channel list', (await client.eval(`location.pathname`)) === '/clubpm/chat');
  await client.eval(`history.forward()`); await sleep(900);
  check('browser Forward reopens conversation', (await client.eval(`location.pathname`)) === '/clubpm/chat/C_FIX_GENERAL');
  for (let i = 0; i < 30 && !(await visible(client, '.cpm-chat-reaction')); i += 1) await sleep(100);

  const controls = await client.eval(`(() => { const a=document.querySelector('.cpm-chat-composer-btn')?.getBoundingClientRect(); const s=document.querySelector('.cpm-chat-composer-send')?.getBoundingClientRect(); return {attach:a&&[a.width,a.height],send:s&&[s.width,s.height], reactions:document.querySelectorAll('.cpm-chat-reaction').length}; })()`);
  check('attachment and send controls are at least 44px', controls.attach?.every(n => n >= 44) && controls.send?.every(n => n >= 44), controls);
  check('reactions remain available on touch', controls.reactions > 0, controls.reactions);
  await fill(client, '.cpm-chat-composer-input', '@Jo');
  check('mention suggestions remain available', await visible(client, '.cpm-chat-suggest'));
  check('focused composer with no viewport contraction keeps global navigation', await visible(client, '.pm-m-nav') && !(await client.eval(`document.querySelector('.pm-shell')?.classList.contains('pm-m-keyboard-open')`)));
  await setViewport(client, 390, 560, true); await sleep(500);
  const keyboard = await client.eval(`({open:document.querySelector('.pm-shell')?.classList.contains('pm-m-keyboard-open'), nav:!!document.querySelector('.pm-m-nav') && getComputedStyle(document.querySelector('.pm-m-nav')).display!=='none', composerBottom:Math.round(document.querySelector('.cpm-chat-composer')?.getBoundingClientRect().bottom||0), viewport:Math.round(window.visualViewport?.height||innerHeight)})`);
  check('software-keyboard viewport contraction hides nav and keeps composer visible', keyboard.open && !keyboard.nav && keyboard.composerBottom <= keyboard.viewport, keyboard);
  await setViewport(client, 390, 844, true); await sleep(500);
  check('restoring the visual viewport restores global navigation', await visible(client, '.pm-m-nav'));

  await fill(client, '.cpm-chat-composer-input', 'FIXTURE failed send retains me');
  await fixture('state?failChatSend=1');
  await click(client, '.cpm-chat-composer-send');
  check('failed send retains draft and exposes Retry', await visible(client, '.cpm-chat-send-error') && (await client.eval(`document.querySelector('.cpm-chat-composer-input')?.value`)).includes('retains'));
  await fixture('state?failChatSend=0');
  await click(client, '.cpm-chat-send-error button');
  check('retry clears the draft after success', (await client.eval(`document.querySelector('.cpm-chat-composer-input')?.value`)) === '');

  const beforeThreadTop = await client.eval(`(() => { const buttons=[...document.querySelectorAll('.cpm-chat-thread-btn')]; const button=buttons[buttons.length-1]; button.scrollIntoView({block:'center'}); const e=document.querySelector('.cpm-chat-scroll'); const top=e.scrollTop; button.click(); return top; })()`);
  await sleep(500);
  check('thread drill-down is URL-backed and single-pane', (await client.eval(`location.search`)).includes('thread=') && await visible(client, '.cpm-chat-drawer') && !(await visible(client, '.cpm-chat-main')));
  for (let i = 0; i < 30 && !(await visible(client, '.cpm-chat-drawer-body .cpm-chat-msg')); i += 1) await sleep(100);
  const threadComposer = await client.eval(`({bottom:Math.round(document.querySelector('.cpm-chat-drawer .cpm-chat-composer')?.getBoundingClientRect().bottom||0), navTop:Math.round(document.querySelector('.pm-m-nav')?.getBoundingClientRect().top||0)})`);
  check('thread messages scroll above the reachable bottom composer', threadComposer.bottom <= threadComposer.navTop && threadComposer.bottom >= threadComposer.navTop-20, threadComposer);
  check('touch message actions do not squeeze message text into a side column', await client.eval(`[...document.querySelectorAll('.cpm-chat-drawer .cpm-chat-msg-body')].every(e=>e.getBoundingClientRect().width>240)`));
  await shot(client, 'thread-p390');
  await client.eval(`history.back()`); await sleep(800);
  const restored = await client.eval(`({url:location.pathname+location.search, top:document.querySelector('.cpm-chat-scroll')?.scrollTop||0})`);
  check('thread Back restores the conversation and its scroll', !restored.url.includes('thread=') && Math.abs(restored.top-beforeThreadTop) <= 2, { ...restored, beforeThreadTop });
  await client.eval(`history.forward()`); await sleep(700);
  check('thread Forward reopens the same thread', (await client.eval(`location.search`)).includes('thread='));

  await go(client, `${APP}/clubpm/chat/C_FIX_RANDOM`);
  check('public-channel preview exposes Join', await visible(client, '.cpm-chat-join button'));
  await click(client, '.cpm-chat-join button');
  const joinLog = await fixture('log');
  check('Join uses the existing membership endpoint once', (joinLog.log['POST /api/chat/conversations/C_FIX_RANDOM/join'] || 0) === 1, joinLog.log['POST /api/chat/conversations/C_FIX_RANDOM/join']);

  await go(client, `${APP}/clubpm/members?view=dms`);
  check('People & DMs opens on the inbox entry', await visible(client, '.cpm-dm-inbox') && !(await visible(client, '.pm-members-roster')));
  await click(client, '.cpm-dm-row');
  check('DM detail preserves ?dm= and replaces list with one pane', (await client.eval(`location.search`)).includes('dm=') && await visible(client, '.cpm-dm-panel') && !(await visible(client, '.cpm-dm-inbox')));
  await shot(client, 'dm-detail-p390');
  await client.eval(`history.back()`); await sleep(700);
  check('DM browser Back returns to the same inbox', !(await client.eval(`location.search`)).includes('dm=') && await visible(client, '.cpm-dm-inbox'));
  await go(client, `${APP}/clubpm/members?view=dms&dm=D_FIX_JORDAN`);
  check('direct ?dm= link opens full-screen DM detail', await visible(client, '.cpm-dm-panel') && !(await visible(client, '.cpm-dm-inbox')));
  await click(client, '.cpm-dm-panel-close');
  check('direct DM return falls back to the inbox without leaving Members', (await client.eval(`location.pathname+location.search`)) === '/clubpm/members?view=dms' && await visible(client, '.cpm-dm-inbox'));
  await go(client, `${APP}/clubpm/projects/p1?tab=chat&view=members`);
  check('project Members entry retains project scope and starts on the roster', await visible(client, '.pm-members-roster') && !(await visible(client, '.cpm-dm-inbox')) && (await client.eval(`location.search`)).includes('view=members'));

  await go(client, `${APP}/clubpm/calendar`, 1800);
  const calendar = await client.eval(`({agenda:!!document.querySelector('.cpm-cal-agenda'), date:!!document.querySelector('.pm-m-cal-date-picker input'), project:!!document.querySelector('.cpm-calendar-filters details'), month:[...document.querySelectorAll('.cpm-cal-view-btn')].some(b=>b.textContent.trim()==='Month'), poll:[...document.querySelectorAll('.cpm-cal-toolbar-actions button')].some(b=>/New Poll/.test(b.textContent)), event:[...document.querySelectorAll('.cpm-cal-toolbar-actions button')].some(b=>/New Event/.test(b.textContent))})`);
  check('phone Calendar is agenda-first with date, project filter, and Month', calendar.agenda && calendar.date && calendar.project && calendar.month, calendar);
  check('member can create polls but not admin-only events', calendar.poll && !calendar.event, calendar);
  await shot(client, 'calendar-agenda-p390');
  await click(client, '.cpm-cal-agenda-event-row');
  check('event detail exposes RSVP', await visible(client, '.pm-cal-modal-footer button'));
  const rsvpButton = await client.eval(`([...document.querySelectorAll('.pm-cal-modal-footer button')].find(b=>b.textContent.trim()==='RSVP'))?.className || ''`);
  check('RSVP action is labelled', !!rsvpButton, rsvpButton);
  await client.eval(`([...document.querySelectorAll('.pm-cal-modal-footer button')].find(b=>b.textContent.trim()==='RSVP'))?.click()`); await sleep(600);
  check('RSVP reaches attendee endpoint and updates state', (await fixture('log')).log['POST /api/events/e1/attendees'] >= 1 && (await client.eval(`document.querySelector('.pm-cal-modal-footer')?.textContent`)).includes('Not attending'));
  await shot(client, 'calendar-event-p390');
  await client.eval(`history.back()`); await sleep(600);
  check('Calendar browser Back closes event detail and returns to agenda', !(await visible(client, '.pm-cal-detail')) && !(await client.eval(`location.search`)).includes('event='));
  await client.eval(`history.forward()`); await sleep(600);
  check('Calendar browser Forward restores the same event detail', await visible(client, '.pm-cal-detail') && (await client.eval(`location.search`)) === '?event=e1');

  await go(client, `${APP}/clubpm/notifications`, 1200);
  const notifRows = await client.eval(`document.querySelectorAll('.pm-notif-item').length`);
  check('notification rows render readably on phone', notifRows === 3 && await visible(client, '.pm-notif-item'));
  await client.eval(`([...document.querySelectorAll('.pm-notif-item')].find(row=>row.textContent.includes('mentioned you')))?.click()`); await sleep(700);
  check('channel/thread notification deep-link opens exact thread', (await client.eval(`location.pathname+location.search`)).includes('/clubpm/chat/C_FIX_GENERAL?thread='));
  await go(client, `${APP}/clubpm/notifications`, 900);
  await client.eval(`([...document.querySelectorAll('.pm-notif-item')].find(row=>row.textContent.includes('assigned')))?.click()`); await sleep(700);
  check('task notification deep-link preserves task id', (await client.eval(`location.pathname+location.search`)) === '/clubpm/projects/p1?task=t4');
  await go(client, `${APP}/clubpm/notifications`, 900);
  await client.eval(`([...document.querySelectorAll('.pm-notif-item')].find(row=>row.textContent.includes('General Meeting')))?.click()`); await sleep(900);
  check('event notification deep-link opens the exact event', (await client.eval(`location.pathname+location.search`)) === '/clubpm/calendar?event=e1' && await visible(client, '.pm-cal-detail'));
  await go(client, `${APP}/clubpm/calendar?event=e_far`, 1700);
  check('event deep-link outside the current agenda resolves authorized detail', await visible(client, '.pm-cal-detail') && (await client.eval(`document.querySelector('.pm-cal-detail-title')?.textContent`)).includes('Future Review'));

  await fixture('state?persona=admin');
  await go(client, `${APP}/clubpm/calendar`, 1500);
  const adminActions = await client.eval(`([...document.querySelectorAll('.cpm-cal-toolbar-actions button')].map(b=>b.textContent.trim()))`);
  check('authorized phone Calendar exposes event and poll creation', adminActions.some(x=>/New Event/.test(x)) && adminActions.some(x=>/New Poll/.test(x)), adminActions);
  await client.eval(`([...document.querySelectorAll('.cpm-cal-toolbar-actions button')].find(b=>/New Event/.test(b.textContent)))?.click()`); await sleep(400);
  check('phone Calendar form reuses the shared isolated full-screen dialog', await visible(client, '.pm-m-calendar-layer [role="dialog"]') && await client.eval(`document.getElementById('root')?.hasAttribute('inert')`));
  await fill(client, '.cpm-event-modal input[type="text"]', 'FIXTURE confirmation only');
  await fill(client, '.cpm-event-modal input[type="date"]', new Date().toISOString().slice(0,10));
  await client.eval(`([...document.querySelectorAll('.cpm-event-modal-footer button')].find(b=>/Create Event/.test(b.textContent)))?.click()`); await sleep(400);
  check('public event creation requires explicit confirmation before submission', await visible(client, '.cpm-event-public-confirm') && !((await fixture('log')).log['POST /api/events']));
  await client.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(400);
  check('Escape closes the Calendar form and releases the shared dialog isolation', !(await visible(client, '.cpm-event-modal')) && !(await client.eval(`document.getElementById('root')?.hasAttribute('inert')`)));
  await fixture('state?persona=member');

  await setViewport(client, 1280, 800, false);
  await go(client, `${APP}/clubpm/chat`);
  check('desktop /chat still redirects to the first channel', (await client.eval(`location.pathname`)) === '/clubpm/chat/C_FIX_GENERAL' && await visible(client, '.cpm-chatpage-side') && await visible(client, '.cpm-chatpage-main'));
  check('desktop messaging remains multi-pane', await visible(client, '.cpm-chatpage-side') && await visible(client, '.cpm-chatpage-main'));
  await shot(client, 'chat-desktop-d1280');

  const report = {
    generatedAt: new Date().toISOString(),
    note: 'Chromium touch/viewport emulation against fixture data; not real iOS/Android, real-account, upload-picker, or screen-reader evidence.',
    summary: { passed: checks.filter(x => x.pass).length, failed: checks.filter(x => !x.pass).length, total: checks.length },
    checks, screenshots, consoleErrors: [...new Set(consoleErrors)],
  };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.summary.passed}/${report.summary.total} passed; ${report.summary.failed} failed. Report: ${path.join(OUT, 'report.json')}`);
  if (report.summary.failed) process.exitCode = 1;
} finally {
  await close();
}
