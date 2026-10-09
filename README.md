# Turnos Pro

Aplicación de escritorio para gestión de turnos/citas construida con Electron + React + TypeScript + SQLite.

## Funcionalidades

- Dashboard con indicadores, próximos turnos e ingresos.
- Calendario mensual, semanal, diario y agenda.
- CRUD de clientes, empleados y servicios.
- Gestión de turnos con estados, notas y precios.
- Prevención de solapamientos para empleado y cliente.
- Validación de horarios laborales, pausas, festivos y excepciones.
- Horarios por empleado.
- Autenticación local con bcrypt y roles `admin` / `empleado`.
- Auditoría de operaciones.
- Reportes exportables a CSV y PDF.
- Copias de seguridad/restauración de SQLite.
- Tema claro/oscuro.
- Datos de demostración cargables y eliminables.
- Empaquetado Windows (NSIS), macOS (DMG) y Linux (AppImage).

## Requisitos

- Node.js 20+ recomendado.
- npm 10+.

## Desarrollo

```bash
npm install
npm run dev
```

La aplicación abre Electron y el servidor Vite automáticamente.

## Credenciales iniciales

- Usuario: `admin`
- Contraseña: `admin123`

Cambia la contraseña mediante el módulo de usuarios cuando se amplíe la administración de cuentas. Las contraseñas no se almacenan en texto plano: se guardan como hash bcrypt.

## Producción

```bash
npm run build
npm run dist
```

Los instaladores quedan en `release/`.

## Base de datos

SQLite se guarda en la carpeta de datos de usuario de Electron, dentro de `data/turnos-pro.sqlite`. El modo WAL está habilitado y las claves foráneas también.

## Arquitectura

```text
src/                 React + TypeScript (UI)
  main.tsx
  styles.css

electron/
  main.ts            Proceso principal e IPC
  preload.ts         API segura expuesta al renderer
  db.ts              SQLite, validaciones y repositorios

tests/
  core.test.ts       Pruebas de reglas de agenda
```

La UI no accede directamente a SQLite. Todas las operaciones pasan por IPC y las comprobaciones de permisos se ejecutan en el proceso principal.
