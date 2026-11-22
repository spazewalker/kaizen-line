import { ITEMS } from '../js/tracks/japanese/data/items.js';
import { SCENARIOS } from '../js/tracks/japanese/data/scenarios.js';
import { writeFileSync } from 'fs';
const m = {};
Object.values(ITEMS).forEach(x => { m[x.jp] = x.ro; });
Object.values(SCENARIOS).forEach(sc => sc.steps.forEach(st => { m[st.npc.jp] = st.npc.ro; st.ch.forEach(c => { m[c.jp] = c.ro; }); }));
writeFileSync('/tmp/ja_ro.json', JSON.stringify(m));
