#!/usr/bin/env node
/**
 * check-tokens.mjs - сверка CSS-токенов каждого гайда с эталоном из корневого DESIGN.md.
 *
 * Зачем: токены копируются в каждый гайд физически (гайд самодостаточен и деплоится как
 * отдельный статический сайт). Копии расходятся молча - как разошлись упоминания шрифта
 * Fraunces, удалённого из серии, но оставшегося в запретах локального DESIGN.md.
 * Закон на бумаге без механической проверки деградирует, поэтому эталон живёт ровно в
 * одном месте - в блоках DESIGN.md, помеченных <!-- canonical:<группа> -->, - и читается
 * отсюда, а не дублируется в скрипте.
 *
 * Проверяет:
 *   1. базовые токены (base / text / hues / layout) присутствуют и значения совпадают;
 *   2. семантические роли покрыты - хотя бы одним токеном с нужным значением
 *      (имя гайд выбирает сам, см. DESIGN.md §1);
 *   3. правило брендового акцента: eyebrow не красится в цвет, занятый семантикой потери;
 *   4. номера разделов, на которые ссылается код гайда, существуют в его DESIGN.md
 *      или в корневом.
 *
 * Запуск:  node tools/check-tokens.mjs            - все гайды
 *          node tools/check-tokens.mjs <папка>     - один гайд
 * Выход:   0 - расхождений нет, 1 - есть (пригодно для CI).
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAW = join(ROOT, 'DESIGN.md');

/* Семантические роли из DESIGN.md §1: значение → человекочитаемая роль.
   Имя токена не фиксировано (гайд называет под свою тему), фиксировано значение. */
const SEMANTIC_ROLES = [
  { value: '#4f46e5', role: 'логика / активный UI', required: true },
  { value: '#0a9e63', role: 'успех / «прошло»', required: true },
  { value: '#b45309', role: 'внимание / оговорка', required: true },
  { value: '#e11d48', role: 'потеря / отказ', required: false },
];

const red = s => `\x1b[31m${s}\x1b[0m`;
const green = s => `\x1b[32m${s}\x1b[0m`;
const yellow = s => `\x1b[33m${s}\x1b[0m`;
const dim = s => `\x1b[2m${s}\x1b[0m`;

/** Токены из ```css```-блока, помеченного `<!-- canonical:<name> -->`. */
function parseCanonical(md) {
  const groups = {};
  const re = /<!--\s*canonical:([a-z]+)\s*-->\s*```css\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md))) groups[m[1]] = parseDecls(m[2]);
  return groups;
}

/** `--name:value;` → Map(name → value). Комментарии и пустые строки отбрасываются. */
function parseDecls(css) {
  const out = new Map();
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(css.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    out.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

/** Первый блок `:root{...}` файла. */
function rootBlock(css) {
  const i = css.indexOf(':root{');
  if (i === -1) return null;
  let depth = 0;
  for (let j = i + 5; j < css.length; j++) {
    if (css[j] === '{') depth++;
    else if (css[j] === '}' && --depth === 0) return css.slice(i, j + 1);
  }
  return null;
}

/** Цвет, которым покрашен `.eyebrow` - для правила брендового акцента. */
function eyebrowToken(css) {
  const m = /\.eyebrow\s*\{[^}]*?color\s*:\s*var\((--[a-z0-9-]+)\)/i.exec(css);
  return m ? m[1] : null;
}

/** Ссылки вида `DESIGN.md §3.7` во всех исходниках гайда. */
function sectionRefs(dir) {
  const refs = new Set();
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); continue; }
      if (!/\.(css|js|mjs|html)$/.test(e.name)) continue;
      const src = readFileSync(p, 'utf8');
      const re = /DESIGN\.md\s*§\s*([0-9]+(?:\.[0-9]+)?)/g;
      let m;
      while ((m = re.exec(src))) refs.add(m[1]);
    }
  };
  walk(dir);
  return [...refs].sort((a, b) => parseFloat(a) - parseFloat(b));
}

/** Номера разделов, объявленные в markdown-файле (## 3. / ### 3.7 ...). */
function sections(md) {
  const out = new Set();
  const re = /^#{2,3}\s+([0-9]+(?:\.[0-9]+)?)[.\s]/gm;
  let m;
  while ((m = re.exec(md))) out.add(m[1]);
  return out;
}

function checkGuide(dir, canon) {
  const name = basename(dir);
  const problems = [], notes = [];
  const cssPath = join(dir, 'styles.css');

  if (!existsSync(cssPath)) return { name, problems: ['styles.css не найден'], notes };
  const css = readFileSync(cssPath, 'utf8');
  const root = rootBlock(css);
  if (!root) return { name, problems: [':root{...} не найден в styles.css'], notes };

  const have = parseDecls(root);

  /* 1. Базовые группы - значения обязаны совпадать дословно. */
  for (const [group, expected] of Object.entries(canon)) {
    for (const [tok, val] of expected) {
      if (!have.has(tok)) problems.push(`нет токена ${tok} (группа ${group}, ожидалось ${val})`);
      else if (have.get(tok) !== val)
        problems.push(`${tok}: ${have.get(tok)} ≠ эталон ${val} (группа ${group})`);
    }
  }

  /* 2. Семантические роли - по значению, имя произвольно. */
  const byValue = new Map();
  for (const [tok, val] of have) {
    const v = val.toLowerCase();
    if (!byValue.has(v)) byValue.set(v, []);
    byValue.get(v).push(tok);
  }
  for (const { value, role, required } of SEMANTIC_ROLES) {
    const owners = (byValue.get(value) || []).filter(t => !t.startsWith('--c-'));
    if (!owners.length) {
      const msg = `роль «${role}» (${value}) не покрыта ни одним семантическим токеном`;
      required ? problems.push(msg) : notes.push(msg + ' - допустимо, если в теме нет такого состояния');
    }
  }

  /* 3. Правило брендового акцента: eyebrow ≠ цвет семантики потери. */
  const eb = eyebrowToken(css);
  if (eb) {
    const ebVal = (have.get(eb) || '').toLowerCase();
    /* Владельцы семантики потери. `--brand` исключён по определению (он и есть брендовый
       штрих), сам токен eyebrow - НЕТ: покрасить eyebrow прямо в `--accent-drop` и есть
       самый прямой вид нарушения, и раньше он тут молча отфильтровывался. */
    const lossOwners = (byValue.get('#e11d48') || [])
      .filter(t => !t.startsWith('--c-') && t !== '--brand');
    if (ebVal === '#e11d48' && lossOwners.length)
      problems.push(
        `.eyebrow покрашен в ${eb} (${ebVal}), но этот цвет занят семантикой потери ` +
        `(${lossOwners.join(', ')}) - см. правило брендового акцента, DESIGN.md §1`);
  } else {
    notes.push('не удалось определить цвет .eyebrow - правило брендового акцента не проверено');
  }

  /* 4. Ссылки из кода на разделы - должны существовать локально или в законе. */
  const lawSections = sections(readFileSync(LAW, 'utf8'));
  const localDesign = join(dir, 'DESIGN.md');
  const localSections = existsSync(localDesign)
    ? sections(readFileSync(localDesign, 'utf8')) : new Set();
  for (const ref of sectionRefs(dir)) {
    if (!lawSections.has(ref) && !localSections.has(ref))
      problems.push(`код ссылается на DESIGN.md §${ref}, но такого раздела нет ни в корневом, ни в локальном`);
  }

  return { name, problems, notes };
}

/* ---------------- main ---------------- */

if (!existsSync(LAW)) {
  console.error(red(`не найден корневой DESIGN.md (${LAW})`));
  process.exit(1);
}
const canon = parseCanonical(readFileSync(LAW, 'utf8'));
if (!Object.keys(canon).length) {
  console.error(red('в DESIGN.md нет ни одного блока <!-- canonical:... --> - нечего сверять'));
  process.exit(1);
}

const arg = process.argv[2];
const guides = arg
  ? [resolve(process.cwd(), arg)]      // resolve, не join - принимает и абсолютный путь
  : readdirSync(ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')
                   && e.name !== 'tools' && existsSync(join(ROOT, e.name, 'styles.css')))
      .map(e => join(ROOT, e.name));

if (!guides.length) {
  console.log(yellow('гайдов не найдено'));
  process.exit(0);
}

console.log(dim(`эталон: DESIGN.md · группы: ${Object.keys(canon).join(', ')}\n`));

let failed = 0;
for (const dir of guides) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.log(`${red('✗')} ${basename(dir)} - папка не найдена`);
    failed++;
    continue;
  }
  const { name, problems, notes } = checkGuide(dir, canon);
  if (problems.length) {
    failed++;
    console.log(`${red('✗')} ${name} - расхождений: ${problems.length}`);
    for (const p of problems) console.log(`    ${red('•')} ${p}`);
  } else {
    console.log(`${green('✓')} ${name}`);
  }
  for (const n of notes) console.log(`    ${dim('·')} ${dim(n)}`);
}

console.log();
if (failed) {
  console.log(red(`расхождения в ${failed} из ${guides.length} - см. DESIGN.md`));
  process.exit(1);
}
console.log(green(`все гайды (${guides.length}) соответствуют закону`));
