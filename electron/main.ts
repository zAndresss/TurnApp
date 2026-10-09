import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path'; import fs from 'node:fs';
import { initDb, login, seedDemo, clearDemo, list, save, remove, dashboard, settings, setSettings, assignServices, employeeServices, getReports } from './db';
let win:BrowserWindow;
let session:any=null;
function createWindow(){
  win=new BrowserWindow({width:1440,height:920,minWidth:1100,minHeight:700,backgroundColor:'#0b1020',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}});
  if(process.defaultApp) win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'); else win.loadFile(path.join(__dirname,'../dist/index.html'));
}
function requireSession(){if(!session)throw new Error('Sesión no válida');return session;}
function requireAdmin(){const s=requireSession();if(s.rol!=='admin')throw new Error('Esta acción requiere permisos de administrador.');return s;}
app.whenReady().then(()=>{initDb();
 ipcMain.handle('auth:login',(_,u,p)=>{session=login(u,p);return session});
 ipcMain.handle('auth:logout',()=>{session=null}); ipcMain.handle('auth:session',()=>session);
 ipcMain.handle('data:list',(_,e)=>{requireSession();return list(e)});
 ipcMain.handle('data:save',(_,e,p)=>{const s=requireSession();if(['usuarios','empleados','servicios','horarios','pausas','dias_festivos','excepciones'].includes(e))requireAdmin();return save(e,p,s.id)});
 ipcMain.handle('data:delete',(_,e,id)=>{const s=requireSession();requireAdmin();return remove(e,id,s.id)});
 ipcMain.handle('employees:services',(_,id)=>{requireSession();return employeeServices(id)});
 ipcMain.handle('employees:assignServices',(_,id,ids)=>{const s=requireSession();requireAdmin();return assignServices(id,ids,s.id)});
 ipcMain.handle('dashboard',()=>{requireSession();return dashboard()}); ipcMain.handle('settings:get',()=>{requireSession();return settings()}); ipcMain.handle('settings:set',(_,v)=>{const s=requireSession();requireAdmin();return setSettings(v,s.id)});
 ipcMain.handle('demo:seed',()=>{const s=requireSession();requireAdmin();return seedDemo(s.id)}); ipcMain.handle('demo:clear',()=>{const s=requireSession();requireAdmin();return clearDemo(s.id)});
 ipcMain.handle('reports',()=>{requireSession();return getReports()});
 ipcMain.handle('db:backup',async()=>{requireAdmin();const r=await dialog.showSaveDialog(win,{title:'Guardar copia de seguridad',defaultPath:'turnos-pro-backup.sqlite',filters:[{name:'SQLite',extensions:['sqlite']}]});if(r.canceled||!r.filePath)return null;const dbPath=path.join(app.getPath('userData'),'data','turnos-pro.sqlite');fs.copyFileSync(dbPath,r.filePath);return r.filePath;});
 ipcMain.handle('db:restore',async()=>{requireAdmin();const r=await dialog.showOpenDialog(win,{title:'Restaurar copia de seguridad',properties:['openFile'],filters:[{name:'SQLite',extensions:['sqlite','db']}]});if(r.canceled||!r.filePaths[0])return null;const dbPath=path.join(app.getPath('userData'),'data','turnos-pro.sqlite');fs.copyFileSync(r.filePaths[0],dbPath);return true;});
 ipcMain.handle('shell:open',(_,url)=>{if(/^https?:/.test(url))shell.openExternal(url)});
 createWindow(); app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow()});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
