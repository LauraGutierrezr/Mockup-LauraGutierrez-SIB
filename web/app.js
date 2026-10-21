/* Catálogo SIB · web de demostración (pieza 5).
   Todo dato sale de la API (pieza 2) en /api/v1. El rol se envía en la cabecera X-Demo-Rol,
   que en producción reemplaza el token de Entra ID. */
(function () {
"use strict";

const API = "/api/v1";
const ROLES = {
  lector: { label: "Lector · todo TI", group: "TI-Todos" },
  tecnico: { label: "Técnico · SIB", group: "SIB-Integraciones" },
  restringido: { label: "Restringido · DBA", group: "Arquitectura-DBA" },
  lider: { label: "Líder técnico", group: "SIB-Lideres" },
};
const USERS = { ana: { name: "Carlos Cantillo", ini: "CC", mail: "carlos.cantillo@empresa.co" }, lider: { name: "Carlos Pérez", ini: "CP", mail: "carlos.perez@empresa.co" } };
const user = () => (st.role === "lider" ? USERS.lider : USERS.ana);
const CAT_COLORS = ["#0072CE", "#DD0021", "#212529", "#0072CE", "#00796b", "#DD0021", "#212529", "#0072CE"];

const st = {
  scene: "recoleccion", role: "tecnico", svc: "clientespqrsrca", tab: "resumen", q: "", logged: false,
  fail: false, sweepStep: -1, sweepRunning: false, sweep: null, sheet: "Resumen",
  filters: { equipo: "", proyecto: "", tecnologia: "", ambiente: "", tipo: "" },
  impactMode: "servicio", completeFor: "clientespqrsrca", loginStep: 0, yo: null,
  d: { resumen: null, catalogo: [], mis: [], aprob: [], ficha: {}, impacto: null, hist: {}, lista: null },
  error: null,
};

/* ---------------- utilidades ---------------- */
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hhmm = (d) => new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false });
function hace(isoStr) {
  if (!isoStr) return "—";
  const min = Math.max(0, Math.round((Date.now() - new Date(isoStr)) / 60000));
  if (min < 1) return "hace segundos";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return new Date(isoStr).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}
const fecha = (s) => (s ? new Date(s + (s.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—");
function log(piece, html) {
  const names = { 1: "Colector", 2: "API", 3: "Worker", 4: "BD", 5: "Web" };
  const el = document.createElement("div");
  el.className = "bs-item";
  el.innerHTML = `<span class="piece p${piece}">${piece} ${names[piece]}</span><div class="txt">${html}</div><time>${hhmm(Date.now())}</time>`;
  $("#bsLog").prepend(el);
}
function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  $("#toastHost").appendChild(t); setTimeout(() => t.remove(), 2800);
}
function hl(name, q) {
  const i = name.toLowerCase().indexOf((q || "").toLowerCase());
  if (!q || i < 0) return esc(name);
  return esc(name.slice(0, i)) + "<mark>" + esc(name.slice(i, i + q.length)) + "</mark>" + esc(name.slice(i + q.length));
}

/* ---------------- llamadas a la API ---------------- */
async function api(path, opts = {}) {
  const t0 = performance.now();
  const r = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", "X-Demo-Rol": st.role, "X-Demo-Usuario": encodeURIComponent(user().name), ...(opts.headers || {}) },
  });
  const ms = Math.round(performance.now() - t0);
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const m = body && body.message;
    const msg = Array.isArray(m) ? m.join(", ") : typeof m === "string" ? m : (m && m.mensaje) || `Error ${r.status}`;
    const e = new Error(msg); e.status = r.status; e.body = body; throw e;
  }
  return { body, ms };
}
const qs = (o) => Object.entries(o).filter(([, v]) => v !== "" && v != null).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");

async function cargarBase() {
  const [res, cat, mis, apr] = await Promise.all([api("/resumen"), api("/catalogo"), api("/mis-pendientes"), api("/aprobaciones")]);
  st.d.resumen = res.body; st.d.catalogo = cat.body; st.d.mis = mis.body; st.d.aprob = apr.body;
}
async function cargarFicha(clave, silencioso) {
  const { body, ms } = await api(`/servicios/${encodeURIComponent(clave)}`);
  st.d.ficha[clave] = body;
  if (!silencioso) {
    log(2, `GET <code>/servicios/${esc(clave)}</code> · ${ms} ms · permisos de ${esc(ROLES[st.role].label)}`);
    log(4, `1 consulta: servicio + despliegues + dependencias · ${body.ms} ms en el servidor`);
    if (body.restringidos.length) log(2, `Campos quitados antes de responder: ${esc(body.restringidos.join(", "))}`);
  }
  return body;
}
async function cargarImpacto() {
  st.d.impacto = null; render();
  try {
    const { body, ms } = await api(`/servicios/${encodeURIComponent(st.svc)}/impacto?desde=${st.impactMode}`);
    st.d.impacto = body;
    log(2, `GET <code>/servicios/${esc(st.svc)}/impacto${st.impactMode === "base" ? "?desde=base" : ""}</code> · ${ms} ms`);
    log(4, `Recorrido recursivo: ${body.total} servicios en ${body.niveles.length} niveles · ${body.ms} ms`);
  } catch (e) { st.d.impacto = { error: e.message }; }
  render();
}
async function cargarHistorial(clave) {
  const { body, ms } = await api(`/servicios/${encodeURIComponent(clave)}/historial`);
  st.d.hist[clave] = body;
  log(2, `GET <code>/servicios/${esc(clave)}/historial</code> · ${body.length} eventos · ${ms} ms`);
  render();
}
async function cargarLista() {
  st.d.lista = null; render();
  const { body, ms } = await api(`/servicios?${qs({ q: st.q, ...st.filters, limite: 40 })}`);
  st.d.lista = body;
  log(2, `GET <code>/servicios?${esc(qs({ q: st.q, ...st.filters }))}</code> · ${body.total} resultados · ${ms} ms`);
  render();
}

/* ---------------- escenas ---------------- */
const SCENES = [
  { id: "recoleccion", n: 1, label: "Recolección", eyebrow: "Flujo A · Barrido", title: "Cada hora, el colector toma una foto de cada clúster",
    text: "El colector corre solo en no-prod y en PRD, lee lo desplegado sin tocar secretos y envía la foto al núcleo. El worker compara y guarda solo lo que cambió. Pulsa “Ejecutar barrido”: la foto se envía de verdad a la API." },
  { id: "avisos", n: 2, label: "Avisos", eyebrow: "Flujo B · Reporte y aviso", title: "El equipo se entera sin entrar a buscar",
    text: "Lunes 6:00 a. m.: tarjeta en el canal de Teams y Excel por correo. Cada responsable recibe solo lo suyo. Si un barrido falla, el aviso sale el mismo día." },
  { id: "ingreso", n: 3, label: "Ingreso", eyebrow: "Entra ID · OIDC + PKCE", title: "Se entra con la cuenta corporativa",
    text: "No hay usuarios nuevos: el grupo de Entra ID llega como rol en el token y la API decide qué se muestra. Cambia el rol arriba para ver cómo cambia la ficha." },
  { id: "inicio", n: 4, label: "Inicio", eyebrow: "Web · Inicio", title: "Lo primero que ve la persona: qué le falta y qué cambió",
    text: "Pendientes propios, cambios recientes y el estado de los barridos. Si un clúster deja de reportar, se ve aquí." },
  { id: "busqueda", n: 5, label: "Búsqueda", eyebrow: "Flujo C1 · Consulta", title: "Busca aunque escribas mal el nombre",
    text: "Sugiere mientras escribes y tolera errores. Prueba “clientespq”, “clientpqrs” o “factura”." },
  { id: "ficha", n: 6, label: "Ficha", eyebrow: "Flujo C1 · Ficha del servicio", title: "Qué es, quién responde, dónde corre y de dónde sale cada dato",
    text: "Una sola consulta trae servicio, despliegues y dependencias. Cada dato dice su fuente y hace cuánto se vio. Lo que tu rol no puede ver no llega de la API." },
  { id: "impacto", n: 7, label: "Impacto", eyebrow: "Flujo C2 · Impacto", title: "Si toco esto, ¿qué se afecta?",
    text: "Se recorren las dependencias hacia atrás, nivel por nivel (consulta recursiva). Se puede partir de un servicio o de su base y esquema." },
  { id: "manuales", n: 8, label: "Datos manuales", eyebrow: "Flujo D · Datos manuales", title: "Lo que ningún sistema sabe, lo completa el responsable",
    text: "Listas cerradas, aprobación del líder técnico para criticidad e impacto, y todo queda en el historial. El colector nunca sobrescribe un dato manual." },
];
const sceneIdx = () => SCENES.findIndex((s) => s.id === st.scene);
function renderNav() {
  const ci = sceneIdx();
  $("#scenes").innerHTML = SCENES.map((s, i) => `<button class="scene-btn ${i < ci ? "done" : ""}" type="button" data-scene="${s.id}" aria-current="${s.id === st.scene}"><span class="n">${s.n}</span>${s.label}</button>`).join("");
  const cur = document.querySelector('.scene-btn[aria-current="true"]'); const sc = $("#scenes");
  if (cur && sc) sc.scrollLeft = cur.offsetLeft - sc.offsetLeft - sc.clientWidth / 2 + cur.clientWidth / 2;
}
function narr() {
  const i = sceneIdx(); const s = SCENES[i];
  return `<section class="narr"><div class="narr-in"><div class="narr-txt"><div class="eyebrow">Paso ${s.n} de ${SCENES.length} · ${s.eyebrow}</div><h2>${s.title}</h2><p>${s.text}</p></div>
  <div class="narr-nav">${i > 0 ? `<button class="btn" data-scene="${SCENES[i - 1].id}" type="button">← ${SCENES[i - 1].label}</button>` : ""}${i < SCENES.length - 1 ? `<button class="btn primary" data-scene="${SCENES[i + 1].id}" type="button">${SCENES[i + 1].label} →</button>` : ""}</div></div></section>`;
}
async function go(id, opts) {
  Object.assign(st, opts || {});
  if (["inicio", "busqueda", "ficha", "impacto", "manuales"].includes(id) && !st.logged) { st.logged = true; log(2, `Sesión simulada de <b>${esc(user().name)}</b> · rol ${esc(ROLES[st.role].label)}`); }
  if (id === "impacto" && !(opts && opts.svc) && st.svc === "clientespqrsrca") st.svc = "postvalidatedocumenttype";
  st.scene = id;
  if (id === "impacto") st.tab = "impacto";
  render(); window.scrollTo(0, 0); $("#stage").scrollTop = 0;
  try {
    if (id === "busqueda") await cargarLista();
    if (id === "ficha" || id === "impacto") { await cargarFicha(st.svc); if (st.tab === "impacto") await cargarImpacto(); else if (st.tab === "historial") await cargarHistorial(st.svc); render(); }
    if (id === "manuales") { await Promise.all([cargarFicha(st.completeFor, true), cargarBase()]); render(); }
    if (id === "inicio" || id === "avisos") { await cargarBase(); render(); }
  } catch (e) { mostrarError(e); }
}
function mostrarError(e) { toast(e.message); log(2, `<b style="color:var(--red)">Error ${e.status || ""}</b> · ${esc(e.message)}`); }

/* ---------- 1 recolección ---------- */
const SWEEP = [
  { p: 1, t: "Arranca el CronJob", d: "Horario <span class='mono'>5 * * * *</span> (cada hora, minuto 5). Configurable a 24 h." },
  { p: 1, t: "Lee lo desplegado (solo lectura)", d: "Deployments, CronJobs, pods, rutas, variables y anotaciones <span class='mono'>sod.proyecto</span>, <span class='mono'>sod.celula</span>. Permisos get/list/watch, sin acceso a secrets." },
  { p: 1, t: "Arma la foto y borra lo sensible", d: "Un registro por despliegue con su huella (hash). De los secretos solo queda el nombre." },
  { p: 1, t: "Se identifica y envía por HTTPS", d: "Token de Entra ID con su propia identidad (rol <span class='mono'>Ingesta.Colector</span>). Ninguna llave sale del clúster." },
  { p: 2, t: "La API valida la foto", d: "¿Colector autorizado? ¿Escribe solo su propio clúster? ¿Formato correcto?" },
  { p: 3, t: "El worker compara con lo guardado", d: "Guarda solo lo que cambió. Lo que desaparece se marca “no encontrado”, no se borra." },
  { p: 4, t: "Se guarda con historial", d: "Despliegue actualizado y entrada en el historial: fuente, hora, valor anterior y nuevo. El historial no se puede modificar." },
  { p: 3, t: "Recalcula pendientes y lee Azure DevOps", d: "Qué campos quedan POR_COMPLETAR y quién responde. Releases, versiones, repositorios y pipelines, una vez por hora." },
];
function sceneRecoleccion() {
  const k = st.sweepStep; const r = st.sweep; const failed = r && r.errores && r.errores.length;
  const cls = (i) => { if (failed && i === 1 && k >= 1) return "err"; if (i < k || (k === SWEEP.length - 1 && i === k && !st.sweepRunning)) return "done"; if (i === k) return "now"; return ""; };
  const active = (p) => (k >= 0 && st.sweepRunning && SWEEP[Math.min(k, SWEEP.length - 1)].p === p ? "active" : "");
  const ej = r && r.ejemploFoto;
  const jsonFoto = ej ? `<pre class="json">{
  <span class="k">"servicio"</span>: <span class="s">"${esc(ej.servicio)}"</span>,
  <span class="k">"namespace"</span>: <span class="s">"${esc(ej.namespace)}"</span>,
  <span class="k">"imagen"</span>: <span class="s">"${esc(ej.imagen)}"</span>,
  <span class="k">"anotaciones"</span>: { <span class="k">"sod.proyecto"</span>: <span class="s">"${esc(ej.anotaciones["sod.proyecto"])}"</span>, <span class="k">"sod.celula"</span>: <span class="s">"${esc(ej.anotaciones["sod.celula"])}"</span> },
  <span class="k">"variables"</span>: { <span class="k">"DB_SERVICE"</span>: <span class="s">"${esc(ej.variables.DB_SERVICE)}"</span>, <span class="k">"DB_USER"</span>: <span class="s">"${esc(ej.variables.DB_USER)}"</span>, <span class="k">"DB_PASSWORD"</span>: <span class="x">"${esc(ej.variables.DB_PASSWORD)}"</span> },
  <span class="k">"secretos"</span>: ${esc(JSON.stringify(ej.secretos))}  <span class="faint">// solo el nombre</span>
}</pre>` : "";
  const estado = k < 0 ? ["En espera", ""] : failed && k >= 1 ? ["Incompleto", "crit"] : k >= SWEEP.length - 1 && !st.sweepRunning ? ["Terminado", "ok"] : ["En curso", "info"];
  return `${narr()}<div class="wrap"><div class="flow">
   <div class="grid">
    <div class="cluster"><h4><span>Clúster no-prod · DEV / QA</span><span class="faint">OpenShift</span></h4>
      <div class="box ${active(1)} ${failed && k >= 1 ? "fail" : ""}"><span class="piece p1">1</span><div><b>Colector</b><small>CronJob · ServiceAccount de solo lectura</small></div></div></div>
    <div class="cluster"><h4><span>Clúster PRD · namespace sib-inventario</span><span class="faint">núcleo</span></h4>
      <div class="box"><span class="piece p1">1</span><div><b>Colector PRD</b><small>Misma imagen, su propia identidad</small></div></div>
      <div class="core">
        <div class="box ${active(2)}"><span class="piece p2">2</span><div><b>API</b><small>NestJS · única puerta a la base</small></div></div>
        <div class="box ${active(3)}"><span class="piece p3">3</span><div><b>Worker</b><small>Compara, Azure DevOps, reportes</small></div></div>
        <div class="box ${active(4)}"><span class="piece p4">4</span><div><b>Base de datos</b><small>PostgreSQL u Oracle · 2 copias</small></div></div>
        <div class="box"><span class="piece p5">5</span><div><b>Web</b><small>React + PatternFly</small></div></div>
      </div></div>
    <div class="card"><div class="card-b" style="display:grid;gap:10px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="runSweep" type="button" ${st.sweepRunning ? "disabled" : ""}>${k < 0 ? "Ejecutar barrido" : "Repetir barrido"}</button>
        <button class="btn" id="stepSweep" type="button" ${st.sweepRunning ? "disabled" : ""}>Paso a paso</button>
      </div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="failChk" ${st.fail ? "checked" : ""}> Simular un fallo de lectura (para ver el aviso del mismo día)</label>
      <p class="faint" style="margin:0;font-size:12.5px">Cada barrido sube un número la versión de clientespqrsrca en QA, para que se vea el cambio.</p>
    </div></div>
   </div>
   <div class="card"><div class="card-h"><h3>Barrido de no-prod</h3><span class="chip ${estado[1]}">${estado[0]}</span></div>
    <div class="card-b"><ol class="steps">${SWEEP.map((s, i) => `<li class="${cls(i)}"><span class="num">${i + 1}</span><div><b>${s.t}</b> <span class="piece p${s.p}" style="vertical-align:1px">${s.p}</span><p>${s.d}</p>
      ${i === 2 && k >= 3 ? jsonFoto : ""}
      ${i === 5 && k >= 5 && r ? (r.cambios.length ? r.cambios.map((c) => `<div class="diffline"><b>${esc(c.servicio)}</b><span>${esc(c.ambiente)} · ${esc(c.campo)}</span><span class="chg"><del>${esc(c.antes)}</del> → <ins>${esc(c.despues)}</ins></span></div>`).join("") : `<div class="diffline">Sin cambios</div>`) : ""}
      ${i === 1 && failed && k >= 1 ? `<div class="diffline" style="background:var(--crit-soft);border-left-color:var(--red)"><b>Error</b><span>${esc(r.errores[0])}</span><span>· el resto del barrido continúa</span></div>` : ""}
      </div></li>`).join("")}</ol>
      ${k >= SWEEP.length - 1 && !st.sweepRunning && r ? `<div class="banner ok" style="margin:12px 0 0">La API registró ${r.despliegues} despliegues y ${r.cambios.length} cambio(s). Busca “clientespq” para verlo en la ficha. <button class="link" data-goto="busqueda" type="button">Ir a la búsqueda</button></div>` : ""}
    </div></div>
  </div></div>`;
}
let sweepTimer = null;
async function sweepStep() {
  const k = ++st.sweepStep; const s = SWEEP[k];
  if (!s) { st.sweepRunning = false; st.sweepStep = SWEEP.length - 1; render(); return false; }
  try {
    if (k === 0) { st.sweep = null; log(1, "CronJob <code>sib-colector</code> arranca en no-prod"); }
    if (k === 1) log(1, st.fail ? `<b style="color:var(--red)">403 al leer rutas en <code>crm-salesforce-qa</code></b> · se registra y se sigue` : "list deployments, cronjobs, routes · 0 errores");
    if (k === 2) log(1, "Foto armada · valores de secretos eliminados dentro del clúster");
    if (k === 3) {
      const { body, ms } = await api("/demo/barrido", { method: "POST", body: JSON.stringify({ fallo: st.fail }) });
      st.sweep = body;
      log(1, `POST <code>/ingesta/fotos</code> · ${body.despliegues} despliegues · ${body.secretosBorrados} secretos sin valor · ${ms} ms`);
    }
    if (k === 4) log(2, "Foto aceptada (202) · clúster no-prod · solo escribe su propio clúster");
    if (k === 5) log(3, `Diferencias: ${st.sweep.cambios.length} cambio(s) · ${st.sweep.nuevos} nuevos · ${st.sweep.noEncontrados} no encontrados`);
    if (k === 6) log(4, `Despliegues actualizados · ${st.sweep.cambios.length} fila(s) nuevas en historial`);
    if (k === 7) { log(3, "POR_COMPLETAR recalculado · Azure DevOps leído"); if (st.sweep.aviso) log(3, esc(st.sweep.aviso)); await cargarBase(); delete st.d.ficha.clientespqrsrca; }
  } catch (e) { mostrarError(e); st.sweepRunning = false; clearInterval(sweepTimer); }
  if (k === SWEEP.length - 1) st.sweepRunning = false;
  render(); return k < SWEEP.length - 1;
}
function runSweep() {
  clearInterval(sweepTimer); st.sweepStep = -1; st.sweepRunning = true;
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; const more = await sweepStep(); busy = false; if (!more) clearInterval(sweepTimer); };
  tick(); sweepTimer = setInterval(tick, 900);
}

/* ---------- 2 avisos ---------- */
function sceneAvisos() {
  const R = st.d.resumen; if (!R) return narr() + `<div class="loading">Cargando…</div>`;
  const falla = st.sweep && st.sweep.errores && st.sweep.errores.length;
  const mis = st.d.mis;
  const cat = st.d.catalogo;
  const sheets = {
    Resumen: [["Servicios", R.total], ["Completitud promedio", R.completitud + " %"], ["Sin criticidad", R.sinCriticidad], ["No encontrados", R.noEncontrados], ["En QA y no en PRD", R.enQaSinPrd]],
    Inventario: cat.slice(0, 6).map((s) => [s.nombre, (s.equipo || "—") + " · " + (s.ambientes.join(", ") || "—")]),
    Cambios: R.cambiosRecientes.length ? R.cambiosRecientes.map((c) => [c.servicio, `${c.campo}: ${c.antes ?? "vacío"} → ${c.despues} · ${c.autor}`]) : [["Sin cambios", "Ejecuta un barrido en el paso 1"]],
    "Por completar": cat.slice(0, 6).map((s) => [s.nombre, s.pendientes.join(", ") || "Completo"]),
  };
  if (!sheets[st.sheet]) st.sheet = "Resumen";
  return `${narr()}<div class="wrap"><div class="grid g2">
   <div class="grid">
    <div class="chan"><div class="chan-top"><span class="ico">T</span><b>SIB Integraciones</b> <span class="muted">› Inventario</span><span class="muted" style="margin-left:auto">Teams · Workflows</span></div>
     <div class="msg"><span class="avatar" style="background:var(--blue);color:#fff">SIB</span><div><div class="msg-meta"><b>Catálogo SIB</b> · lunes, 6:00 a. m.</div>
      <div class="acard"><h4>Inventario semanal</h4>
       <dl class="facts tnum"><dt>Servicios</dt><dd>${R.total}</dd><dt>Cambios recientes</dt><dd>${R.cambiosRecientes.length}</dd><dt>No encontrados</dt><dd>${R.noEncontrados}</dd><dt>Completitud</dt><dd>${R.completitud} %</dd><dt>En QA y no en PRD</dt><dd>${R.enQaSinPrd}</dd></dl>
       <div class="actions"><button class="btn primary sm" data-goto="inicio" type="button">Abrir inventario</button><button class="btn sm" id="dlx" type="button">Descargar Excel</button></div>
      </div></div></div>
     <div class="msg" style="border-top:1px solid var(--line)"><span class="avatar" style="background:var(--crit-soft);color:var(--red)">!</span><div><div class="msg-meta"><b>Catálogo SIB</b> · ${falla ? "hoy, " + hhmm(Date.now()) : "ejemplo de aviso de fallo (sale el mismo día)"}</div>
      <div class="acard err"><h4>${falla ? "Barrido de no-prod incompleto" : "El barrido de PRD falló"}</h4><div style="font-size:13.5px">${falla ? esc(st.sweep.errores[0]) + ". Los demás namespaces se leyeron bien." : "403 al leer rutas en <span class='mono'>crm-salesforce-qa</span>. El colector reintenta en la próxima hora."}</div></div>
      ${falla ? "" : `<p class="faint" style="font-size:12.5px;margin:6px 0 0">En el paso 1 puedes activar “Simular un fallo” para generar este aviso de verdad.</p>`}</div></div>
    </div>
    <div class="card"><div class="card-h"><h3>Excel adjunto · inventario-sib.xlsx</h3><span class="chip ok">4 hojas</span></div>
      <div class="tbl-wrap"><table><tbody>${sheets[st.sheet].map((r) => `<tr><td><b>${esc(r[0])}</b></td><td class="tnum">${esc(r[1])}</td></tr>`).join("")}</tbody></table></div>
      <div class="sheet-tabs" role="tablist">${Object.keys(sheets).map((k) => `<button role="tab" type="button" data-sheet="${k}" aria-selected="${k === st.sheet}">${k}</button>`).join("")}</div></div>
   </div>
   <div class="mail"><div class="mail-h"><span class="muted">De: Catálogo SIB · Para: ${esc(USERS.ana.name)} (usuario de ejemplo) · lunes, 6:00 a. m.</span><span class="subj">Tienes ${mis.reduce((a, m) => a + m.pendientes.length, 0)} datos por completar en tus servicios</span></div>
    <div class="mail-b"><p style="margin:0">Hola, ${esc(USERS.ana.name.split(" ")[0])}. Estos datos no los puede encontrar el barrido y solo tú o tu equipo los conocen:</p>
     ${mis.slice(0, 2).map((m) => `<div class="card"><div class="card-h"><b>${esc(m.clave)}</b><span class="chip warn">${m.pendientes.length} pendientes</span></div><div class="card-b"><ul>${m.pendientes.map((p) => `<li>${esc(p.etiqueta)}${p.sensible ? " <span class='faint'>(lo aprueba el líder técnico)</span>" : ""}</li>`).join("")}</ul></div></div>`).join("") || `<div class="banner ok" style="margin:0">No tienes datos por completar.</div>`}
     <div><button class="btn primary" data-goto="manuales" type="button">Completar ahora</button></div>
     <p class="faint" style="margin:0;font-size:12.5px">Correo enviado por el relay SMTP interno. El resumen general va al canal de Teams; este correo es personal.</p>
    </div></div>
  </div></div>`;
}

/* ---------- 3 ingreso ---------- */
function sceneIngreso() {
  const u = user(); let body;
  if (st.loginStep === 0) body = `<p style="margin:0" class="muted">Encuentra en segundos qué es un servicio, quién responde, dónde corre y qué se afecta si cambia.</p>
     <button class="btn primary" id="loginBtn" type="button" style="padding:12px">Iniciar sesión con la cuenta corporativa</button>
     <p class="faint" style="margin:0;font-size:12.5px">Se usa Entra ID, el mismo inicio de sesión de Microsoft 365.</p>`;
  else if (st.loginStep === 1) body = `<div class="eyebrow">Entra ID · elige una cuenta</div>
     <button class="acct" id="acctBtn" type="button"><span class="avatar">${u.ini}</span><span><b>${esc(u.name)}</b><br><span class="muted">${esc(u.mail)}</span> <span class="faint">(cuenta de ejemplo)</span></span></button>
     <p class="faint" style="margin:0;font-size:12.5px">Pantalla de Entra ID simulada. En producción la muestra Microsoft; la web nunca ve la contraseña.</p>`;
  else {
    const y = st.yo || { roles: [], tecnico: false, restringido: false, aprobar: false };
    body = `<div class="banner ok" style="margin:0">Sesión iniciada. Esto respondió <span class="mono">GET /api/v1/yo</span>:</div>
     <div class="claims"><span><span class="faint">name</span> ${esc(y.usuario || u.name)}</span><span><span class="faint">groups</span> ${esc(ROLES[st.role].group)}</span><span><span class="faint">roles</span> [${esc((y.roles || []).join(", "))}]</span><span><span class="faint">aud</span> api://sib-inventario</span></div>
     <div class="fld" style="gap:3px"><b style="font-size:14px">Con este rol puedes ver</b>
      <span>✓ Información general · ${y.tecnico ? "✓" : "✕"} Información técnica · ${y.restringido ? "✓" : "✕"} Restringida${y.aprobar ? " · ✓ Aprobar criticidad e impacto" : ""}</span></div>
     <button class="btn primary" data-goto="inicio" type="button">Entrar al catálogo</button>`;
  }
  return `${narr()}<div class="login"><div class="login-card">
   <div class="login-top"><span class="brandlogo" style="justify-self:start"><img src="logo.png" alt="Homecenter Sodimac" style="height:44px"></span><div class="logo-txt">Catálogo de servicios SIB<small>Sistemas de Información Base</small></div></div>
   <div class="login-b">${body}</div></div></div>`;
}

/* ---------- app shell ---------- */
function appShell(active, inner) {
  const pend = st.d.mis.length; const appr = st.d.aprob.filter((a) => a.estado === "PENDIENTE").length; const total = st.d.resumen ? st.d.resumen.total : "";
  return `<div class="app">
  <div class="apphead"><div class="apphead-in">
    <button class="logo" data-goto="inicio" type="button" aria-label="Inicio del catálogo"><span class="brandlogo"><img src="logo.png" alt="Homecenter Sodimac"></span><span class="logo-txt">Catálogo<br>de servicios<small>${total} servicios</small></span></button>
    <button class="catbtn" type="button" data-goto="busqueda"><i><span></span><span></span><span></span></i>Proyectos</button>
    <button class="fakesearch" type="button" data-goto="busqueda"><span>¿Qué servicio estás buscando?</span><em><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></em></button>
    <div class="hlinks">
      <button class="hlink" type="button" data-goto="manuales"><span class="cnt-red">${pend}</span><span>Mis<br>pendientes</span></button>
      ${st.role === "lider" ? `<button class="hlink" type="button" data-goto="manuales"><span class="cnt-red">${appr}</span><span>Por<br>aprobar</span></button>` : ""}
      <span class="hlink user"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg><span>${esc(user().name)}<small>${esc(ROLES[st.role].label)}</small></span></span>
    </div></div></div>
  <nav class="appbar" aria-label="Menú del catálogo"><div class="appbar-in">
      <button type="button" data-goto="inicio" aria-current="${active === "inicio"}">Inicio</button>
      <button type="button" data-goto="busqueda" aria-current="${active === "busqueda"}">Buscar servicios</button>
      <button type="button" data-goto="impacto" aria-current="${active === "impacto"}">Análisis de impacto</button>
      <button type="button" data-goto="manuales" aria-current="${active === "manuales"}">Datos por completar</button>
  </div></nav>${inner}</div>`;
}
function searchBox(ctx) {
  return `<div class="searchbar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
   <input id="q" type="search" autocomplete="off" placeholder="Busca un servicio, proyecto o base de datos…" value="${esc(st.q)}" aria-label="Buscar servicio" data-ctx="${ctx}">
   <div class="suggest" id="sugg" hidden></div></div>`;
}

/* ---------- 4 inicio ---------- */
function sceneInicio() {
  const R = st.d.resumen;
  if (!R) return narr() + appShell("inicio", `<div class="loading">Cargando…</div>`);
  const barridos = R.barridos.map((b) => `<div class="li"><span class="t"><span class="dot ${b.ok ? "ok" : "crit"}"></span> Clúster ${b.cluster === "prd" ? "PRD" : "no-prod"}</span><span class="seen">${hace(b.fecha)}</span><span class="s">${esc(b.detalle)}</span></div>`).join("");
  const cats = R.proyectos.slice(0, 8);
  const ab = (n) => { const w = n.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean); return (w.length > 1 ? w.slice(0, 2).map((x) => x[0]).join("") : n.slice(0, 3)).toUpperCase(); };
  const inner = `<div class="promo"><div class="promo-in"><h2>Encuéntralo fácil, <b>complétalo tú.</b></h2><p>${R.sinCriticidad} servicios todavía no tienen criticidad. Si eres responsable, tus pendientes están listos.</p><button class="btn" type="button" data-goto="manuales">Ver mis pendientes</button></div></div>
  <div class="wrap" style="display:grid;gap:22px">
   ${searchBox("inicio")}
   <div class="cats">${cats.map((p, i) => `<button class="cat" type="button" data-cat="${esc(p.nombre)}"><span class="circ" style="background:${CAT_COLORS[i % CAT_COLORS.length]}">${esc(ab(p.nombre))}</span><span>${esc(p.nombre)}<small>${p.servicios} servicios</small></span></button>`).join("")}</div>
   <div class="tiles">
    <div class="tile"><span class="v tnum">${R.total}</span><span class="l">servicios en el catálogo</span></div>
    <div class="tile"><span class="v tnum">${R.completitud}%</span><span class="l">completitud promedio</span><div class="meter"><i style="width:${R.completitud}%"></i></div></div>
    <div class="tile"><span class="v red tnum">${R.sinCriticidad}</span><span class="l">sin criticidad definida</span></div>
    <div class="tile"><span class="v tnum">${R.enQaSinPrd}</span><span class="l">en QA y no en PRD</span></div>
   </div>
   <div><h2 class="section-title">Mis pendientes</h2><p class="muted" style="margin:0 0 12px">Datos que solo tu equipo conoce.</p>
    <div class="pcards">${st.d.mis.map((m) => `<div class="pcard"><span class="chip warn" style="justify-self:start">${m.pendientes.length} por completar</span><span class="nm">${esc(m.clave)}</span><ul>${m.pendientes.map((p) => `<li>${esc(p.etiqueta)}${p.enAprobacion ? " · en aprobación" : ""}</li>`).join("")}</ul><button class="btn primary sm" type="button" data-complete="${esc(m.clave)}">Completar</button></div>`).join("") || `<div class="empty">No tienes pendientes.</div>`}</div></div>
   <div class="grid g2">
     <div class="card"><div class="card-h"><h3>Estado de los barridos</h3><span class="faint" style="font-size:12.5px">cada hora, minuto 5</span></div>
      <div class="list">${barridos}</div>
      <div class="card-b" style="border-top:1px solid var(--line)"><label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" id="staleChk" ${R.prdSinReportar ? "checked" : ""}> Simular que PRD dejó de reportar (la ficha lo advierte)</label></div></div>
     <div class="card"><div class="card-h"><h3>Cambios recientes</h3></div>
      ${R.cambiosRecientes.length ? `<ul class="timeline" style="padding:0 16px">${R.cambiosRecientes.map((c) => `<li><span class="when">${hace(c.fecha)}</span><span class="what"><button class="link" data-open="${esc(c.servicio)}" type="button">${esc(c.servicio)}</button> · ${esc(c.campo)} <span class="chg"><del>${esc(c.antes ?? "vacío")}</del> → <ins>${esc(c.despues)}</ins></span> <span class="faint">· ${esc(c.autor)}</span></span></li>`).join("")}</ul>`
        : `<div class="empty">Todavía no hay cambios. Ejecuta un barrido en el paso 1 o completa un dato.</div>`}</div>
   </div></div>`;
  return narr() + appShell("inicio", inner);
}

/* ---------- 5 búsqueda ---------- */
function sceneBusqueda() {
  const R = st.d.resumen; const L = st.d.lista; const f = st.filters;
  const sel = (id, lbl, opts, cur) => `<select id="${id}" aria-label="${lbl}"><option value="">${lbl}: todos</option>${opts.map((o) => `<option ${o === cur ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const filtros = R ? `<div class="filters">${sel("fTeam", "Equipo", R.equipos, f.equipo)}${sel("fProj", "Proyecto", R.proyectos.map((p) => p.nombre), f.proyecto)}${sel("fTech", "Tecnología", ["Node.js", "Quarkus", "Quarkus + Camel", "Java", "Angular", "Otro"], f.tecnologia)}${sel("fEnv", "Ambiente", ["DEV", "QA", "PRD"], f.ambiente)}${sel("fType", "Tipo", ["API", "Deployment", "CronJob", "Eventos"], f.tipo)}
    ${Object.values(f).some(Boolean) ? `<button class="btn sm ghost" id="fClear" type="button">Quitar filtros</button>` : ""}</div>` : "";
  let lista = `<div class="loading">Buscando…</div>`;
  if (L) {
    lista = `<div class="card-h"><h3 class="tnum">${L.total} ${L.total === 1 ? "servicio" : "servicios"}${st.q ? ` para “${esc(st.q)}”` : ""}</h3><span class="faint" style="font-size:12px">${L.ms} ms en el servidor</span></div>
    ${L.resultados.map((s) => `<button class="result" type="button" data-open="${esc(s.clave)}"><span class="nm">${st.q ? hl(s.nombre, st.q) : esc(s.nombre)}</span><span class="ds">${esc(s.descripcion || "Sin descripción")}</span>
      <span class="meta"><span class="chip">${esc(s.equipo || "Equipo sin dato")}</span>${s.proyecto ? `<span class="chip brand">${esc(s.proyecto)}</span>` : ""}<span class="chip">${esc(s.tecnologia)}</span><span class="chip">${esc(s.tipo)}</span></span>
      <span class="side"><span style="display:flex;gap:4px">${["DEV", "QA", "PRD"].map((e) => `<span class="env ${s.ambientes.includes(e) ? "on" : ""}">${e}</span>`).join("")}</span><span class="chip ${s.completitud >= 80 ? "ok" : s.completitud >= 50 ? "warn" : "crit"} tnum">${s.completitud} % completo</span>${s.pendientes.length ? `<span class="pending">${s.pendientes.length} POR_COMPLETAR</span>` : ""}</span></button>`).join("")}
    ${L.total > L.resultados.length ? `<div class="empty">Se muestran ${L.resultados.length} de ${L.total}. Afina la búsqueda o usa los filtros.</div>` : ""}
    ${!L.total ? `<div class="empty"><b>No encontramos “${esc(st.q)}”.</b><br>Revisa el nombre o quita filtros.</div>` : ""}`;
  }
  return narr() + appShell("busqueda", `<div class="wrap" style="display:grid;gap:14px">${searchBox("busqueda")}${filtros}<div class="card">${lista}</div></div>`);
}

/* ---------- 6 ficha ---------- */
const L_ = (txt) => `<span class="lock">🔒 ${txt}</span>`;
const ESTADO = { CORRIENDO: ["Corriendo", "ok"], ESCALADO_A_CERO: ["Escalado a 0", "warn"], NO_ENCONTRADO: ["No encontrado", "crit"], NO_DESPLEGADO: ["No desplegado", ""] };
const FUENTE_CLS = { MANUAL: "manual", ANOTACION: "anot", REPOSITORIO: "ado", DEDUCIDO: "ded", EXCEL: "excel", COLECTOR: "anot" };
function campo(F, k) {
  const pend = F.pendientes.find((p) => p.campo === k);
  if (pend && pend.enAprobacion) return `<span class="chip info">En aprobación del líder técnico</span>`;
  if (pend) return `<span class="pending">POR_COMPLETAR</span> <button class="link" data-complete="${esc(F.clave)}" type="button" style="font-size:13px">Completar</button>`;
  const v = F[k];
  const man = F.manual[k] ? ` <span class="src manual">manual</span>` : "";
  if (k === "documentacion") return `<a href="${esc(v)}" target="_blank" rel="noopener" style="color:var(--blue);font-weight:700">Abrir documentación</a>${man}`;
  return esc(v) + man;
}
function sceneFicha() {
  const F = st.d.ficha[st.svc];
  const active = st.scene === "impacto" ? "impacto" : "busqueda";
  if (!F) return narr() + appShell(active, `<div class="loading">Cargando la ficha de ${esc(st.svc)}…</div>`);
  const tec = !!F.bases; const res = !!F.configuracion;
  const tabs = [["resumen", "Resumen"], ["ambientes", "Ambientes", 3], ["dependencias", "Dependencias", F.conteos.llama + F.conteos.usadoPor + F.conteos.bases], ["impacto", "Impacto", F.conteos.usadoPor], ["historial", "Historial"], ["fuentes", "Fuentes"]];
  let body = "";
  if (st.tab === "resumen") {
    body = `<div class="fcols"><div class="card"><div class="card-h"><h3>Qué es</h3><span class="faint" style="font-size:12.5px">información general · todo TI</span></div><div class="card-b"><div class="kv">
      <div>Descripción</div><div>${campo(F, "descripcion")}</div><div>Proyecto</div><div>${campo(F, "proyecto")}</div><div>Negocio</div><div>${campo(F, "negocio")}</div>
      <div>Equipo</div><div>${esc(F.equipo || "—")}</div><div>Responsable</div><div>${campo(F, "responsable")}</div>
      <div>Tecnología</div><div>${esc(F.tecnologia || "—")}${F.runtime ? ` <span class="faint">· ${esc(F.runtime)}</span>` : ""}</div><div>Tipo</div><div>${esc(F.tipo || "—")}</div>
      <div>Criticidad</div><div>${campo(F, "criticidad")}</div><div>Impacto si falla</div><div>${campo(F, "impacto")}</div><div>Documentación</div><div>${campo(F, "documentacion")}</div>
     </div></div></div>
     <div class="grid">
      <div class="card"><div class="card-h"><h3>Dónde corre</h3><button class="btn sm ghost" data-tab="ambientes" type="button">Detalle</button></div><div class="list">${F.despliegues.map((e) => `<div class="li"><span class="t"><span class="env ${e.desplegado ? "on" : ""}">${e.ambiente}</span> ${ESTADO[e.estado][0]}</span><span class="seen" ${e.datoViejo ? 'style="color:var(--red)"' : ""}>${e.vistoEn ? hace(e.vistoEn) : ""}</span>${e.desplegado ? `<span class="s">versión ${esc(e.version || "—")}</span>` : ""}</div>`).join("")}</div></div>
      <div class="card"><div class="card-h"><h3>Código y despliegue</h3><span class="src ado">Azure DevOps</span></div><div class="card-b"><div class="kv">
       <div>Repositorio</div><div>${F.repositorio ? `<a href="${esc(F.repositorio)}" target="_blank" rel="noopener" style="color:var(--blue);font-weight:700;font-size:13px">${esc(F.repositorio.split("/_git/")[1] || "repositorio")}</a>` : `<span class="pending">POR_COMPLETAR</span>`}</div>
       <div>Rama</div><div>${esc(F.rama || "—")}</div>
       <div>Pipelines</div><div>${F.pipelines ? `${esc(F.pipelines.ci || "—")} · ${esc(F.pipelines.cd || "—")}` : L_("Técnico")}</div>
       <div>Último despliegue</div><div>${fecha(F.ultimoDespliegue)}</div></div></div></div>
      ${F.pendientes.length ? `<div class="card"><div class="card-h"><h3>Falta completar</h3><span class="chip warn">${F.pendientes.length}</span></div><div class="card-b" style="display:grid;gap:10px"><div style="display:flex;gap:6px;flex-wrap:wrap">${F.pendientes.map((p) => `<span class="chip">${esc(p.etiqueta)}${p.enAprobacion ? " · en aprobación" : ""}</span>`).join("")}</div><button class="btn primary" data-complete="${esc(F.clave)}" type="button">Completar datos</button></div></div>` : ""}
     </div></div>`;
  } else if (st.tab === "ambientes") {
    body = `<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Ambiente</th><th>Clúster</th><th>Namespace</th><th>Versión</th><th>Estado</th><th>Ruta</th><th>Visto</th></tr></thead><tbody>
     ${F.despliegues.map((e) => `<tr><td><span class="env ${e.desplegado ? "on" : ""}">${e.ambiente}</span></td><td>${e.cluster}</td><td>${!e.desplegado ? "—" : e.namespace !== undefined ? esc(e.namespace || "—") : L_("Técnico")}</td><td>${e.desplegado ? esc(e.version || "—") : "—"}</td><td><span class="chip ${ESTADO[e.estado][1]}">${ESTADO[e.estado][0]}</span></td>
     <td>${!e.desplegado ? "—" : e.ruta !== undefined ? `<span class="mono" style="font-size:12px">${esc(e.ruta)}</span>` : L_("Técnico")}</td><td class="seen" ${e.datoViejo ? 'style="color:var(--red)"' : ""}>${e.vistoEn ? hace(e.vistoEn) : "—"}</td></tr>`).join("")}
     </tbody></table></div></div>
     <div class="card" style="margin-top:16px"><div class="card-h"><h3>Configuración interpretada</h3><span class="faint" style="font-size:12.5px">variables · información restringida</span></div><div class="card-b">
     ${res ? `<div class="kv mono" style="font-size:13px">${Object.entries(F.configuracion).map(([k, v]) => `<div>${k}</div><div>${esc(v || "—")}</div>`).join("")}</div>` : L_("Solo Arquitectura, Seguridad y DBA ven hosts, IP, puertos y variables")}</div></div>`;
  } else if (st.tab === "dependencias") {
    if (!tec) body = `<div class="card card-b">${L_("Las dependencias son información técnica: grupos SIB y Plataforma")}</div>`;
    else body = `<div class="card card-b"><div class="depgrid">
     <div class="depcol"><div class="eyebrow">La usan · ${F.usadoPor.length}</div>${F.usadoPor.map((n) => `<button class="depnode" data-open="${esc(n)}" type="button"><span class="k">svc</span><span>${esc(n)}</span></button>`).join("") || `<span class="faint">Ningún servicio conocido la llama</span>`}</div>
     <span class="arrow" aria-hidden="true">→</span><div class="center-node">${esc(F.clave)}</div><span class="arrow" aria-hidden="true">→</span>
     <div class="depcol"><div class="eyebrow">Usa · ${F.llama.length + F.bases.length}</div>
      ${F.bases.map((b) => `<button class="depnode" data-impactdb="1" type="button"><span class="k">base</span><span>${esc(b.nombre)}${b.esquema ? " / " + esc(b.esquema) : ""}</span></button>`).join("")}
      ${F.llama.map((n) => `<button class="depnode" data-open="${esc(n)}" type="button"><span class="k">svc</span><span>${esc(n)}</span></button>`).join("")}
      ${!F.llama.length && !F.bases.length ? `<span class="faint">Sin dependencias detectadas</span>` : ""}</div>
    </div><p class="faint" style="font-size:12.5px;margin:12px 0 0">Salen de las variables y rutas que lee el colector (procedencia: deducido). Haz clic en un nodo para abrir su ficha.</p></div>`;
  } else if (st.tab === "impacto") {
    body = impactView(F);
  } else if (st.tab === "historial") {
    const H = st.d.hist[F.clave];
    body = `<div class="card"><div class="card-h"><h3>Historial</h3><span class="faint" style="font-size:12.5px">solo se agregan filas; nadie puede modificarlo</span></div>${!H ? `<div class="loading">Cargando…</div>` : `<ul class="timeline" style="padding:0 16px">${H.map((h) => `<li><span class="when">${hace(h.fecha)}</span><span class="what"><span class="src ${FUENTE_CLS[h.fuente]}">${esc(h.autor)}</span> ${esc(h.campo)} <span class="chg"><del>${esc(h.antes ?? "vacío")}</del> → <ins>${esc(h.despues)}</ins></span>${h.nota ? ` <span class="faint">· ${esc(h.nota)}</span>` : ""}</span></li>`).join("")}</ul>`}</div>`;
  } else if (st.tab === "fuentes") {
    const nombres = { nombre: "Nombre", descripcion: "Descripción", equipo: "Equipo", proyecto: "Proyecto", responsable: "Responsable", tecnologia: "Tecnología", repositorio: "Repositorio", releaseCD: "Release", bases: "Bases de datos", negocio: "Negocio", documentacion: "Documentación", criticidad: "Criticidad", impacto: "Impacto" };
    body = `<div class="card"><div class="tbl-wrap"><table><thead><tr><th>Dato</th><th>De dónde salió</th><th>Detalle</th><th>Visto por última vez</th></tr></thead><tbody>
     ${Object.entries(nombres).map(([k, l]) => { const p = F.procedencia[k]; const bloqueado = k === "bases" && !tec; return `<tr><td><b>${l}</b></td><td>${bloqueado ? L_("Técnico") : p ? `<span class="src ${FUENTE_CLS[p.fuente]}">${p.fuente}</span>` : `<span class="pending">POR_COMPLETAR</span>`}</td><td>${p && !bloqueado ? esc(p.detalle) : "—"}</td><td class="seen">${p && p.vistoEn && !bloqueado ? hace(p.vistoEn) : "—"}</td></tr>`; }).join("")}
     </tbody></table></div></div>
     <p class="faint" style="font-size:12.5px">Prioridad de fuentes: manual › anotación › repositorio › deducido › Excel. El colector nunca sobrescribe un dato manual.</p>`;
  }
  const inner = `<div class="wrap">
   <div class="crumbs"><button class="link" data-goto="busqueda" type="button">Buscar</button><span>›</span><span>${esc(F.equipo || "Sin equipo")}</span><span>›</span><span>${esc(F.proyecto || "Sin proyecto")}</span></div>
   <div class="fhead"><div><h1>${esc(F.nombre)}</h1><div class="fmeta"><span class="chip">${esc(F.id)}</span><span class="chip ${F.estado === "Activo" ? "ok" : ""}">${esc(F.estado || "Estado sin dato")}</span><span class="chip">${esc(F.tecnologiaCorta)}</span><span class="chip">${esc(F.tipoCorto)}</span>${F.despliegues.map((e) => `<span class="env ${e.desplegado ? "on" : ""}">${e.ambiente}</span>`).join("")}</div></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="chip ${F.completitud >= 80 ? "ok" : F.completitud >= 50 ? "warn" : "crit"} tnum">${F.completitud} % completo</span>${F.pendientes.length ? `<button class="btn primary" data-complete="${esc(F.clave)}" type="button">Completar</button>` : ""}</div></div>
   ${F.datoViejo ? `<div class="banner warn"><b>Dato posiblemente viejo.</b>&nbsp;${esc(F.datoViejo)}</div>` : ""}
   ${F.restringidos.length ? `<div class="banner info"><span>Hay datos restringidos para tu rol (<b>${esc(ROLES[st.role].label)}</b>): la API no envió ${esc(F.restringidos.join(", "))}.</span></div>` : ""}
   <div class="tabs" role="tablist">${tabs.map(([k, l, c]) => `<button role="tab" type="button" data-tab="${k}" aria-selected="${st.tab === k}">${l}${c !== undefined ? `<span class="cnt tnum">${c}</span>` : ""}</button>`).join("")}</div>
   ${body}</div>`;
  return narr() + appShell(active, inner);
}
function impactView(F) {
  const I = st.d.impacto;
  if (!F.bases) return `<div class="card card-b">${L_("El análisis de impacto usa dependencias técnicas: grupos SIB y Plataforma")}</div>`;
  if (!I) return `<div class="card"><div class="loading">Calculando impacto…</div></div>`;
  if (I.error) return `<div class="card card-b">${L_(esc(I.error))}</div>`;
  const db = I.baseDisponible;
  return `<div class="card"><div class="card-h"><h3>Si cambia ${esc(I.origen)}</h3>
    <div class="seg" role="radiogroup" aria-label="Punto de partida"><input type="radio" name="im" id="imSvc" value="servicio" ${I.desde === "servicio" ? "checked" : ""}><label for="imSvc">El servicio</label>${db ? `<input type="radio" name="im" id="imDb" value="base" ${I.desde === "base" ? "checked" : ""}><label for="imDb">Su base ${esc(db)}</label>` : ""}</div></div>
   <div class="card-b" style="display:grid;gap:14px">
    <div class="tiles"><div class="tile"><span class="v tnum">${I.total}</span><span class="l">servicios afectados</span></div><div class="tile"><span class="v tnum">${I.niveles.length}</span><span class="l">niveles</span></div><div class="tile"><span class="v red tnum">${I.enPRD}</span><span class="l">corren en PRD</span></div></div>
    ${I.total ? `<div class="levels"><div class="level"><h4><span>Origen</span></h4><div class="center-node">${esc(I.origen)}</div></div>
     ${I.niveles.map((l, i) => `<div class="level"><h4><span>Nivel ${i + 1}${i === 0 ? " · directos" : ""}</span><span>${l.length}</span></h4>${l.map((x) => `<button class="depnode" data-open="${esc(x.clave)}" type="button" style="flex-direction:column;align-items:flex-start;gap:2px"><span style="font-weight:900">${esc(x.clave)}</span><span class="faint" style="font-size:12px">vía ${esc(x.via)} · ${x.ambientes.join("/") || "—"} · ${x.criticidad ? "criticidad " + esc(x.criticidad) : "criticidad POR_COMPLETAR"}</span></button>`).join("")}</div>`).join("")}</div>`
      : `<div class="empty">Ningún servicio conocido depende de ${esc(I.origen)}.${db && I.desde === "servicio" ? ` Prueba con su base <button class="link" id="imToDb" type="button">${esc(db)}</button>.` : ""}</div>`}
    <p class="faint" style="font-size:12.5px;margin:0">GET /api/v1/servicios/${esc(F.clave)}/impacto${I.desde === "base" ? "?desde=base" : ""} · ${I.ms} ms en el servidor · en producción es un WITH RECURSIVE</p>
   </div></div>`;
}

/* ---------- 8 datos manuales ---------- */
function sceneManuales() {
  const F = st.d.ficha[st.completeFor]; const R = st.d.resumen;
  if (!F || !R) return narr() + appShell("manuales", `<div class="loading">Cargando…</div>`);
  const puedeEditar = st.role === "tecnico" || st.role === "lider";
  const lider = st.role === "lider";
  const campos = F.pendientes.filter((p) => !p.enAprobacion);
  const opciones = (arr) => `<option value="">Elige una opción</option>${arr.map((o) => `<option>${esc(o)}</option>`).join("")}`;
  const sens = (p) => (p.sensible && !lider ? `<span class="chip info">lo aprueba el líder técnico</span>` : "");
  const field = (p) => {
    if (p.campo === "criticidad") return `<div class="fld"><label>Criticidad ${sens(p)}</label><div class="seg" role="radiogroup" aria-label="Criticidad">${R.listas.criticidad.map((o, i) => `<input type="radio" name="criticidad" id="crit${i}" value="${o}"><label for="crit${i}">${o}</label>`).join("")}</div><span class="hint">Lista cerrada. Alta: si falla, se detiene una operación de cara al cliente.</span></div>`;
    if (p.campo === "impacto") return `<div class="fld"><label for="f_impacto">Impacto si falla ${sens(p)}</label><select class="field" id="f_impacto">${opciones(R.listas.impacto)}</select></div>`;
    if (p.campo === "negocio") return `<div class="fld"><label for="f_negocio">Negocio</label><select class="field" id="f_negocio">${opciones(R.negocios)}</select></div>`;
    if (p.campo === "proyecto") return `<div class="fld"><label for="f_proyecto">Proyecto</label><select class="field" id="f_proyecto">${opciones(R.proyectos.map((x) => x.nombre))}</select><span class="hint">Si la anotación sod.proyecto existe, se toma de ahí.</span></div>`;
    if (p.campo === "documentacion") return `<div class="fld"><label for="f_documentacion">Enlace a la documentación</label><input class="field" id="f_documentacion" type="url" placeholder="https://…sharepoint.com/…"></div>`;
    if (p.campo === "responsable") return `<div class="fld"><label for="f_responsable">Responsable técnico</label><input class="field" id="f_responsable" placeholder="Nombre o grupo"><span class="hint">Si está en la anotación sod.contacto-solucion, se toma de ahí.</span></div>`;
    return `<div class="fld"><label for="f_${p.campo}">${esc(p.etiqueta)}</label><textarea class="field" id="f_${p.campo}"></textarea></div>`;
  };
  const A = st.d.aprob;
  const aprob = `<div class="card"><div class="card-h"><h3>Aprobaciones</h3><span class="chip ${A.some((a) => a.estado === "PENDIENTE") ? "info" : ""}">${A.filter((a) => a.estado === "PENDIENTE").length} pendientes</span></div>
   ${A.length ? `<div class="list">${A.map((a) => `<div class="li"><span class="t">${esc(a.servicio)} · ${esc(a.etiqueta)}: <b>${esc(a.valor)}</b></span>
    <span>${a.estado === "PENDIENTE" ? (lider ? `<button class="btn sm primary" data-approve="${a.id}" type="button">Aprobar</button> <button class="btn sm" data-reject="${a.id}" type="button">Rechazar</button>` : `<span class="chip info">Esperando al líder técnico</span>`) : `<span class="chip ${a.estado === "APROBADO" ? "ok" : "crit"}">${a.estado === "APROBADO" ? "Aprobado" : "Rechazado"}</span>`}</span>
    <span class="s">Propuesto por ${esc(a.propuestoPor)} · ${hace(a.fecha)}${a.decididoPor ? ` · decidió ${esc(a.decididoPor)}` : ""}</span></div>`).join("")}</div>`
    : `<div class="empty">Cuando alguien proponga una criticidad o un impacto, aparece aquí para el líder técnico.</div>`}
   ${A.some((a) => a.estado === "PENDIENTE") && !lider ? `<div class="card-b" style="border-top:1px solid var(--line)"><button class="btn" id="asLeader" type="button">Ver como líder técnico para aprobar</button></div>` : ""}</div>`;
  const inner = `<div class="wrap" style="display:grid;gap:16px">
   <div class="grid g2" style="align-items:start">
    <div class="card"><div class="card-h"><h3>Completar ${esc(F.clave)}</h3><button class="btn sm ghost" data-open="${esc(F.clave)}" type="button">Abrir ficha</button></div>
     <div class="card-b">
     ${!puedeEditar ? `<div class="banner info" style="margin:0">Tu rol (${esc(ROLES[st.role].label)}) puede ver, pero no editar. Editan el responsable del servicio y los curadores.</div>`
     : campos.length ? `<form class="form" id="manualForm" novalidate>${campos.map(field).join("")}
       <div class="banner info" style="margin:0;font-size:13px">Lo que guardes queda marcado como <b>MANUAL</b> con tu nombre y la fecha, y entra al historial. El colector nunca lo sobrescribe.</div>
       <div style="display:flex;gap:8px"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-open="${esc(F.clave)}">Cancelar</button></div></form>`
     : `<div class="banner ok" style="margin:0">No quedan datos por completar en este servicio${F.pendientes.some((p) => p.enAprobacion) ? "; hay valores esperando aprobación" : ""}.</div>`}
     </div></div>
    <div class="grid">${aprob}
     <div class="card"><div class="card-h"><h3>Mis pendientes</h3></div><div class="list">${st.d.mis.map((m) => `<button class="li" type="button" data-complete="${esc(m.clave)}" ${m.clave === F.clave ? 'style="background:var(--blue-soft)"' : ""}><span class="t">${esc(m.clave)}</span><span class="chip warn">${m.pendientes.length}</span><span class="s">${m.pendientes.map((p) => esc(p.etiqueta)).join(" · ")}</span></button>`).join("") || `<div class="empty">Sin pendientes.</div>`}</div></div>
    </div></div></div>`;
  return narr() + appShell("manuales", inner);
}
async function submitManual(e) {
  e.preventDefault();
  const F = st.d.ficha[st.completeFor]; const cambios = {};
  F.pendientes.filter((p) => !p.enAprobacion).forEach((p) => {
    let v = "";
    if (p.campo === "criticidad") { const c = document.querySelector('input[name="criticidad"]:checked'); v = c ? c.value : ""; }
    else { const el = document.getElementById("f_" + p.campo); v = el ? el.value.trim() : ""; }
    if (v) cambios[p.campo] = v;
  });
  if (!Object.keys(cambios).length) { toast("Llena al menos un campo para guardar"); return; }
  try {
    const { body, ms } = await api(`/servicios/${encodeURIComponent(F.clave)}`, { method: "PATCH", body: JSON.stringify(cambios) });
    st.d.ficha[F.clave] = body.servicio; delete st.d.hist[F.clave];
    log(2, `PATCH <code>/servicios/${esc(F.clave)}</code> · validado contra las listas · ${ms} ms`);
    if (body.guardados.length) log(4, `Guardado como MANUAL: ${esc(body.guardados.join(", "))} · fila en historial`);
    if (body.enAprobacion.length) log(3, `En aprobación del líder técnico: ${esc(body.enAprobacion.join(", "))}`);
    toast(body.enAprobacion.length && body.guardados.length ? `Guardado. ${body.enAprobacion.length} campo(s) esperan aprobación` : body.enAprobacion.length ? "Enviado al líder técnico para aprobar" : "Guardado");
    await cargarBase(); render();
  } catch (err) { mostrarError(err); }
}
async function decidir(id, ok) {
  try {
    const { body, ms } = await api(`/aprobaciones/${id}/${ok ? "aprobar" : "rechazar"}`, { method: "POST" });
    log(2, `POST <code>/aprobaciones/${id}/${ok ? "aprobar" : "rechazar"}</code> · ${ms} ms`);
    if (ok) log(4, `${esc(body.etiqueta)} de ${esc(body.servicio)} = ${esc(body.valor)} · fila en historial`);
    toast(ok ? "Aprobado y publicado en la ficha" : "Rechazado");
    delete st.d.hist[body.servicio];
    await Promise.all([cargarBase(), cargarFicha(st.completeFor, true)]); render();
  } catch (e) { mostrarError(e); }
}

/* ---------------- render y eventos ---------------- */
function render() {
  renderNav();
  const map = { recoleccion: sceneRecoleccion, avisos: sceneAvisos, ingreso: sceneIngreso, inicio: sceneInicio, busqueda: sceneBusqueda, ficha: sceneFicha, impacto: sceneFicha, manuales: sceneManuales };
  const focusQ = document.activeElement && document.activeElement.id === "q";
  $("#stage").innerHTML = map[st.scene]();
  bindScene(focusQ);
}
function bindScene(focusQ) {
  const q = $("#q");
  if (q) {
    let hi = -1; let deb; let seq = 0;
    const show = async () => {
      const v = q.value.trim(); const sg = $("#sugg");
      if (!v) { sg.hidden = true; return; }
      const my = ++seq;
      try {
        const { body, ms } = await api(`/servicios/sugerencias?q=${encodeURIComponent(v)}`);
        if (my !== seq) return;
        hi = -1;
        sg.innerHTML = (body.resultados.length ? body.resultados.map((s) => `<button type="button" data-open="${esc(s.clave)}"><span class="nm">${hl(s.clave, v)}</span><span class="chip">${esc(s.proyecto || s.equipo || "")}</span><span class="ds">${esc(s.descripcion || "")}</span></button>`).join("") : `<div class="empty" style="padding:14px">Sin coincidencias. Prueba con otra parte del nombre.</div>`) +
          `<div class="foot">${body.resultados.length} sugerencias · ${ms} ms (servidor ${body.ms} ms) · tolera errores de escritura</div>`;
        sg.hidden = false;
        clearTimeout(deb); deb = setTimeout(() => log(2, `GET <code>/servicios/sugerencias?q=${esc(v)}</code> · ${body.resultados.length} sugerencias · ${ms} ms`), 600);
      } catch (e) { /* se ignora mientras escribe */ }
    };
    q.addEventListener("input", show);
    q.addEventListener("keydown", (e) => {
      const btns = [...document.querySelectorAll("#sugg button")];
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!btns.length) return; hi = (hi + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length; btns.forEach((b, i) => b.classList.toggle("hl", i === hi)); }
      else if (e.key === "Enter") { e.preventDefault(); if (hi >= 0 && btns[hi]) openSvc(btns[hi].dataset.open); else { st.q = q.value.trim(); go("busqueda"); } }
      else if (e.key === "Escape") $("#sugg").hidden = true;
    });
    q.addEventListener("blur", () => setTimeout(() => { const s = $("#sugg"); if (s) s.hidden = true; }, 200));
    if (focusQ || st._focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); st._focusQ = false; }
  }
  const fmap = { fTeam: "equipo", fProj: "proyecto", fTech: "tecnologia", fEnv: "ambiente", fType: "tipo" };
  Object.keys(fmap).forEach((id) => { const el = document.getElementById(id); if (el) el.addEventListener("change", () => { st.filters[fmap[id]] = el.value; cargarLista().catch(mostrarError); }); });
  const fc = $("#fClear"); if (fc) fc.onclick = () => { st.filters = { equipo: "", proyecto: "", tecnologia: "", ambiente: "", tipo: "" }; cargarLista().catch(mostrarError); };
  const rs = $("#runSweep"); if (rs) rs.onclick = runSweep;
  const ss = $("#stepSweep"); if (ss) ss.onclick = async () => { clearInterval(sweepTimer); if (st.sweepStep >= SWEEP.length - 1) st.sweepStep = -1; st.sweepRunning = false; await sweepStep(); };
  const fk = $("#failChk"); if (fk) fk.onchange = () => { st.fail = fk.checked; };
  const sk = $("#staleChk"); if (sk) sk.onchange = async () => {
    try { await api("/demo/prd-sin-reportar", { method: "POST", body: JSON.stringify({ valor: sk.checked }) }); if (sk.checked) log(3, "Alerta: clúster PRD sin barrido exitoso en 3 h → Teams"); st.d.ficha = {}; await cargarBase(); render(); } catch (e) { mostrarError(e); }
  };
  const lb = $("#loginBtn"); if (lb) lb.onclick = () => { st.loginStep = 1; log(5, "Redirige a Entra ID con OIDC + PKCE"); render(); };
  const ab = $("#acctBtn"); if (ab) ab.onclick = async () => {
    try { const { body, ms } = await api("/yo"); st.yo = body; st.loginStep = 2; st.logged = true; log(2, `GET <code>/yo</code> · roles [${esc(body.roles.join(", "))}] · ${ms} ms`); render(); } catch (e) { mostrarError(e); }
  };
  const mf = $("#manualForm"); if (mf) mf.addEventListener("submit", submitManual);
  const al = $("#asLeader"); if (al) al.onclick = () => setRole("lider");
  const dl = $("#dlx"); if (dl) dl.onclick = () => toast("En la demo no se genera el Excel; en producción lo arma el worker cada lunes");
  document.querySelectorAll('input[name="im"]').forEach((x) => (x.onchange = () => { st.impactMode = x.value; cargarImpacto(); }));
  const itd = $("#imToDb"); if (itd) itd.onclick = () => { st.impactMode = "base"; cargarImpacto(); };
}
async function openSvc(n) {
  st.svc = n; st.tab = st.scene === "impacto" ? "impacto" : "resumen";
  await go(st.scene === "impacto" ? "impacto" : "ficha");
}
async function setRole(r) {
  st.role = r; $("#role").value = r; st.d.ficha = {}; st.d.impacto = null; st.yo = null;
  log(2, `Ahora se ve como <b>${esc(ROLES[r].label)}</b> · la API filtra de nuevo cada respuesta`);
  if (st.scene === "ingreso" && st.loginStep === 2) { try { st.yo = (await api("/yo")).body; } catch (e) { mostrarError(e); } }
  await go(st.scene);
}
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-cat],[data-scene],[data-goto],[data-open],[data-tab],[data-complete],[data-sheet],[data-approve],[data-reject],[data-impactdb]");
  if (!t) return;
  const ds = t.dataset;
  if (ds.cat) { st.filters = { equipo: "", proyecto: ds.cat, tecnologia: "", ambiente: "", tipo: "" }; st.q = ""; go("busqueda"); }
  else if (ds.scene) go(ds.scene);
  else if (ds.goto) { if (ds.goto === "busqueda") st._focusQ = true; go(ds.goto); }
  else if (ds.open) openSvc(ds.open);
  else if (ds.tab) {
    st.tab = ds.tab; render();
    if (ds.tab === "impacto") cargarImpacto();
    if (ds.tab === "historial") cargarHistorial(st.svc).catch(mostrarError);
  }
  else if (ds.complete) { st.completeFor = ds.complete; go("manuales"); }
  else if (ds.sheet) { st.sheet = ds.sheet; render(); }
  else if (ds.approve) decidir(+ds.approve, true);
  else if (ds.reject) decidir(+ds.reject, false);
  else if (ds.impactdb) { st.impactMode = "base"; st.tab = "impacto"; go("impacto", { svc: st.svc }); }
});
$("#role").addEventListener("change", (e) => setRole(e.target.value));
$("#bsToggle").addEventListener("click", () => { const b = $("#backstage"); b.hidden = !b.hidden; $("#bsToggle").setAttribute("aria-pressed", String(!b.hidden)); $("#stage").classList.toggle("nobs", b.hidden); });
$("#bsClear").addEventListener("click", () => { $("#bsLog").innerHTML = ""; });
const rb = $("#resetDemo");
if (rb) rb.addEventListener("click", async () => {
  try { await api("/demo/reiniciar", { method: "POST" }); Object.assign(st, { sweepStep: -1, sweep: null, fail: false, loginStep: 0, logged: false, q: "" }); st.d.ficha = {}; st.d.hist = {}; st.d.impacto = null; await cargarBase(); $("#bsLog").innerHTML = ""; log(2, "Demo reiniciada: datos del Excel cargados de nuevo"); go("recoleccion"); toast("Demo reiniciada"); } catch (e) { mostrarError(e); }
});
const clock = () => { $("#clock").textContent = new Date().toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }); };
clock(); setInterval(clock, 30000);
if (window.matchMedia("(max-width:1000px)").matches) { $("#backstage").hidden = true; $("#bsToggle").setAttribute("aria-pressed", "false"); $("#stage").classList.add("nobs"); }

(async function boot() {
  $("#stage").innerHTML = `<div class="loading">Conectando con la API…</div>`;
  try {
    await cargarBase();
    log(2, `API conectada · ${st.d.resumen.total} servicios cargados del Excel`);
    const h = (location.hash || "").slice(1);
    await go(SCENES.some((s) => s.id === h) ? h : "recoleccion");
  } catch (e) {
    $("#stage").innerHTML = `<div class="errbox">No pude conectar con la API (${esc(e.message)}). Arráncala con <span class="mono">npm start</span> dentro de la carpeta api y abre http://localhost:3000.</div>`;
  }
})();
})();
