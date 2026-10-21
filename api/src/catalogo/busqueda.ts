import { Servicio } from './modelo';

/**
 * Búsqueda tolerante a errores por trigramas.
 * En producción: tsvector + pg_trgm (PostgreSQL) u Oracle Text. Mismo comportamiento esperado.
 */
export interface Filtros { equipo?: string; proyecto?: string; tecnologia?: string; ambiente?: string; tipo?: string }

const cache = new Map<string, Set<string>>();
function trigramas(t: string): Set<string> {
  const k = t.toLowerCase();
  let r = cache.get(k);
  if (r) return r;
  const s = ' ' + k.replace(/[^a-z0-9]/g, ' ') + ' ';
  r = new Set<string>();
  for (let i = 0; i < s.length - 2; i++) r.add(s.slice(i, i + 3));
  cache.set(k, r);
  return r;
}

export function tecnologiaDe(s: Pick<Servicio, 'tecnologia'>): string {
  const t = (s.tecnologia ?? '').toLowerCase();
  if (t.includes('camel')) return 'Quarkus + Camel';
  if (t.includes('quarkus')) return 'Quarkus';
  if (t.includes('node')) return 'Node.js';
  if (t.includes('angular')) return 'Angular';
  if (t.includes('java')) return 'Java';
  return s.tecnologia ? 'Otro' : 'Sin dato';
}

export function tipoDe(s: Pick<Servicio, 'tipo'>): string {
  const t = (s.tipo ?? '').toLowerCase();
  if (t.includes('cron')) return 'CronJob';
  if (t.includes('event')) return 'Eventos';
  if (t.includes('api') || t.includes('rest')) return 'API';
  return s.tipo ? 'Deployment' : 'Sin dato';
}

export function puntaje(s: Servicio, q: string): number {
  const n = s.nombre.toLowerCase();
  let sc = 0;
  if (n === q) sc = 3; else if (n.startsWith(q)) sc = 2; else if (n.includes(q)) sc = 1.5;
  const tq = trigramas(q); const tn = trigramas(n);
  let inter = 0; tq.forEach(t => { if (tn.has(t)) inter++; });
  sc += (inter / Math.max(tq.size, 1)) * 0.9;
  if ((s.descripcion ?? '').toLowerCase().includes(q)) sc += 0.4;
  if ((s.proyecto ?? '').toLowerCase().includes(q)) sc += 0.3;
  if (s.bases.some(b => b.nombre.toLowerCase() === q || (b.esquema ?? '').toLowerCase() === q)) sc += 1;
  return sc;
}

export function buscar(todos: Servicio[], q: string | undefined, f: Filtros): Servicio[] {
  const filtrados = todos.filter(s =>
    (!f.equipo || s.equipo === f.equipo) && (!f.proyecto || s.proyecto === f.proyecto) &&
    (!f.tecnologia || tecnologiaDe(s) === f.tecnologia) && (!f.tipo || tipoDe(s) === f.tipo) &&
    (!f.ambiente || s.despliegues.some(d => d.ambiente === f.ambiente)));
  const query = (q ?? '').trim().toLowerCase();
  if (!query) return filtrados;
  return filtrados.map(s => ({ s, sc: puntaje(s, query) })).filter(r => r.sc > 0.45).sort((a, b) => b.sc - a.sc).map(r => r.s);
}
