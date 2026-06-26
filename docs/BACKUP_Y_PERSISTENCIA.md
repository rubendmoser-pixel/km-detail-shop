# Backup y persistencia - KM Detail Line

## Objetivo

Proteger los datos cargados en la plataforma:

- base SQLite con clientes, productos, pedidos, estados, vendedores y configuracion;
- imagenes de productos;
- comprobantes de pago cargados por clientes.

## Rutas criticas

En produccion el Dockerfile define:

```text
DATABASE_PATH=/data/km-detail.sqlite
UPLOADS_PATH=/data/uploads
```

Esto esta bien preparado para Railway siempre que exista un volumen persistente montado en `/data`.

Si `/data` no esta respaldado por un volumen, los datos cargados desde la web pueden perderse ante redeploy, recreacion del contenedor o mantenimiento de infraestructura.

## Verificacion necesaria en Railway

En el servicio de Railway debe existir:

- un volumen persistente;
- mount path: `/data`;
- variables `DATABASE_PATH` y `UPLOADS_PATH` sin apuntar a una ruta temporal.

Valores recomendados:

```text
DATABASE_PATH=/data/km-detail.sqlite
UPLOADS_PATH=/data/uploads
BACKUP_PATH=/data/backups
```

## Crear un backup

Desde la carpeta del proyecto:

```powershell
npm run backup
```

El comando crea una carpeta en:

```text
backups/km-detail-backup-FECHA
```

Incluye:

- `km-detail.sqlite`: copia consistente de la base;
- `uploads/`: copia de imagenes y comprobantes;
- `manifest.json`: resumen del backup, rutas, cantidad de archivos y tamano.

## Backup con ruta personalizada

En produccion conviene guardar backups dentro del volumen:

```powershell
$env:BACKUP_PATH="/data/backups"
npm run backup
```

En Windows local:

```powershell
$env:BACKUP_PATH="C:\Users\ruben\Documents\KM Backups"
npm run backup
```

## Frecuencia recomendada

Mientras se cargan imagenes manualmente:

- backup diario al terminar la carga;
- backup antes de cambios grandes;
- backup antes de tocar variables de Railway;
- backup antes de migraciones de base.

Cuando la plataforma ya este estable:

- backup semanal;
- backup adicional antes de cambios importantes.

## Restauracion manual

Para restaurar:

1. Detener la aplicacion.
2. Copiar `km-detail.sqlite` del backup a la ruta definida en `DATABASE_PATH`.
3. Copiar la carpeta `uploads` del backup a la ruta definida en `UPLOADS_PATH`.
4. Iniciar la aplicacion.
5. Probar `/api/health`, login admin y una imagen de producto.

## Pendiente recomendado

En una etapa posterior conviene automatizar la descarga externa de backups hacia un almacenamiento fuera de Railway, por ejemplo:

- Cloudflare R2;
- AWS S3;
- Google Drive empresarial;
- repositorio privado de backups cifrados.

