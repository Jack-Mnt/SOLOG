export const adminNow = '2026-09-03T22:30:00Z'
const envelope = (revisions = { operational: 10 }) => ({ contract_version: 2, generated_at: adminNow, revisions })
export function bootstrapFixture(role = 'admin') { return { ...envelope({ groups: 3, catalog: 5 }), identity: { id: 'admin-test', nombre: 'Admin de prueba', rol: role }, permissions: { can_admin: role === 'admin', can_moderate: true }, allowed_sites: ['a','b'].map(id => ({ id: 'site-' + id, nombre: 'Sede ' + id.toUpperCase(), operational_revision: 10, devices_revision: 2, incidents_revision: 4 })) } }
export function cardsFixture() { return { ...envelope({ groups: 3 }), sites: ['a','b'].map((id, i) => ({ site_id: 'site-' + id, site: 'Sede ' + id.toUpperCase(), operational_revision: 10, period_coverage: { counted: i ? 10 : 3, total: 10, percent: i ? 100 : 30, complete: !!i }, daily_coverage: { counted_today: 2, total: 10, percent: 20 }, pending_recount: 1, snapshot: i ? null : { id: 'snapshot-a', capturado_at: adminNow, confirmado_at: adminNow, version_catalogo: 5 } })) } }
export function gridFixture(site = 'site-a', period = 'current_biweekly') { const date = period === 'current_biweekly' ? '2026-09-03' : '2026-08-31'; return { ...envelope({ operational: 10, groups: 3 }), site_id: site, period: { key: period, from: period === 'current_biweekly' ? '2026-09-01' : '2026-08-16', to: period === 'current_biweekly' ? '2026-09-15' : '2026-08-31' }, data: { shifts: ['day','night','early'].map(shift => ({ date, shift, numerator: 2, denominator: 10, percentage: 20, groups_revision: 3, calculated_at: adminNow })), totals: [{ date, numerator: site === 'site-a' ? 3 : 0, denominator: 10, percentage: site === 'site-a' ? 30 : 0, groups_revision: 3 }] } } }
export function dailyFixture(site = 'site-a', date = '2026-09-03') { return { ...envelope(), site_id: site, origin_date: date, summary: { pending_recount: 1, confirmed: 1, inconsistent: 1 }, items: [{ case_id: 'case-0', grupo_id: 'group-0', grupo: 'Grupo 0', estado: 'Confirmada', contado_at: adminNow, recontado_at: null, theoretical: 20, physical: 18, stock_class: 'positive', difference: -2, value: -7.5, source: 'recount' }] } }
export function dailyBootstrapFixture(site = 'site-a', date = '2026-09-03', stockClass = 'positive') {
  return {
    ...envelope(),
    site_id: site,
    origin_date: date,
    stock_class: stockClass,
    page_size: 25,
    counts: {
      positive: { Coincide: 27, Recontar: 2, Confirmada: 1, Inconsistente: 1 },
      zero: { Coincide: 3, Recontar: 0, Confirmada: 0, Inconsistente: 0 },
    },
    views: {
      Coincide: Array.from({ length: 25 }, (_, i) => ({ case_id: `coincide-${stockClass}-${i}`, grupo: `Grupo coincide ${i}`, stock: i + 1 })),
      Recontar: [{ case_id: 'recount-0', grupo: 'Grupo recontar', physical: 8, difference: -2 }],
      Confirmada: [{ case_id: 'confirmed-0', grupo: 'Grupo confirmado', difference: -2, valued_difference: -7.5 }],
      Inconsistente: [{ case_id: 'inconsistent-0', grupo: 'Grupo inconsistente', theoretical: 4, initial_difference: 23, found_difference: -1 }],
    },
  }
}
export function dailyPageOptimizedFixture(p) {
  const stateRows = {
    Coincide: [{ case_id: `coincide-${p.stock_class}-page-${p.page}`, grupo: 'Grupo página', stock: 30 }],
    Recontar: [{ case_id: `recount-${p.page}`, grupo: 'Grupo recontar página', physical: 9, difference: -1 }],
    Confirmada: [{ case_id: `confirmed-${p.page}`, grupo: 'Grupo confirmado página', difference: 2, valued_difference: 10 }],
    Inconsistente: [{ case_id: `inconsistent-${p.page}`, grupo: 'Grupo inconsistente página', theoretical: 5, initial_difference: 4, found_difference: -2 }],
  }
  return { ...envelope(), site_id: p.site_id, origin_date: p.origin_date, stock_class: p.stock_class, state: p.state, page: p.page, page_size: 25, items: stateRows[p.state] }
}
export function pageFixture(p) { const length = p.page ? 1 : 100; return { ...envelope(), site_id: p.site_id, period: { key: p.period, from: p.date_from ?? '2026-09-03', to: p.date_to ?? '2026-09-03' }, summary: { total: 101, coincide: 98, pending_recount: 1, confirmed: 1, inconsistent: 1 }, page: p.page, page_size: p.page_size, items: Array.from({ length }, (_, i) => { const id = i + p.page * 100; return { case_id: `case-${id}`, grupo_id: `group-${id}`, grupo: `Grupo ${id}`, categoria: 'Bebidas', contado_at: adminNow, recontado_at: null, estado_diferencia: 'Confirmada', diferencia: -2, valor_diferencia: -7.5 } }) } }
export function detailFixture(site = 'site-a', group = 'group-0') { return { ...envelope(), site_id: site, group_id: group, chronology: [{ case_id: 'case-0', contado_at: adminNow, recontado_at: null, stock_teorico: 30, stock_fisico: 27, diferencia_inicial: -3, stock_posterior: null, stock_teorico_reconteo: 20, stock_reconteo: 18, diferencia: -2, estado_diferencia: 'Confirmada', valor_diferencia: -7.5 }] } }
export function exportFixture(site = 'site-a', period = 'current_biweekly') { const base = { case_id: 'case-0', grupo_id: 'group-0', grupo: 'Grupo 0', categoria: 'Bebidas', fecha_origen: adminNow }; const result = { ...base, estado: 'Confirmada', teorico: 20, fisico: 18, diferencia: -2, valorizado: -7.5, source: 'recount' }; return { ...envelope({ operational: 10, groups: 3 }), site: { id: site, nombre: site === 'site-a' ? 'Sede A' : 'Sede B' }, period: gridFixture(site,period).period, summary: { total: 3, coincide: 0, pending_recount: 1, confirmed: 1, inconsistent: 1 }, adjustments: [result], pending_recount: [{ ...base, case_id: 'case-1', teorico_conteo: 30, fisico_conteo: 25, diferencia: -5, stock_posterior: null }], inconsistent: [{ ...base, case_id: 'case-2', teorico_conteo: 30, fisico_conteo: 25, diferencia_conteo: -5, teorico_reconteo: 20, fisico_reconteo: 19, diferencia_reconteo: -1, estado: 'Inconsistente' }], all: [{ ...result, recontado_at: adminNow }] } }
export function groupsFixture(p) {
  const ranges = { today: ['2026-09-03','2026-09-03'], last_week: ['2026-08-28','2026-09-03'], current_biweekly: ['2026-09-01','2026-09-15'], previous_biweekly: ['2026-08-16','2026-08-31'], custom: [p.date_from,p.date_to] }
  const [from,to] = ranges[p.period]
  return { ...envelope(), site_id: p.site_id, period: {key:p.period,from,to}, items: Array.from({length:101},(_,i)=>({
    case_id:'case-'+i, group_id:'group-'+i, group_name:'Grupo '+i, category:'Bebidas', origin_at:adminNow,
    state:['Coincide','Recontar','Confirmada','Inconsistente'][i%4], difference:[0,2,-2,-3][i%4], valued_difference:[0,7.5,-7.5,-11.25][i%4],
  })) }
}
export function chronologyFixture(p) {
  return { ...envelope(), site_id:p.site_id, group:{id:p.group_id,name:'Grupo '+p.group_id.replace('group-',''),category:null},
    period:gridFixture(p.site_id,p.period).period, chronology:[
      { row_id:'initial-0',case_id:'case-0',event_at:'2026-09-03T22:30:00Z',state:'Recontado',theoretical:3,physical:13,difference:10,valued_difference:220,valuation:{unit_price:22,units_per_package:null,package_price:null} },
      { row_id:'initial-1',case_id:'case-1',event_at:'2026-09-04T22:30:00Z',state:'Recontado',theoretical:114,physical:104,difference:-10,valued_difference:-420,valuation:{unit_price:42,units_per_package:6,package_price:240} },
      { row_id:'final-0',case_id:'case-0',event_at:'2026-09-16T22:30:00Z',state:'Confirmada',theoretical:3,physical:8,difference:5,valued_difference:110,valuation:{unit_price:22,units_per_package:null,package_price:null} },
      { row_id:'final-1',case_id:'case-1',event_at:'2026-09-18T22:30:00Z',state:'Inconsistente',theoretical:114,physical:119,difference:5,valued_difference:210,valuation:{unit_price:42,units_per_package:6,package_price:240} },
    ] }
}
export function chronologyViewFixture(p) {
  const current = p.period === 'current_biweekly'
  return {
    ...envelope(),
    site_id: p.site_id,
    group: { id: p.group_id, name: 'Grupo '+p.group_id.replace('group-',''), category: 'Bebidas', latest_unit_price: current ? 42 : 22 },
    period: gridFixture(p.site_id,p.period).period,
    chronology: current ? [
      { row_id:'final-1',event_at:'2026-09-18T22:30:00Z',state:'Inconsistente',theoretical:114,initial_difference:-10,found_difference:5 },
      { row_id:'final-0',event_at:'2026-09-16T22:30:00Z',state:'Confirmada',difference:5,valued_difference:110 },
      { row_id:'initial-1',event_at:'2026-09-04T22:30:00Z',state:'Recontado',physical:104,difference:-10 },
      { row_id:'initial-0',event_at:'2026-09-03T22:30:00Z',state:'Coincide',stock:13 },
    ] : [],
  }
}
export function responseFixture(action, payload = {}) { return action === 'bootstrap' ? bootstrapFixture() : action === 'dashboard_cards' ? cardsFixture() : action === 'shift_grid' ? gridFixture(payload.site_id, payload.period) : action === 'daily_detail' ? dailyFixture(payload.site_id,payload.origin_date) : action === 'daily_detail_bootstrap' ? dailyBootstrapFixture(payload.site_id,payload.origin_date,payload.stock_class) : action === 'daily_detail_page' ? dailyPageOptimizedFixture(payload) : action === 'control_groups' ? groupsFixture(payload) : action === 'control_chronology' ? chronologyFixture(payload) : action === 'control_chronology_view' ? chronologyViewFixture(payload) : action === 'control_page' ? pageFixture(payload) : action === 'control_detail' ? detailFixture(payload.site_id,payload.group_id) : exportFixture(payload.site_id,payload.period) }
