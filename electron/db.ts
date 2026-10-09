import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import bcrypt from 'bcryptjs';

let db: Database.Database;
export const getDb = () => db;

const now = () => new Date().toISOString();

export function initDb() {
  const dir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'turnos-pro.sqlite'));
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      nombre TEXT NOT NULL, rol TEXT NOT NULL CHECK(rol IN ('admin','empleado')), activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, telefono TEXT, email TEXT, direccion TEXT, notas TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS empleados (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, foto TEXT, cargo TEXT, telefono TEXT, email TEXT,
      activo INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS servicios (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, descripcion TEXT, duracion INTEGER NOT NULL DEFAULT 30,
      precio REAL NOT NULL DEFAULT 0, color TEXT NOT NULL DEFAULT '#6366f1', activo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS empleado_servicio (
      empleado_id INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
      servicio_id INTEGER NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
      PRIMARY KEY (empleado_id, servicio_id)
    );
    CREATE TABLE IF NOT EXISTS horarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empleado_id INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
      dia_semana INTEGER NOT NULL CHECK(dia_semana BETWEEN 0 AND 6), hora_inicio TEXT NOT NULL, hora_fin TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS pausas (
      id INTEGER PRIMARY KEY AUTOINCREMENT, horario_id INTEGER NOT NULL REFERENCES horarios(id) ON DELETE CASCADE,
      hora_inicio TEXT NOT NULL, hora_fin TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dias_festivos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS excepciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT, empleado_id INTEGER REFERENCES empleados(id) ON DELETE CASCADE,
      fecha TEXT NOT NULL, hora_inicio TEXT, hora_fin TEXT, disponible INTEGER NOT NULL DEFAULT 0, motivo TEXT
    );
    CREATE TABLE IF NOT EXISTS turnos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      servicio_id INTEGER NOT NULL REFERENCES servicios(id), empleado_id INTEGER NOT NULL REFERENCES empleados(id),
      fecha TEXT NOT NULL, hora_inicio TEXT NOT NULL, hora_fin TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmado','en_curso','completado','cancelado','no_asistio')),
      notas TEXT, precio REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS configuraciones (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      accion TEXT NOT NULL, entidad TEXT NOT NULL, entidad_id INTEGER, detalle TEXT, created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha);
    CREATE INDEX IF NOT EXISTS idx_turnos_empleado_fecha ON turnos(empleado_id, fecha, hora_inicio, hora_fin);
    CREATE INDEX IF NOT EXISTS idx_turnos_cliente ON turnos(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(created_at);
  `);
  const count = db.prepare('SELECT COUNT(*) c FROM usuarios').get() as {c:number};
  if (!count.c) {
    const password_hash = bcrypt.hashSync('admin123', 12);
    db.prepare(`INSERT INTO usuarios(username,password_hash,nombre,rol,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
      .run('admin', password_hash, 'Administrador', 'admin', now(), now());
  }
  const defaults: Record<string,string> = {empresa_nombre:'Turnos Pro', moneda:'COP', formato_fecha:'dd/MM/yyyy', tema:'system', notificaciones:'1'};
  const insertSetting = db.prepare('INSERT OR IGNORE INTO configuraciones(clave,valor) VALUES(?,?)');
  for (const [k,v] of Object.entries(defaults)) insertSetting.run(k,v);
}

function audit(usuarioId:number|undefined, accion:string, entidad:string, id:number|undefined, detalle?:unknown) {
  db.prepare(`INSERT INTO auditoria(usuario_id,accion,entidad,entidad_id,detalle,created_at) VALUES(?,?,?,?,?,?)`)
    .run(usuarioId ?? null, accion, entidad, id ?? null, detalle ? JSON.stringify(detalle) : null, now());
}

export function login(username:string,password:string) {
  const user = db.prepare('SELECT id,username,password_hash,nombre,rol,activo FROM usuarios WHERE username=?').get(username) as any;
  if (!user || !user.activo || !bcrypt.compareSync(password,user.password_hash)) throw new Error('Usuario o contraseña incorrectos');
  return {id:user.id,username:user.username,nombre:user.nombre,rol:user.rol};
}

export function seedDemo(usuarioId?:number) {
  const existing = db.prepare('SELECT COUNT(*) c FROM clientes').get() as any;
  if (existing.c) return;
  const t = db.transaction(() => {
    const stamp=now();
    const c1 = Number(db.prepare(`INSERT INTO clientes(nombre,telefono,email,direccion,notas,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).run('Laura Martínez','3001234567','laura@ejemplo.com','Bogotá','Cliente frecuente',stamp,stamp).lastInsertRowid);
    const c2 = Number(db.prepare(`INSERT INTO clientes(nombre,telefono,email,direccion,notas,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).run('Andrés Gómez','3119876543','andres@ejemplo.com','Bogotá','Prefiere horarios de tarde',stamp,stamp).lastInsertRowid);
    const e1 = Number(db.prepare(`INSERT INTO empleados(nombre,cargo,telefono,email,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run('Camila Rojas','Especialista','3151112233','camila@empresa.com',stamp,stamp).lastInsertRowid);
    const e2 = Number(db.prepare(`INSERT INTO empleados(nombre,cargo,telefono,email,created_at,updated_at) VALUES(?,?,?,?,?,?)`).run('Daniel Pérez','Consultor','3204445566','daniel@empresa.com',stamp,stamp).lastInsertRowid);
    const s1 = Number(db.prepare(`INSERT INTO servicios(nombre,descripcion,duracion,precio,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).run('Consulta inicial','Evaluación y orientación',45,60000,'#6366f1',stamp,stamp).lastInsertRowid);
    const s2 = Number(db.prepare(`INSERT INTO servicios(nombre,descripcion,duracion,precio,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`).run('Sesión premium','Servicio especializado',60,95000,'#10b981',stamp,stamp).lastInsertRowid);
    db.prepare('INSERT INTO empleado_servicio VALUES(?,?)').run(e1,s1); db.prepare('INSERT INTO empleado_servicio VALUES(?,?)').run(e1,s2); db.prepare('INSERT INTO empleado_servicio VALUES(?,?)').run(e2,s1);
    for (const e of [e1,e2]) for(let d=1;d<=5;d++) db.prepare('INSERT INTO horarios(empleado_id,dia_semana,hora_inicio,hora_fin) VALUES(?,?,?,?)').run(e,d,'08:00','17:00');
    const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);
    const day2 = new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    db.prepare(`INSERT INTO turnos(cliente_id,servicio_id,empleado_id,fecha,hora_inicio,hora_fin,estado,notas,precio,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(c1,s1,e1,tomorrow,'09:00','09:45','confirmado','Llevar documento',60000,stamp,stamp);
    db.prepare(`INSERT INTO turnos(cliente_id,servicio_id,empleado_id,fecha,hora_inicio,hora_fin,estado,notas,precio,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(c2,s2,e2,day2,'14:00','15:00','pendiente','Primera visita',95000,stamp,stamp);
    audit(usuarioId,'SEED_DEMO','sistema',undefined);
  }); t();
}

export function clearDemo(usuarioId?:number) {
  const t=db.transaction(()=>{ db.prepare('DELETE FROM turnos').run(); db.prepare('DELETE FROM empleado_servicio').run(); db.prepare('DELETE FROM pausas').run(); db.prepare('DELETE FROM horarios').run(); db.prepare('DELETE FROM excepciones').run(); db.prepare('DELETE FROM dias_festivos').run(); db.prepare('DELETE FROM servicios').run(); db.prepare('DELETE FROM empleados').run(); db.prepare('DELETE FROM clientes').run(); audit(usuarioId,'CLEAR_DEMO','sistema',undefined); }); t();
}

export function list(entity:string) {
  const map:any = {
    clientes:'SELECT * FROM clientes ORDER BY nombre',
    empleados:'SELECT * FROM empleados ORDER BY nombre',
    servicios:'SELECT * FROM servicios ORDER BY nombre',
    usuarios:'SELECT id,username,nombre,rol,activo,created_at,updated_at FROM usuarios ORDER BY nombre',
    turnos:`SELECT t.*, c.nombre cliente_nombre, s.nombre servicio_nombre, s.color servicio_color, e.nombre empleado_nombre FROM turnos t JOIN clientes c ON c.id=t.cliente_id JOIN servicios s ON s.id=t.servicio_id JOIN empleados e ON e.id=t.empleado_id ORDER BY t.fecha,t.hora_inicio`,
    horarios:`SELECT h.*,e.nombre empleado_nombre FROM horarios h JOIN empleados e ON e.id=h.empleado_id ORDER BY h.empleado_id,h.dia_semana,h.hora_inicio`,
    pausas:'SELECT * FROM pausas ORDER BY horario_id,hora_inicio',
    dias_festivos:'SELECT * FROM dias_festivos ORDER BY fecha',
    excepciones:'SELECT x.*,e.nombre empleado_nombre FROM excepciones x LEFT JOIN empleados e ON e.id=x.empleado_id ORDER BY fecha',
    configuraciones:'SELECT * FROM configuraciones ORDER BY clave',
    auditoria:`SELECT a.*,u.nombre usuario_nombre FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.created_at DESC LIMIT 500`
  };
  if(!map[entity]) throw new Error('Entidad no permitida');
  return db.prepare(map[entity]).all();
}

const tableByEntity:any={clientes:'clientes',empleados:'empleados',servicios:'servicios',usuarios:'usuarios',turnos:'turnos',horarios:'horarios',pausas:'pausas',dias_festivos:'dias_festivos',excepciones:'excepciones'};
const allowed:any={
 clientes:['nombre','telefono','email','direccion','notas'],
 empleados:['nombre','foto','cargo','telefono','email','activo'],
 servicios:['nombre','descripcion','duracion','precio','color','activo'],
 usuarios:['username','nombre','rol','activo'],
 turnos:['cliente_id','servicio_id','empleado_id','fecha','hora_inicio','hora_fin','estado','notas','precio'],
 horarios:['empleado_id','dia_semana','hora_inicio','hora_fin','activo'],
 pausas:['horario_id','hora_inicio','hora_fin'],
 dias_festivos:['fecha','nombre'],
 excepciones:['empleado_id','fecha','hora_inicio','hora_fin','disponible','motivo']
};

function validateAvailability(data:any) {
  if(data.estado==='cancelado' || data.estado==='no_asistio') return;
  const schedules=db.prepare('SELECT * FROM horarios WHERE empleado_id=? AND dia_semana=? AND activo=1').all(data.empleado_id, new Date(data.fecha+'T00:00:00').getDay()) as any[];
  const holiday=db.prepare('SELECT 1 FROM dias_festivos WHERE fecha=?').get(data.fecha);
  const exception=db.prepare('SELECT * FROM excepciones WHERE (empleado_id=? OR empleado_id IS NULL) AND fecha=? ORDER BY id DESC LIMIT 1').get(data.empleado_id,data.fecha) as any;
  if(holiday && !exception?.disponible) throw new Error('La fecha seleccionada es un día festivo.');
  if(exception && !exception.disponible) throw new Error('El empleado no está disponible en la fecha seleccionada.');
  if(schedules.length){
    const inside=schedules.some((h:any)=>data.hora_inicio>=h.hora_inicio && data.hora_fin<=h.hora_fin);
    if(!inside) throw new Error('El turno queda fuera del horario laboral del empleado.');
    const pauses=db.prepare('SELECT p.* FROM pausas p JOIN horarios h ON h.id=p.horario_id WHERE h.empleado_id=? AND h.dia_semana=?').all(data.empleado_id,new Date(data.fecha+'T00:00:00').getDay()) as any[];
    if(pauses.some((p:any)=>data.hora_inicio<p.hora_fin && data.hora_fin>p.hora_inicio)) throw new Error('El turno coincide con una pausa del empleado.');
  }
  if(exception?.disponible && exception.hora_inicio && exception.hora_fin && (data.hora_inicio<exception.hora_inicio || data.hora_fin>exception.hora_fin)) throw new Error('El turno queda fuera de la excepción de disponibilidad.');
}

function validateOverlap(data:any, excludeId?:number) {
  if(data.estado==='cancelado') return;
  validateAvailability(data);
  const conflict=db.prepare(`SELECT id FROM turnos WHERE empleado_id=? AND fecha=? AND estado NOT IN ('cancelado','no_asistio') AND hora_inicio < ? AND hora_fin > ? ${excludeId?'AND id != ?':''} LIMIT 1`)
    .get(...([data.empleado_id,data.fecha,data.hora_fin,data.hora_inicio,...(excludeId?[excludeId]:[])]));
  if(conflict) throw new Error('El empleado ya tiene un turno en ese horario.');
  const clientConflict=db.prepare(`SELECT id FROM turnos WHERE cliente_id=? AND fecha=? AND estado NOT IN ('cancelado','no_asistio') AND hora_inicio < ? AND hora_fin > ? ${excludeId?'AND id != ?':''} LIMIT 1`)
    .get(...([data.cliente_id,data.fecha,data.hora_fin,data.hora_inicio,...(excludeId?[excludeId]:[])]));
  if(clientConflict) throw new Error('El cliente ya tiene un turno en ese horario.');
}

export function save(entity:string, payload:any, usuarioId?:number) {
  const table=tableByEntity[entity]; if(!table) throw new Error('Entidad no permitida');
  const fields=allowed[entity]; if(!fields) throw new Error('Campos no permitidos');
  for(const required of entity==='clientes'||entity==='empleados'||entity==='servicios'?['nombre']:[]) if(!String(payload[required]??'').trim()) throw new Error('Completa los campos obligatorios.');
  if(entity==='turnos'){ if(!payload.fecha||!payload.hora_inicio||!payload.hora_fin) throw new Error('Fecha y horario son obligatorios.'); if(payload.hora_fin<=payload.hora_inicio) throw new Error('La hora final debe ser posterior a la inicial.'); validateOverlap(payload,payload.id); }
  const clean:any={}; for(const f of fields) if(payload[f]!==undefined) clean[f]=payload[f];
  const stamp=now();
  if(payload.id){ const sets=Object.keys(clean).map(k=>`${k}=?`).join(','); db.prepare(`UPDATE ${table} SET ${sets},updated_at=? WHERE id=?`).run(...Object.values(clean),stamp,payload.id); audit(usuarioId,'UPDATE',entity,payload.id,clean); return payload.id; }
  const all={...clean,created_at:stamp,updated_at:stamp}; const keys=Object.keys(all); const result=db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(all)); audit(usuarioId,'CREATE',entity,Number(result.lastInsertRowid),clean); return Number(result.lastInsertRowid);
}

export function remove(entity:string,id:number,usuarioId?:number){ const table=tableByEntity[entity]; if(!table) throw new Error('Entidad no permitida'); if(entity==='usuarios'&&id===usuarioId) throw new Error('No puedes eliminar tu propio usuario.'); db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id); audit(usuarioId,'DELETE',entity,id); }

export function assignServices(employeeId:number, serviceIds:number[], usuarioId?:number){ const t=db.transaction(()=>{db.prepare('DELETE FROM empleado_servicio WHERE empleado_id=?').run(employeeId); const s=db.prepare('INSERT INTO empleado_servicio(empleado_id,servicio_id) VALUES(?,?)'); for(const id of serviceIds) s.run(employeeId,id); audit(usuarioId,'ASSIGN_SERVICES','empleados',employeeId,serviceIds);}); t(); }
export function employeeServices(employeeId:number){ return db.prepare('SELECT servicio_id FROM empleado_servicio WHERE empleado_id=?').all(employeeId).map((x:any)=>x.servicio_id); }

export function dashboard(){
  const today=new Date().toISOString().slice(0,10);
  const count=(sql:string)=> (db.prepare(sql).get(today) as any)?.c??0;
  const stats={today:count("SELECT COUNT(*) c FROM turnos WHERE fecha=? AND estado NOT IN ('cancelado')"),pending:count("SELECT COUNT(*) c FROM turnos WHERE fecha=? AND estado IN ('pendiente','confirmado','en_curso')"),completed:count("SELECT COUNT(*) c FROM turnos WHERE fecha=? AND estado='completado'"),cancelled:count("SELECT COUNT(*) c FROM turnos WHERE fecha=? AND estado='cancelado'"),clients:(db.prepare('SELECT COUNT(*) c FROM clientes').get() as any).c,employees:(db.prepare('SELECT COUNT(*) c FROM empleados WHERE activo=1').get() as any).c};
  const upcoming=db.prepare(`SELECT t.*,c.nombre cliente_nombre,s.nombre servicio_nombre,s.color servicio_color,e.nombre empleado_nombre FROM turnos t JOIN clientes c ON c.id=t.cliente_id JOIN servicios s ON s.id=t.servicio_id JOIN empleados e ON e.id=t.empleado_id WHERE (t.fecha > ? OR (t.fecha=? AND t.hora_inicio>=?)) AND t.estado NOT IN ('cancelado','completado','no_asistio') ORDER BY t.fecha,t.hora_inicio LIMIT 6`).all(today,today,new Date().toTimeString().slice(0,5));
  const revenue=db.prepare("SELECT COALESCE(SUM(precio),0) total FROM turnos WHERE estado='completado'").get() as any;
  const byStatus=db.prepare('SELECT estado,COUNT(*) total FROM turnos GROUP BY estado').all();
  const byMonth=db.prepare("SELECT substr(fecha,1,7) mes,COUNT(*) total,COALESCE(SUM(CASE WHEN estado='completado' THEN precio ELSE 0 END),0) ingresos FROM turnos WHERE fecha>=date('now','-5 months') GROUP BY mes ORDER BY mes").all();
  return {stats,upcoming,revenue:revenue.total,byStatus,byMonth};
}
export function settings(){ const rows=list('configuraciones') as any[]; return Object.fromEntries(rows.map(x=>[x.clave,x.valor])); }
export function setSettings(values:any,usuarioId?:number){ const stmt=db.prepare('INSERT INTO configuraciones(clave,valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor'); const t=db.transaction(()=>{for(const [k,v] of Object.entries(values))stmt.run(k,String(v)); audit(usuarioId,'UPDATE','configuraciones',undefined,values)});t(); }
export function getReports(){ return {turnos:list('turnos'),clientes:list('clientes'),empleados:list('empleados'),servicios:list('servicios')}; }
