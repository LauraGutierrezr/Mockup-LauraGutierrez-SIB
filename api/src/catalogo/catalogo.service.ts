import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Permisos } from '../comun/rol';
import { Aprobacion, CAMPOS_MANUALES, Despliegue, EventoHistorial, Fuente, LISTAS, Servicio } from './modelo';
import { buscar, Filtros, tecnologiaDe, tipoDe } from './busqueda';

const MIN = 60_000;
const iso = (d: Date | number) => new Date(d).toISOString();

interface EstadoBarrido { cluster: 'no-prod' | 'prd'; fecha: string; ok: boolean; detalle: string }

/**
 * Hace las veces de la base de datos y del worker (piezas 3 y 4) para la demo.
 * Todo vive en memoria y se reinicia al arrancar o con POST /api/v1/demo/reiniciar.
 */
@Injectable()
export class CatalogoService {
  private servicios = new Map<string, Servicio>();
  private usadoPor = new Map<string, string[]>();
  private historial: EventoHistorial[] = [];
  private aprobaciones: Aprobacion[] = [];
  private barridos: EstadoBarrido[] = [];
  private seq = 1;
  private prdSinReportar = false;

  constructor() { this.reiniciar(); }

  reiniciar() {
    const ruta = join(__dirname, '..', '..', 'data', 'servicios.json');
    const datos: Omit<Servicio, 'manual'>[] = JSON.parse(readFileSync(ruta, 'utf8'));
    const ahora = Date.now();
    this.servicios.clear(); this.historial = []; this.aprobaciones = []; this.seq = 1; this.prdSinReportar = false;
    for (const d of datos) {
      const s: Servicio = { ...d, manual: {}, despliegues: d.despliegues.map(x => ({ ...x, vistoEn: iso(ahora - 15 * MIN) })) };
      this.servicios.set(s.clave, s);
      this.evento(s.clave, 'EXCEL', 'Carga única del Excel', 'campos manuales', null, 'importados', '2026-10-01T13:00:00.000Z', 'Marcados “por confirmar”');
      if (s.releaseCD) this.evento(s.clave, 'REPOSITORIO', 'Worker · Azure DevOps', 'release', null, `${s.releaseCD} · ${s.ultimoDespliegue ?? 's/f'}`, iso(ahora - 75 * MIN));
    }
    this.recalcularDependencias();
    this.barridos = [
      { cluster: 'no-prod', fecha: iso(ahora - 15 * MIN), ok: true, detalle: 'Completo · 14 namespaces · 42 s' },
      { cluster: 'prd', fecha: iso(ahora - 15 * MIN), ok: true, detalle: 'Completo · 9 namespaces · 31 s' },
    ];
  }

  private recalcularDependencias() {
    this.usadoPor.clear();
    for (const s of this.servicios.values()) for (const c of s.llama) {
      if (!this.usadoPor.has(c)) this.usadoPor.set(c, []);
      this.usadoPor.get(c)!.push(s.clave);
    }
  }

  private evento(servicio: string, fuente: Fuente, autor: string, campo: string, antes: string | null, despues: string | null, fecha = iso(Date.now()), nota?: string) {
    this.historial.push({ id: this.seq++, servicio, fecha, fuente, autor, campo, antes, despues, nota });
  }

  private obtener(clave: string): Servicio {
    const s = this.servicios.get(clave);
    if (!s) throw new NotFoundException({ mensaje: `No existe el servicio “${clave}”`, sugerencias: this.sugerencias(clave.slice(0, Math.max(4, clave.length - 3))).resultados.map(r => r.clave) });
    return s;
  }

  // ---------- consultas ----------
  pendientes(s: Servicio) {
    return CAMPOS_MANUALES.filter(c => !s[c.campo]).map(c => ({ campo: c.campo, etiqueta: c.etiqueta, sensible: c.sensible, enAprobacion: this.aprobaciones.some(a => a.servicio === s.clave && a.campo === c.campo && a.estado === 'PENDIENTE') }));
  }

  completitud(s: Servicio) {
    const campos = CAMPOS_MANUALES.length + 3;
    const ok = CAMPOS_MANUALES.filter(c => s[c.campo]).length + (s.repositorio ? 1 : 0) + (s.despliegues[0]?.version ? 1 : 0) + (s.tecnologia ? 1 : 0);
    return Math.round((ok / campos) * 100);
  }

  resumido(s: Servicio) {
    return {
      clave: s.clave, id: s.id, nombre: s.nombre, descripcion: s.descripcion, equipo: s.equipo, proyecto: s.proyecto,
      tecnologia: tecnologiaDe(s), tipo: tipoDe(s), ambientes: s.despliegues.filter(d => d.estado !== 'NO_ENCONTRADO').map(d => d.ambiente),
      criticidad: s.criticidad, completitud: this.completitud(s), pendientes: this.pendientes(s).map(p => p.etiqueta),
    };
  }

  listar(q: string | undefined, filtros: Filtros, limite = 40) {
    const t0 = performance.now();
    const todos = buscar([...this.servicios.values()], q, filtros);
    return { total: todos.length, resultados: todos.slice(0, limite).map(s => this.resumido(s)), ms: +(performance.now() - t0).toFixed(1) };
  }

  sugerencias(q: string) {
    const t0 = performance.now();
    const r = buscar([...this.servicios.values()], q, {}).slice(0, 6);
    return { resultados: r.map(s => ({ clave: s.clave, descripcion: s.descripcion, proyecto: s.proyecto, equipo: s.equipo })), ms: +(performance.now() - t0).toFixed(1) };
  }

  catalogo() {
    return [...this.servicios.values()].map(s => this.resumido(s));
  }

  ficha(clave: string, p: Permisos) {
    const t0 = performance.now();
    const s = this.obtener(clave);
    const prdViejo = this.prdSinReportar;
    const procedencia: Record<string, { fuente: Fuente; detalle: string; vistoEn: string | null }> = {};
    const fuenteDe: Record<string, [Fuente, string]> = {
      nombre: ['ANOTACION', 'Deployment en OpenShift'], descripcion: ['ANOTACION', 'sod.descripcion-api'], equipo: ['ANOTACION', 'sod.celula'],
      proyecto: ['ANOTACION', 'sod.proyecto'], responsable: ['ANOTACION', 'sod.contacto-solucion'], tecnologia: ['REPOSITORIO', 'package.json / pom.xml'],
      repositorio: ['REPOSITORIO', 'Azure DevOps'], releaseCD: ['REPOSITORIO', 'Azure DevOps'], bases: ['DEDUCIDO', 'Variables interpretadas'],
      negocio: ['EXCEL', 'Excel · por confirmar'], documentacion: ['EXCEL', 'Excel · por confirmar'], criticidad: ['MANUAL', 'Manual'], impacto: ['MANUAL', 'Manual'],
    };
    for (const [campo, [fuente, detalle]] of Object.entries(fuenteDe)) {
      const m = s.manual[campo];
      const valor = (s as any)[campo];
      if (m) procedencia[campo] = { fuente: 'MANUAL', detalle: `Escrito por ${m.autor}`, vistoEn: m.fecha };
      else if (valor && (!Array.isArray(valor) || valor.length)) procedencia[campo] = { fuente, detalle, vistoEn: fuente === 'EXCEL' ? '2026-10-01T13:00:00.000Z' : s.despliegues[0]?.vistoEn ?? null };
    }
    const restringidos: string[] = [];
    if (!p.tecnico) restringidos.push('namespaces', 'rutas', 'dependencias', 'bases y esquemas', 'secretos', 'pipelines');
    if (!p.restringido) restringidos.push('hosts, IP y puertos', 'variables interpretadas');

    const despliegues = (['DEV', 'QA', 'PRD'] as const).map(amb => {
      const d = s.despliegues.find(x => x.ambiente === amb);
      const vistoEn = d ? (amb === 'PRD' && prdViejo ? iso(Date.now() - 5 * 60 * MIN) : d.vistoEn) : null;
      return {
        ambiente: amb, cluster: amb === 'PRD' ? 'prd' : 'no-prod', desplegado: !!d && d.estado !== 'NO_ENCONTRADO', estado: d?.estado ?? 'NO_DESPLEGADO',
        version: d?.version ?? null, vistoEn, datoViejo: amb === 'PRD' && prdViejo,
        namespace: p.tecnico ? d?.namespace ?? null : undefined,
        ruta: p.tecnico && d?.namespace ? `https://${s.clave}-${d.namespace}.apps…` : undefined,
      };
    });

    const respuesta = {
      clave: s.clave, id: s.id, nombre: s.nombre, descripcion: s.descripcion, tecnologia: s.tecnologia, runtime: s.runtime, tipo: s.tipo,
      tipoCorto: tipoDe(s), tecnologiaCorta: tecnologiaDe(s), equipo: s.equipo, proyecto: s.proyecto, negocio: s.negocio, responsable: s.responsable,
      estado: s.estado, criticidad: s.criticidad, impacto: s.impacto, documentacion: s.documentacion, repositorio: s.repositorio, rama: s.rama,
      ultimoDespliegue: s.ultimoDespliegue, completitud: this.completitud(s), pendientes: this.pendientes(s), manual: s.manual, procedencia, despliegues,
      datoViejo: prdViejo ? 'El clúster PRD no reporta hace 5 h. Lo de PRD puede no estar al día.' : null,
      restringidos,
      // técnico
      pipelines: p.tecnico ? { ci: s.pipelineCI, cd: s.releaseCD } : undefined,
      bases: p.tecnico ? s.bases : undefined,
      secretos: p.tecnico ? s.secretos : undefined,
      llama: p.tecnico ? s.llama : undefined,
      usadoPor: p.tecnico ? this.usadoPor.get(s.clave) ?? [] : undefined,
      conteos: { llama: s.llama.length, usadoPor: (this.usadoPor.get(s.clave) ?? []).length, bases: s.bases.length },
      // restringido
      configuracion: p.restringido ? {
        DB_SERVICE: s.bases[0]?.nombre ?? null, DB_HOST: s.bases.length ? '10.•.•.•:1530 (enmascarado en la demo)' : null,
        DB_USER: s.bases[0]?.esquema ?? null, DB_PASSWORD: s.secretos[0] ? `secreto: ${s.secretos[0]} · el valor nunca se guarda` : null,
      } : undefined,
      ms: 0,
    };
    respuesta.ms = +(performance.now() - t0).toFixed(1);
    return respuesta;
  }

  impacto(clave: string, desde: 'servicio' | 'base', p: Permisos) {
    if (!p.tecnico) throw new ForbiddenException('El análisis de impacto usa dependencias técnicas: grupos SIB y Plataforma.');
    const t0 = performance.now();
    const s = this.obtener(clave);
    const base = s.bases[0];
    let origen = s.clave;
    let nivel1: { clave: string; via: string }[];
    if (desde === 'base' && base) {
      origen = `${base.nombre}${base.esquema ? ' / ' + base.esquema : ''}`;
      nivel1 = [...this.servicios.values()].filter(o => o.bases.some(b => b.nombre === base.nombre && (!base.esquema || !b.esquema || b.esquema === base.esquema))).map(o => ({ clave: o.clave, via: origen }));
    } else {
      nivel1 = (this.usadoPor.get(s.clave) ?? []).map(c => ({ clave: c, via: s.clave }));
    }
    // Recorrido hacia atrás nivel por nivel (equivale al WITH RECURSIVE de la base).
    const vistos = new Set<string>([s.clave, ...nivel1.map(x => x.clave)]);
    const niveles = [nivel1];
    let frontera = nivel1.map(x => x.clave);
    for (let i = 0; i < 4 && frontera.length; i++) {
      const sig: { clave: string; via: string }[] = [];
      for (const n of frontera) for (const u of this.usadoPor.get(n) ?? []) if (!vistos.has(u)) { vistos.add(u); sig.push({ clave: u, via: n }); }
      if (sig.length) niveles.push(sig);
      frontera = sig.map(x => x.clave);
    }
    const enriquecer = (x: { clave: string; via: string }) => {
      const o = this.servicios.get(x.clave)!;
      return { ...x, ambientes: o.despliegues.map(d => d.ambiente), criticidad: o.criticidad };
    };
    const nivelesOut = niveles.filter(l => l.length).map(l => l.map(enriquecer));
    const todos = nivelesOut.flat();
    return {
      origen, desde: desde === 'base' && base ? 'base' : 'servicio', baseDisponible: base ? base.nombre : null,
      niveles: nivelesOut, total: todos.length, enPRD: todos.filter(x => x.ambientes.includes('PRD')).length,
      ms: +(performance.now() - t0).toFixed(1),
    };
  }

  historialDe(clave: string) {
    this.obtener(clave);
    return this.historial.filter(e => e.servicio === clave).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  // ---------- datos manuales ----------
  actualizarManual(clave: string, cambios: Record<string, string>, p: Permisos) {
    if (!p.editar) throw new ForbiddenException('Tu rol puede ver, pero no editar. Editan el responsable del servicio y los curadores.');
    const s = this.obtener(clave);
    const guardados: string[] = []; const enAprobacion: string[] = [];
    for (const [campo, valorCrudo] of Object.entries(cambios ?? {})) {
      const def = CAMPOS_MANUALES.find(c => c.campo === campo);
      const valor = String(valorCrudo ?? '').trim();
      if (!def) throw new BadRequestException(`El campo “${campo}” no se completa a mano.`);
      if (!valor) continue;
      if (campo === 'criticidad' && !LISTAS.criticidad.includes(valor)) throw new BadRequestException('Criticidad debe ser Alta, Media o Baja.');
      if (campo === 'impacto' && !LISTAS.impacto.includes(valor)) throw new BadRequestException('Impacto debe ser un valor de la lista.');
      if (def.sensible && !p.aprobar) {
        this.aprobaciones.push({ id: this.seq++, servicio: s.clave, campo: campo as 'criticidad' | 'impacto', etiqueta: def.etiqueta, valor, propuestoPor: p.usuario, fecha: iso(Date.now()), estado: 'PENDIENTE' });
        enAprobacion.push(def.etiqueta);
      } else {
        this.aplicarManual(s, campo, valor, p.usuario);
        guardados.push(def.etiqueta);
      }
    }
    if (!guardados.length && !enAprobacion.length) throw new BadRequestException('Llena al menos un campo para guardar.');
    return { guardados, enAprobacion, servicio: this.ficha(clave, p) };
  }

  private aplicarManual(s: Servicio, campo: string, valor: string, autor: string, nota?: string) {
    const antes = (s as any)[campo] ?? null;
    (s as any)[campo] = valor;
    s.manual[campo] = { valor, autor, fecha: iso(Date.now()) };
    const etiqueta = CAMPOS_MANUALES.find(c => c.campo === campo)?.etiqueta ?? campo;
    this.evento(s.clave, 'MANUAL', autor, etiqueta, antes, valor, undefined, nota);
  }

  listarAprobaciones() { return this.aprobaciones.slice().sort((a, b) => b.id - a.id); }

  decidir(id: number, aprobar: boolean, p: Permisos) {
    if (!p.aprobar) throw new ForbiddenException('Solo el líder técnico aprueba criticidad e impacto.');
    const a = this.aprobaciones.find(x => x.id === id);
    if (!a) throw new NotFoundException('No existe esa aprobación.');
    if (a.estado !== 'PENDIENTE') throw new BadRequestException('Esa aprobación ya se decidió.');
    a.estado = aprobar ? 'APROBADO' : 'RECHAZADO'; a.decididoPor = p.usuario;
    if (aprobar) this.aplicarManual(this.obtener(a.servicio), a.campo, a.valor, a.propuestoPor, `Aprobado por ${p.usuario}`);
    return a;
  }

  misPendientes() {
    return ['clientespqrsrca', 'postcustomerrca', 'backrca', 'obtenerrca']
      .map(c => this.servicios.get(c)).filter((s): s is Servicio => !!s)
      .map(s => ({ clave: s.clave, pendientes: this.pendientes(s) })).filter(x => x.pendientes.length);
  }

  // ---------- ingesta (flujo A) ----------
  /**
   * Recibe la foto de un colector. Compara con lo guardado y registra solo lo que cambió.
   * Nunca toca campos manuales; lo que desaparece queda NO_ENCONTRADO, no se borra.
   */
  ingerir(foto: { cluster: 'no-prod' | 'prd'; tomadaEn?: string; despliegues: { servicio: string; ambiente: 'DEV' | 'QA' | 'PRD'; namespace: string | null; version: string | null; estado?: Despliegue['estado']; hash?: string }[]; errores?: string[] }) {
    if (!foto || !['no-prod', 'prd'].includes(foto.cluster) || !Array.isArray(foto.despliegues)) throw new BadRequestException('Foto inválida: se esperan cluster y despliegues.');
    const ambientesDelCluster = foto.cluster === 'prd' ? ['PRD'] : ['DEV', 'QA'];
    if (foto.despliegues.some(d => !ambientesDelCluster.includes(d.ambiente))) throw new ForbiddenException('Un colector solo puede escribir los despliegues de su propio clúster.');
    const ahora = foto.tomadaEn ?? iso(Date.now());
    const autor = `Colector ${foto.cluster}`;
    const cambios: { servicio: string; ambiente: string; campo: string; antes: string | null; despues: string | null }[] = [];
    let nuevos = 0; let noEncontrados = 0;
    const vistos = new Set<string>();
    for (const d of foto.despliegues) {
      const s = this.servicios.get(d.servicio);
      if (!s) continue; // en producción se crea el servicio con sus campos POR_COMPLETAR
      vistos.add(`${s.clave}|${d.ambiente}`);
      let actual = s.despliegues.find(x => x.ambiente === d.ambiente);
      if (!actual) { actual = { ambiente: d.ambiente, cluster: foto.cluster, namespace: d.namespace, version: d.version, estado: d.estado ?? 'CORRIENDO', vistoEn: ahora }; s.despliegues.push(actual); nuevos++; this.evento(s.clave, 'COLECTOR', autor, `Despliegue ${d.ambiente}`, null, 'nuevo', ahora); continue; }
      for (const campo of ['version', 'namespace', 'estado'] as const) {
        const nuevo = (d as any)[campo] ?? actual[campo];
        if (nuevo !== actual[campo]) {
          cambios.push({ servicio: s.clave, ambiente: d.ambiente, campo, antes: actual[campo], despues: nuevo });
          this.evento(s.clave, 'COLECTOR', autor, `${campo === 'version' ? 'Versión' : campo === 'estado' ? 'Estado' : 'Namespace'} en ${d.ambiente}`, actual[campo], nuevo, ahora);
          (actual as any)[campo] = nuevo;
        }
      }
      actual.vistoEn = ahora; actual.hash = d.hash;
    }
    if (!(foto.errores && foto.errores.length)) {
      for (const s of this.servicios.values()) for (const d of s.despliegues) {
        if (ambientesDelCluster.includes(d.ambiente) && !vistos.has(`${s.clave}|${d.ambiente}`) && d.estado !== 'NO_ENCONTRADO') {
          this.evento(s.clave, 'COLECTOR', autor, `Despliegue ${d.ambiente}`, d.estado, 'NO_ENCONTRADO', ahora, 'Se marca, no se borra');
          d.estado = 'NO_ENCONTRADO'; noEncontrados++;
        }
      }
    }
    const ok = !(foto.errores && foto.errores.length);
    const b = this.barridos.find(x => x.cluster === foto.cluster)!;
    b.fecha = ahora; b.ok = ok;
    b.detalle = ok ? `Completo · ${foto.despliegues.length} despliegues` : `Incompleto · ${foto.errores!.join('; ')}`;
    if (foto.cluster === 'prd') this.prdSinReportar = false;
    return { aceptada: true, cluster: foto.cluster, despliegues: foto.despliegues.length, cambios, nuevos, noEncontrados, errores: foto.errores ?? [], aviso: ok ? null : `Aviso a Teams: el barrido de ${foto.cluster} terminó incompleto (${foto.errores!.join('; ')})` };
  }

  /** Simula lo que haría el colector de no-prod: arma la foto del estado actual con un cambio de versión. */
  barridoDemo(fallo: boolean) {
    const t0 = performance.now();
    const despliegues: Parameters<CatalogoService['ingerir']>[0]['despliegues'] = [];
    let secretosBorrados = 0;
    for (const s of this.servicios.values()) for (const d of s.despliegues) {
      if (d.ambiente === 'PRD' || d.estado === 'NO_ENCONTRADO') continue;
      let version = d.version;
      if (s.clave === 'clientespqrsrca' && d.ambiente === 'QA') {
        const [ma, mi] = (version ?? '1.0').split('.').map(Number);
        version = `${ma}.${(mi || 0) + 1}`;
      }
      secretosBorrados += s.secretos.length;
      despliegues.push({ servicio: s.clave, ambiente: d.ambiente, namespace: d.namespace, version, estado: d.estado, hash: Math.abs(hash(`${s.clave}${d.ambiente}${version}`)).toString(16) });
    }
    const errores = fallo ? ['403 al leer rutas en crm-salesforce-qa'] : [];
    const resultado = this.ingerir({ cluster: 'no-prod', despliegues, errores });
    const ejemplo = this.servicios.get('clientespqrsrca');
    return {
      ...resultado, secretosBorrados, ms: +(performance.now() - t0).toFixed(1),
      ejemploFoto: ejemplo ? {
        servicio: ejemplo.clave, namespace: ejemplo.despliegues.find(d => d.ambiente === 'QA')?.namespace, imagen: `${ejemplo.clave}:${ejemplo.despliegues.find(d => d.ambiente === 'QA')?.version}`,
        anotaciones: { 'sod.proyecto': ejemplo.proyecto, 'sod.celula': ejemplo.equipo },
        variables: { DB_SERVICE: ejemplo.bases[0]?.nombre, DB_USER: ejemplo.bases[0]?.esquema, DB_PASSWORD: '[borrado en el clúster]' },
        secretos: ejemplo.secretos,
      } : null,
    };
  }

  marcarPrdSinReportar(valor: boolean) {
    this.prdSinReportar = valor;
    const b = this.barridos.find(x => x.cluster === 'prd')!;
    if (valor) { b.ok = false; b.fecha = iso(Date.now() - 5 * 60 * MIN); b.detalle = 'Sin reportar hace 5 h'; }
    else { b.ok = true; b.fecha = iso(Date.now() - 15 * MIN); b.detalle = 'Completo · 9 namespaces · 31 s'; }
    return { prdSinReportar: valor };
  }

  resumen() {
    const todos = [...this.servicios.values()];
    const total = todos.length;
    return {
      total,
      completitud: Math.round(todos.reduce((a, s) => a + this.completitud(s), 0) / total),
      sinCriticidad: todos.filter(s => !s.criticidad).length,
      enQaSinPrd: todos.filter(s => s.despliegues.some(d => d.ambiente === 'QA') && !s.despliegues.some(d => d.ambiente === 'PRD')).length,
      noEncontrados: todos.filter(s => s.despliegues.some(d => d.estado === 'NO_ENCONTRADO')).length,
      barridos: this.barridos,
      prdSinReportar: this.prdSinReportar,
      cambiosRecientes: this.historial.filter(e => e.fuente === 'COLECTOR' || e.fuente === 'MANUAL').sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6),
      proyectos: Object.entries(todos.reduce<Record<string, number>>((acc, s) => { if (s.proyecto) acc[s.proyecto] = (acc[s.proyecto] ?? 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).map(([nombre, servicios]) => ({ nombre, servicios })),
      equipos: [...new Set(todos.map(s => s.equipo).filter(Boolean))].sort(),
      negocios: [...new Set(todos.flatMap(s => (s.negocio ?? '').split('/').map(x => x.trim())).filter(x => x && x.length < 30))].sort(),
      listas: LISTAS,
    };
  }
}

function hash(t: string) { let h = 0; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; }
