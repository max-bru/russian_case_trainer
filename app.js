/* Падеж Rush — game logic */
(() => {
  'use strict';

  const { CASES, CUES, PRONOUNS, MODIFIERS, ADJECTIVES, NOUNS, getModForm } = window.PADEZH;

  /* ---------- utils ---------- */
  const $ = s => document.querySelector(s);
  const randInt = n => Math.floor(Math.random() * n);
  const rand = a => a[randInt(a.length)];
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const bi = (en, ru) => `${esc(en)} <span class="ru">${esc(ru)}</span>`;

  /* ---------- persistence ---------- */
  const LS = 'padezh-rush-v1';
  let store;
  try { store = JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { store = {}; }
  const DEFAULTS = {
    types: ['pron', 'noun', 'adj', 'poss', 'phrase'],
    cases: ['nom', 'gen', 'dat', 'acc', 'ins', 'prep'],
    numbers: ['sg', 'pl'],
    genders: ['m', 'n', 'f'],
    mode: 'sprint60',
  };
  store.settings = Object.assign({}, DEFAULTS, store.settings || {});
  store.stats = store.stats || {};
  store.best = store.best || {};
  store.history = store.history || [];
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { /* ignore */ } };

  /* ---------- settings UI ---------- */
  const OPTIONS = {
    types: [
      { id: 'pron',   label: 'Pronouns',        sub: 'я → мне, он → с ним' },
      { id: 'noun',   label: 'Nouns',           sub: 'день → дня' },
      { id: 'adj',    label: 'Adjective + noun', sub: 'новый дом' },
      { id: 'poss',   label: 'Possessive / demonstrative + noun', sub: 'мой, наш, этот, тот, весь…' },
      { id: 'phrase', label: 'Full phrase',     sub: 'мой новый друг' },
    ],
    cases: CASES.map(c => ({ id: c.id, label: c.en, sub: c.ru, color: c.color })),
    numbers: [{ id: 'sg', label: 'Singular', sub: 'ед.ч.' }, { id: 'pl', label: 'Plural', sub: 'мн.ч.' }],
    genders: [{ id: 'm', label: 'Masc.', sub: 'м.р.' }, { id: 'f', label: 'Fem.', sub: 'ж.р.' }, { id: 'n', label: 'Neut.', sub: 'ср.р.' }],
    mode: [
      { id: 'sprint60',  label: 'Sprint 60s',  sub: 'wrong = −3s' },
      { id: 'sprint120', label: 'Sprint 120s', sub: 'wrong = −3s' },
      { id: 'min5',      label: '5 Minutes',   sub: 'wrong = −3s' },
      { id: 'min10',     label: '10 Minutes',  sub: 'wrong = −3s' },
      { id: 'zen',       label: 'Zen',         sub: 'no timer' },
    ],
  };

  function renderChips(key, multi = true) {
    const box = $(`#opt-${key}`);
    box.innerHTML = '';
    for (const o of OPTIONS[key]) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.id = `opt-${key}-${o.id}`;
      if (o.color) b.style.setProperty('--c', o.color);
      b.innerHTML = `<span class="chip-label">${esc(o.label)}</span>${o.sub ? `<span class="chip-sub">${esc(o.sub)}</span>` : ''}`;
      const on = multi ? store.settings[key].includes(o.id) : store.settings[key] === o.id;
      b.classList.toggle('on', on);
      b.addEventListener('click', () => {
        if (multi) {
          const arr = store.settings[key];
          const i = arr.indexOf(o.id);
          if (i >= 0) {
            if (arr.length === 1) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
            arr.splice(i, 1);
          } else arr.push(o.id);
        } else store.settings[key] = o.id;
        save();
        renderChips(key, multi);
        renderBest();
      });
      box.appendChild(b);
    }
  }

  function renderSettings() {
    renderChips('types'); renderChips('cases'); renderChips('numbers'); renderChips('genders'); renderChips('mode', false);
    renderBest();
  }

  function renderBest() {
    const b = store.best[store.settings.mode];
    const mObj = OPTIONS.mode.find(m => m.id === store.settings.mode);
    const name = mObj ? mObj.label : 'Session';
    $('#best-line').textContent = store.settings.mode === 'zen' ? 'Zen mode: practice at your own pace.' : (b ? `Best ${name}: ${b}` : `No ${name} record yet. Set one!`);
  }

  /* ---------- screens ---------- */
  let currentScreen = 'start';
  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(`#screen-${name}`).classList.add('active');
    currentScreen = name;
  }

  /* ---------- language helpers ---------- */
  function pronForm(p, ci, prep) {
    let f = p.f[ci];
    if (!f) return null;
    if (prep && p.n && ci !== 5 && /^[еёи]/.test(f)) f = 'н' + f;
    return f;
  }

  // с/к/в/о/над/под → со/ко/во/обо/надо/подо, о → об
  function fixPrep(p, next) {
    const w = next.toLowerCase();
    if (w === 'мной' && (p === 'над' || p === 'под')) return p + 'о';
    if (['с', 'к', 'в'].includes(p) && (w === 'мне' || w === 'мной' || /^вс[её]/.test(w))) return p + 'о';
    if (p === 'о' && (w === 'мне' || /^вс[её]/.test(w))) return 'обо';
    if (p === 'о' && /^[аоуэиы]/.test(w)) return 'об';
    if (p === 'с' && /^[сзшж][^аеёиоуыэюя]/.test(w)) return 'со';
    if (p === 'в' && /^[вф][^аеёиоуыэюя]/.test(w)) return 'во';
    return p;
  }

  const GENDER = { m: ['masculine', 'м.р.'], f: ['feminine', 'ж.р.'], n: ['neuter', 'ср.р.'] };
  const NUM = { sg: ['singular', 'ед.ч.'], pl: ['plural', 'мн.ч.'] };

  /* ---------- adaptive picking ---------- */
  function caseErr(id) {
    const row = store.stats[id] || {};
    let n = 0, c = 0;
    for (const k in row) { n += row[k].n; c += row[k].c; }
    return n >= 4 ? 1 - c / n : 0.15;
  }
  function pickWeighted(items, weights) {
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }

  function makeSpec() {
    const s = store.settings;
    const caseIdxs = s.cases.map(id => CASES.findIndex(c => c.id === id));
    const weights = s.cases.map(id => 1 + caseErr(id) * 4);
    const nouns = NOUNS.map((n, i) => i).filter(i => s.genders.includes(NOUNS[i].g));
    for (let t = 0; t < 300; t++) {
      const type = rand(s.types);
      const num = rand(s.numbers);
      const caseIdx = pickWeighted(caseIdxs, weights);
      const spec = { type, num, caseIdx, cue: randInt(CUES[caseIdx].length) };
      if (type === 'pron') {
        if (caseIdx === 0) continue; // я → я is trivial
        const pool = PRONOUNS.map((p, i) => i).filter(i => PRONOUNS[i].num === num && PRONOUNS[i].f[caseIdx]);
        if (!pool.length) continue;
        spec.pron = rand(pool);
      } else {
        if (caseIdx === 0 && num === 'sg') continue; // nominative singular = the prompt itself
        if (!nouns.length) continue;
        spec.noun = rand(nouns);
        if (type === 'adj' || type === 'phrase') spec.adj = randInt(ADJECTIVES.length);
        if (type === 'poss' || type === 'phrase') spec.mod = randInt(MODIFIERS.length);
      }
      const key = JSON.stringify(spec);
      if (game.q && key === game.q.key) continue;
      return spec;
    }
    return null;
  }

  /* ---------- question building ---------- */
  function buildQuestion(spec) {
    const ci = spec.caseIdx, num = spec.num;
    const cue = CUES[ci][spec.cue];
    const hasPrep = !!cue.p;
    let answerWords, baseWords, candidates, tags, col, hint = [];
    hint.push(`${esc(CASES[ci].en)} ${NUM[num][0]} <span class="ru">${esc(CASES[ci].ru)} · ${NUM[num][1]}</span>`);

    if (spec.type === 'pron') {
      const p = PRONOUNS[spec.pron];
      answerWords = [pronForm(p, ci, hasPrep)];
      baseWords = [p.base];
      const others = shuffle([1, 2, 3, 4, 5].filter(i => i !== ci)).map(i => pronForm(p, i, hasPrep));
      const counterpart = pronForm(p, ci, !hasPrep);
      const otherPron = shuffle(PRONOUNS.filter(x => x !== p && x.num === p.num)).map(x => pronForm(x, ci, hasPrep));
      candidates = [counterpart, ...others, ...otherPron];
      tags = esc(p.note);
      col = 'pron';
      if (hasPrep && p.n && ci !== 5) hint.push('after a preposition → н-');
      if (p.n && ci === 5) hint.push('prepositional always has н-');
    } else {
      const noun = NOUNS[spec.noun];
      const parts = [];
      if (spec.mod != null) parts.push({ t: MODIFIERS[spec.mod].forms });
      if (spec.adj != null) parts.push({ t: ADJECTIVES[spec.adj].forms });
      parts.push({ noun: true });
      const wordAt = (part, i, n) => part.noun ? (n === 'pl' ? noun.pl[i] : noun.sg[i]) : getModForm(part.t, i, noun.g, n, noun.anim);
      const phrase = (i, n) => parts.map(pt => wordAt(pt, i, n));
      answerWords = phrase(ci, num);
      baseWords = phrase(0, 'sg');
      const otherIdx = [0, 1, 2, 3, 4, 5].filter(i => i !== ci);
      const consistent = shuffle([...otherIdx]).map(i => phrase(i, num).join(' '));
      const otherNum = shuffle([0, 1, 2, 3, 4, 5]).map(i => phrase(i, num === 'sg' ? 'pl' : 'sg').join(' '));
      if (parts.length > 1) {
        const mixed = [];
        for (let k = 0; k < 10; k++) {
          const w = [...answerWords];
          const pi = randInt(parts.length);
          w[pi] = wordAt(parts[pi], rand(otherIdx), num);
          mixed.push(w.join(' '));
        }
        candidates = [mixed[0], consistent[0], mixed[1], consistent[1], ...mixed.slice(2), ...consistent.slice(2), ...otherNum];
      } else {
        candidates = [...consistent, ...otherNum];
      }
      tags = `${bi(GENDER[noun.g][0], GENDER[noun.g][1])} · ${noun.anim ? bi('animate', 'одуш.') : bi('inanimate', 'неодуш.')}`;
      col = num === 'pl' ? 'pl' : noun.g;
      if (ci === 3 && (num === 'pl' || noun.g === 'm')) {
        hint.push(noun.anim ? 'animate → accusative = genitive' : 'inanimate → accusative = nominative');
      }
      if (ci === 3 && num === 'sg' && noun.g === 'm' && noun.anim && /[ая]$/.test(noun.base)) {
        hint.push('noun in -а declines like a feminine, modifiers stay masculine');
      }
    }

    const answer = answerWords.join(' ');
    const opts = [];
    for (const c of candidates) {
      if (c && c !== answer && !opts.includes(c)) opts.push(c);
      if (opts.length === 3) break;
    }
    const prefix = hasPrep ? fixPrep(cue.p, answerWords[0]) : cue.t;
    return {
      key: JSON.stringify(spec), spec, ci, num, cue, col,
      answer, answerWords, baseWords, prefix,
      options: shuffle([answer, ...opts]),
      tags, hint: hint.join(' · '),
    };
  }

  function highlight(word, base) {
    let k = 0;
    while (k < word.length && k < base.length && word[k] === base[k]) k++;
    if (k === word.length) return esc(word);
    return esc(word.slice(0, k)) + `<span class="end">${esc(word.slice(k))}</span>`;
  }

  /* ---------- game state ---------- */
  const game = { q: null };

  function startGame() {
    const mode = store.settings.mode;
    const modeDurations = {
      sprint60: 60000,
      sprint120: 120000,
      min5: 300000,
      min10: 600000,
    };
    const dur = modeDurations[mode] || 60000;
    Object.assign(game, {
      mode, timed: mode !== 'zen',
      duration: dur,
      timeLeft: dur,
      score: 0, streak: 0, bestStreak: 0, correct: 0, total: 0, timeSum: 0,
      mistakes: [], review: [], q: null,
      running: true, paused: false, locked: false, awaiting: false,
      lastTick: performance.now(),
      roundStartTime: performance.now(),
      roundSettings: JSON.parse(JSON.stringify(store.settings)),
    });
    if (!makeSpec()) { alert('No valid questions for this combination. Add more cases or word types.'); return; }
    $('#hud-time-label').textContent = game.timed ? 'Time' : 'Answered';
    $('.timebar').style.visibility = game.timed ? 'visible' : 'hidden';
    show('game');
    updateHud();
    nextQuestion();
    requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!game.running) return;
    const dt = now - game.lastTick;
    game.lastTick = now;
    if (game.timed && !game.paused) {
      game.timeLeft -= dt;
      if (game.timeLeft <= 0) { game.timeLeft = 0; updateTimer(); endGame(); return; }
    }
    updateTimer();
    requestAnimationFrame(tick);
  }

  function updateTimer() {
    if (!game.timed) { $('#hud-time').textContent = game.total; return; }
    const totalSec = Math.ceil(game.timeLeft / 1000);
    if (game.duration > 60000) {
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      $('#hud-time').textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    } else {
      $('#hud-time').textContent = totalSec;
    }
    const fill = $('#timebar-fill');
    fill.style.transform = `scaleX(${Math.max(0, game.timeLeft / game.duration)})`;
    fill.classList.toggle('low', game.timeLeft < 10000);
  }

  const multiplier = () => Math.min(5, 1 + Math.floor(game.streak / 5));

  function updateHud() {
    $('#hud-score').textContent = game.score;
    $('#hud-streak').textContent = game.streak;
    $('#hud-mult').textContent = `×${multiplier()}`;
  }

  function nextQuestion() {
    let spec = null, isReview = false;
    game.review.forEach(r => r.due--);
    const dueIdx = game.review.findIndex(r => r.due <= 0);
    if (dueIdx >= 0) { spec = game.review.splice(dueIdx, 1)[0].spec; isReview = true; }
    if (!spec) spec = makeSpec();
    const q = buildQuestion(spec);
    q.isReview = isReview;
    game.q = q;
    game.locked = false;
    game.awaiting = false;
    game.paused = false;

    const c = CASES[q.ci];
    const card = $('#card');
    card.style.setProperty('--case', c.color);
    document.documentElement.style.setProperty('--case', c.color);
    card.classList.remove('flash-good', 'flash-bad', 'enter');
    void card.offsetWidth;
    card.classList.add('enter');

    $('#q-case').innerHTML = bi(c.en, c.ru);
    const numB = $('#q-num');
    numB.innerHTML = q.num === 'pl' ? bi('Plural', 'мн.ч.') : bi('Singular', 'ед.ч.');
    numB.classList.toggle('pl', q.num === 'pl');
    $('#q-review').hidden = !isReview;
    $('#q-qword').innerHTML = bi(c.qEn, c.q);
    $('#q-cue').textContent = q.cue.p || q.cue.t;
    $('#q-base').textContent = q.baseWords.join(' ');
    $('#q-tags').innerHTML = q.tags;
    $('#feedback').hidden = true;

    const box = $('#options');
    box.classList.remove('locked');
    box.innerHTML = '';
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt';
      b.id = `opt-${i + 1}`;
      b.innerHTML = `<span class="k">${i + 1}</span>${esc(o)}`;
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });
    game.qStart = performance.now();
  }

  function recordStat(q, ok, ms) {
    const id = CASES[q.ci].id;
    const row = store.stats[id] = store.stats[id] || {};
    const cell = row[q.col] = row[q.col] || { n: 0, c: 0, t: 0 };
    cell.n++; if (ok) cell.c++; cell.t += Math.min(ms, 15000);
    save();
  }

  function choose(i) {
    if (game.locked || !game.running) return;
    game.locked = true;
    const q = game.q;
    const ms = performance.now() - game.qStart;
    const picked = q.options[i];
    const ok = picked === q.answer;
    const buttons = [...document.querySelectorAll('.opt')];
    const correctIdx = q.options.indexOf(q.answer);
    $('#options').classList.add('locked');
    buttons[correctIdx].classList.add('correct');
    game.total++;
    game.timeSum += Math.min(ms, 15000);
    recordStat(q, ok, ms);

    if (ok) {
      game.correct++;
      game.streak++;
      game.bestStreak = Math.max(game.bestStreak, game.streak);
      const speed = Math.max(0, Math.round((3500 - ms) / 100));
      const pts = (10 + speed) * multiplier();
      game.score += pts;
      if (game.streak % 5 === 0) { const m = $('#hud-mult'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); }
      updateHud();
      $('#card').classList.add('flash-good');
      const f = document.createElement('div');
      f.className = 'floater';
      f.textContent = `+${pts}`;
      $('#float-layer').appendChild(f);
      setTimeout(() => f.remove(), 800);
      setTimeout(() => { if (game.running) nextQuestion(); }, 260);
    } else {
      buttons[i].classList.add('wrong');
      game.streak = 0;
      updateHud();
      $('#card').classList.add('flash-bad');
      if (game.timed) {
        game.timeLeft = Math.max(0, game.timeLeft - 3000);
        const tb = $('.timebar'); tb.classList.remove('penalty'); void tb.offsetWidth; tb.classList.add('penalty');
      }
      game.mistakes.push(q);
      game.review.push({ spec: q.spec, due: 3 + randInt(3) });
      showFeedback(q);
      game.paused = true;
      game.awaiting = true;
    }
  }

  function showFeedback(q) {
    const words = q.answerWords.map((w, i) => highlight(w, q.baseWords[i])).join(' ');
    $('#fb-answer').innerHTML = `<span class="prep">${esc(q.prefix)}</span> ${words}`;
    $('#fb-hint').innerHTML = q.hint;
    $('#feedback').hidden = false;
  }

  function continueAfterMistake() {
    if (!game.awaiting) return;
    game.awaiting = false;
    game.lastTick = performance.now();
    if (game.timed && game.timeLeft <= 0) { endGame(); return; }
    nextQuestion();
  }

  function makeConfigKey(s) {
    return [
      s.mode,
      [...s.cases].sort().join(','),
      [...s.types].sort().join(','),
      [...s.numbers].sort().join(','),
      [...s.genders].sort().join(','),
    ].join('|');
  }

  function makeConfigSummary(s) {
    const m = OPTIONS.mode.find(x => x.id === s.mode);
    const modeLabel = m ? m.label : s.mode;
    const casesLabel = s.cases.length === CASES.length ? 'All 6 cases' : s.cases.map(cid => (CASES.find(c => c.id === cid) || {}).short || cid).join(', ');
    const numLabel = s.numbers.length === 2 ? 'Sg + Pl' : (s.numbers[0] === 'sg' ? 'Singular' : 'Plural');
    const genLabel = s.genders.length === 3 ? 'All genders' : s.genders.map(g => g.toUpperCase()).join('/');
    const typesLabel = s.types.length === OPTIONS.types.length ? 'All types' : `${s.types.length} word type${s.types.length > 1 ? 's' : ''}`;
    return {
      title: `${modeLabel} · ${casesLabel}`,
      subtitle: `${typesLabel} · ${numLabel} · ${genLabel}`,
      modeLabel,
      casesLabel,
      numLabel,
      genLabel,
      typesLabel,
    };
  }

  function formatDate(ts) {
    const d = new Date(ts);
    const pad = n => (n < 10 ? '0' : '') + n;
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (isToday) return `Today, ${time}`;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${time}`;
  }

  function endGame() {
    if (!game.running) return;
    game.running = false;
    const acc = game.total ? Math.round(100 * game.correct / game.total) : 0;
    $('#res-score').textContent = game.score;
    $('#res-acc').textContent = `${acc}%`;
    $('#res-avg').textContent = game.total ? `${(game.timeSum / game.total / 1000).toFixed(1)}s` : '–';
    $('#res-count').textContent = game.total;
    $('#res-streak').textContent = game.bestStreak;
    let record = false;
    if (game.timed && game.score > 0 && game.score > (store.best[game.mode] || 0)) {
      store.best[game.mode] = game.score; record = true; save();
    }
    $('#res-record').hidden = !record;
    $('#res-title').textContent = game.timed ? 'Time!' : 'Session over';

    let lastRecord = null;
    if (game.timed && game.total > 0 && game.roundSettings) {
      const cfgKey = makeConfigKey(game.roundSettings);
      const cfgSummary = makeConfigSummary(game.roundSettings);
      const elapsedSec = Math.min(Math.round((performance.now() - game.roundStartTime) / 1000), Math.round(game.duration / 1000));
      lastRecord = {
        id: 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
        settings: game.roundSettings,
        configKey: cfgKey,
        configSummary: cfgSummary,
        total: game.total,
        mistakes: game.mistakes.length,
        correct: game.correct,
        accuracy: acc,
        avgTime: game.total ? +(game.timeSum / game.total / 1000).toFixed(1) : 0,
        score: game.score,
        bestStreak: game.bestStreak,
        timePlayed: elapsedSec,
        modeDuration: Math.round(game.duration / 1000),
      };
      store.history = store.history || [];
      store.history.unshift(lastRecord);
      if (store.history.length > 500) store.history.pop();
      save();
      game.lastConfigKey = cfgKey;
    }

    const banner = $('#res-progress-banner');
    if (lastRecord) {
      const past = (store.history || []).filter(h => h.configKey === lastRecord.configKey);
      const roundNum = past.length;
      $('#res-progress-badge').textContent = `Round #${roundNum} on these settings`;
      let desc = `Answers: <strong>${lastRecord.total}</strong> · Mistakes: <strong>${lastRecord.mistakes}</strong> · Accuracy: <strong>${lastRecord.accuracy}%</strong>`;
      if (roundNum > 1) {
        const prev = past[1];
        const accDiff = lastRecord.accuracy - prev.accuracy;
        const diffStr = accDiff > 0 ? `+${accDiff}%` : `${accDiff}%`;
        const diffColor = accDiff >= 0 ? 'var(--good)' : 'var(--bad)';
        desc += ` <span style="margin-left:6px;color:${diffColor};font-weight:700;">(${diffStr} vs last round)</span>`;
      }
      $('#res-progress-desc').innerHTML = desc;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }

    const ul = $('#res-mistakes');
    ul.innerHTML = '';
    const seen = new Set();
    const list = game.mistakes.filter(q => !seen.has(q.key) && seen.add(q.key)).slice(0, 12);
    if (!list.length) {
      ul.innerHTML = game.total ? '<li class="empty">Flawless — no mistakes!</li>' : '<li class="empty">No answers this round.</li>';
    }
    for (const q of list) {
      const li = document.createElement('li');
      li.style.setProperty('--case', CASES[q.ci].color);
      const words = q.answerWords.map((w, i) => highlight(w, q.baseWords[i])).join(' ');
      li.innerHTML = `<span class="m-q">${esc(q.baseWords.join(' '))} → ${esc(CASES[q.ci].en)} ${NUM[q.num][0]}</span><span class="m-a">${esc(q.prefix)} ${words}</span>`;
      ul.appendChild(li);
    }
    show('results');
  }

  /* ---------- weakness map ---------- */
  const COLS = [['m', 'Masc. sg', 'м.р. ед.'], ['n', 'Neut. sg', 'ср.р. ед.'], ['f', 'Fem. sg', 'ж.р. ед.'], ['pl', 'Plural', 'мн.ч.'], ['pron', 'Pronouns', 'местоим.']];
  function renderHeat() {
    const t = $('#heat');
    let html = '<tr><th></th>' + COLS.map(c => `<th>${esc(c[1])}<span class="ru block">${esc(c[2])}</span></th>`).join('') + '</tr>';
    for (const c of CASES) {
      html += `<tr><th class="row"><i style="background:${c.color}"></i>${esc(c.en)}<span class="ru block">${esc(c.ru)}</span></th>`;
      for (const [col] of COLS) {
        const cell = store.stats[c.id] && store.stats[c.id][col];
        if (!cell || !cell.n) { html += '<td class="none">–</td>'; continue; }
        const acc = cell.c / cell.n;
        const hue = Math.round(acc * acc * 150);
        html += `<td style="background:hsla(${hue},85%,55%,.22);color:hsl(${hue},90%,72%)" title="${cell.c}/${cell.n} correct">${Math.round(acc * 100)}%<small>${(cell.t / cell.n / 1000).toFixed(1)}s · ${cell.n}</small></td>`;
      }
      html += '</tr>';
    }
    t.innerHTML = html;
  }
  let statsReturn = 'start';
  function openStats(from) { statsReturn = from; renderHeat(); show('stats'); }

  /* ---------- history & progress view ---------- */
  let historyReturn = 'start';
  let activeHistoryKey = 'current';

  function openHistory(from, targetKey) {
    historyReturn = from;
    store.history = store.history || [];

    const select = $('#hist-select');
    select.innerHTML = '';

    const currentKey = makeConfigKey(store.settings);
    const curSummary = makeConfigSummary(store.settings);
    const optCur = document.createElement('option');
    optCur.value = 'current';
    optCur.textContent = `Current settings: ${curSummary.title}`;
    select.appendChild(optCur);

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = `All settings (${store.history.length} round${store.history.length === 1 ? '' : 's'} total)`;
    select.appendChild(optAll);

    const configsMap = new Map();
    for (const h of store.history) {
      if (!configsMap.has(h.configKey)) {
        configsMap.set(h.configKey, { count: 0, summary: h.configSummary, settings: h.settings });
      }
      configsMap.get(h.configKey).count++;
    }

    for (const [k, data] of configsMap.entries()) {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = `${data.summary.title} (${data.count} round${data.count > 1 ? 's' : ''})`;
      select.appendChild(opt);
    }

    if (targetKey && configsMap.has(targetKey)) {
      select.value = targetKey;
      activeHistoryKey = targetKey;
    } else {
      select.value = 'current';
      activeHistoryKey = 'current';
    }

    renderHistoryView();
    show('history');
  }

  function renderHistoryView() {
    const currentKey = makeConfigKey(store.settings);
    const selVal = $('#hist-select').value;
    activeHistoryKey = selVal;

    let targetSettings = null;
    let filtered = [];

    if (selVal === 'current') {
      targetSettings = store.settings;
      filtered = (store.history || []).filter(h => h.configKey === currentKey);
    } else if (selVal === 'all') {
      filtered = store.history || [];
    } else {
      filtered = (store.history || []).filter(h => h.configKey === selVal);
      if (filtered.length > 0) targetSettings = filtered[0].settings;
    }

    const summaryBox = $('#hist-summary');
    const emptyMsg = $('#hist-empty');
    const tbody = $('#hist-tbody');
    tbody.innerHTML = '';

    const applyBtn = $('#btn-hist-apply');
    if (applyBtn) {
      applyBtn.style.display = (selVal === 'all' || selVal === 'current' || !targetSettings) ? 'none' : 'inline-flex';
    }

    if (filtered.length === 0) {
      emptyMsg.hidden = false;
      summaryBox.innerHTML = `
        <div class="hist-trend-banner neutral">
          No recorded rounds yet for this combination. Play in any timed mode to log progress!
        </div>
      `;
      return;
    }

    emptyMsg.hidden = true;

    const totalRounds = filtered.length;
    const totalAns = filtered.reduce((s, h) => s + h.total, 0);
    const totalMistakes = filtered.reduce((s, h) => s + h.mistakes, 0);
    const avgMistakes = (totalMistakes / totalRounds).toFixed(1);
    const bestScore = Math.max(...filtered.map(h => h.score));
    const bestAcc = Math.max(...filtered.map(h => h.accuracy));

    let trendHtml = '';
    if (totalRounds >= 2) {
      const latest = filtered[0];
      const oldest = filtered[filtered.length - 1];
      const accDelta = latest.accuracy - oldest.accuracy;
      const mistakeDelta = oldest.mistakes - latest.mistakes;
      let trendText = `Progress across ${totalRounds} rounds: `;
      if (accDelta > 0) {
        trendText += `Accuracy improved by <strong>+${accDelta}%</strong> (${oldest.accuracy}% → ${latest.accuracy}%). `;
      } else if (accDelta < 0) {
        trendText += `Accuracy: ${oldest.accuracy}% → ${latest.accuracy}%. `;
      } else {
        trendText += `Accuracy steady at ${latest.accuracy}%. `;
      }
      if (mistakeDelta > 0) {
        trendText += `Mistakes reduced by <strong>${mistakeDelta}</strong> per round!`;
      }
      trendHtml = `<div class="hist-trend-banner">${trendText}</div>`;
    }

    let tagsHtml = '';
    if (targetSettings) {
      const summ = makeConfigSummary(targetSettings);
      tagsHtml = `
        <div class="hist-config-tags">
          <span class="hist-tag">${esc(summ.modeLabel)}</span>
          <span class="hist-tag">${esc(summ.casesLabel)}</span>
          <span class="hist-tag">${esc(summ.typesLabel)}</span>
          <span class="hist-tag">${esc(summ.numLabel)}</span>
          <span class="hist-tag">${esc(summ.genLabel)}</span>
        </div>
      `;
    }

    summaryBox.innerHTML = `
      ${tagsHtml}
      <div class="hist-stat-cards">
        <div class="hist-stat-card"><span class="val">${totalRounds}</span><span class="lbl">Rounds</span></div>
        <div class="hist-stat-card"><span class="val">${totalAns}</span><span class="lbl">Total Answers</span></div>
        <div class="hist-stat-card"><span class="val">${avgMistakes}</span><span class="lbl">Avg Mistakes</span></div>
        <div class="hist-stat-card"><span class="val">${bestAcc}%</span><span class="lbl">Best Accuracy</span></div>
      </div>
      ${trendHtml}
    `;

    for (const row of filtered) {
      const tr = document.createElement('tr');
      const timeFmt = `${row.timePlayed}s`;
      const accClass = row.accuracy >= 90 ? 'hist-acc-good' : (row.accuracy >= 70 ? 'hist-acc-mid' : 'hist-acc-low');
      const mistakeBadge = row.mistakes === 0
        ? `<span class="hist-badge-mistakes zero">0</span>`
        : `<span class="hist-badge-mistakes some">${row.mistakes}</span>`;

      const modeCol = selVal === 'all'
        ? `${esc(row.configSummary.title)} <small style="display:block;opacity:.6">${timeFmt}</small>`
        : `${esc(row.configSummary.modeLabel)} (${timeFmt})`;

      tr.innerHTML = `
        <td>${esc(formatDate(row.timestamp))}</td>
        <td>${modeCol}</td>
        <td>${row.total}</td>
        <td>${mistakeBadge}</td>
        <td class="${accClass}">${row.accuracy}%</td>
        <td>${row.avgTime}s</td>
        <td><strong>${row.score}</strong></td>
      `;
      tbody.appendChild(tr);
    }
  }

  /* ---------- events ---------- */
  $('#btn-start').addEventListener('click', startGame);
  $('#btn-again').addEventListener('click', startGame);
  $('#btn-menu').addEventListener('click', () => { renderSettings(); show('start'); });
  $('#btn-stats').addEventListener('click', () => openStats('start'));
  $('#btn-stats2').addEventListener('click', () => openStats('results'));
  $('#btn-stats-back').addEventListener('click', () => show(statsReturn));
  $('#btn-stats-reset').addEventListener('click', () => {
    if (confirm('Reset all statistics?')) { store.stats = {}; save(); renderHeat(); }
  });

  $('#btn-history').addEventListener('click', () => openHistory('start'));
  $('#btn-history2').addEventListener('click', () => openHistory('results', game.lastConfigKey));
  $('#btn-hist-back').addEventListener('click', () => show(historyReturn));
  $('#hist-select').addEventListener('change', renderHistoryView);
  $('#btn-hist-apply').addEventListener('click', () => {
    const selVal = $('#hist-select').value;
    const match = (store.history || []).find(h => h.configKey === selVal);
    if (match && match.settings) {
      store.settings = JSON.parse(JSON.stringify(match.settings));
      save();
      renderSettings();
      show('start');
    }
  });
  $('#btn-hist-clear').addEventListener('click', () => {
    if (confirm('Clear all session history?')) {
      store.history = [];
      save();
      renderHistoryView();
    }
  });

  $('#feedback').addEventListener('click', continueAfterMistake);
  $('#btn-game-finish').addEventListener('click', () => endGame());
  $('#btn-game-menu').addEventListener('click', () => {
    game.running = false;
    renderSettings();
    show('start');
  });

  document.addEventListener('keydown', e => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (currentScreen === 'game') {
      if (game.awaiting && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); continueAfterMistake(); return; }
      if (/^[1-4]$/.test(e.key) && !game.awaiting) { e.preventDefault(); choose(+e.key - 1); return; }
      if (e.key === 'Escape') { endGame(); }
    } else if (currentScreen === 'start' && e.key === 'Enter') {
      e.preventDefault(); startGame();
    } else if (currentScreen === 'results' && e.key === 'Enter') {
      e.preventDefault(); startGame();
    } else if (currentScreen === 'stats' && e.key === 'Escape') {
      show(statsReturn);
    } else if (currentScreen === 'history' && e.key === 'Escape') {
      show(historyReturn);
    }
  });

  renderSettings();
})();
