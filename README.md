# KM Detail Line B2B

Base funcional de la plataforma comercial B2B de KM Detail Line.

El repositorio conserva temporalmente el sitio público existente y agrega un backend independiente para desarrollar clientes, precios privados, descuentos, pedidos y administración antes de diseñar las nuevas pantallas.

## Requisitos

- Node.js 24 o posterior.
- No requiere dependencias npm para la base actual.

## Inicio local

1. Copiar `.env.example` como `.env` y definir credenciales seguras.
2. Ejecutar:

```powershell
npm start
```

La aplicación local queda disponible en `http://127.0.0.1:4180` y la API en `/api`.

El panel administrativo está disponible en `/admin.html`. Los administradores
pueden revisar clientes, aprobar o suspender cuentas, asignar tres descuentos en
cascada, consultar pedidos y editar IVA, WhatsApp y datos bancarios.

## Notificaciones por email

Cada alta comercial se guarda primero en `email_outbox`. Esto evita perder avisos
si el proveedor de correo está temporalmente indisponible. Para enviar mediante
Zoho, configurar en `.env`:

```text
NOTIFICATION_EMAIL=ventas@km-detail.com
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=ventas@km-detail.com
SMTP_PASSWORD=contrasena-de-aplicacion-zoho
```

`SMTP_PASSWORD` debe ser una contraseña de aplicación creada en Zoho, no la
contraseña normal de la cuenta.

La cola incluye:

- aviso interno de nueva solicitud comercial,
- bienvenida al cliente y confirmación de solicitud recibida,
- aviso al cliente por aprobación, rechazo o suspensión,
- recuperación de contraseña mediante enlace de un solo uso con vigencia de una hora.

## Pruebas

```powershell
node --test
```

Las pruebas cubren:

- descuentos en cascada,
- IVA configurable,
- autenticación y aprobación,
- precios privados,
- creación de pedidos,
- reserva de precio, IVA y datos bancarios.

## Arquitectura inicial

- Node.js ESM y servidor HTTP nativo.
- SQLite local mediante `node:sqlite`.
- Importes almacenados en centavos.
- Porcentajes almacenados en puntos básicos (`2100 = 21%`).
- Contraseñas protegidas con `scrypt`.
- Sesiones aleatorias guardadas como hashes SHA-256.
- Pedidos con copias inmutables de precios, descuentos, IVA y datos bancarios.

## Importar el catálogo 2026

La fuente normalizada incluida contiene 104 productos activos con precios de lista
en pesos argentinos, sin IVA. Para crear o actualizar productos por código KM:

```powershell
npm run catalog:import
```

El comando es idempotente: actualiza productos existentes y no crea duplicados.
También admite otra fuente JSON compatible como argumento:

```powershell
npm run catalog:import -- C:\ruta\catalogo.json
```

SQLite se utiliza para desarrollo inicial. La capa de persistencia deberá migrarse a PostgreSQL antes del despliegue productivo multiusuario.

## Documentación

- [Contrato funcional definitivo](./CONTRATO_FUNCIONAL_DEFINITIVO_KM_DETAIL_LINE.md)
- [API inicial](./docs/API.md)

Dominio público actual: [km-detail.com](https://km-detail.com)
