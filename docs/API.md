# API inicial KM Detail Line B2B

Base URL local: `http://127.0.0.1:4180/api`

Todas las solicitudes con contenido utilizan `application/json`. La autenticación utiliza una cookie `HttpOnly` llamada `km_session`.

## Público y autenticación

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Estado del servicio |
| POST | `/auth/register` | Registro comercial pendiente |
| POST | `/auth/login` | Inicio de sesión |
| POST | `/auth/logout` | Cierre de sesión |
| POST | `/auth/forgot-password` | Solicitar enlace de recuperación |
| POST | `/auth/reset-password` | Cambiar contraseña con token de un solo uso |
| GET | `/me` | Usuario autenticado |
| GET | `/products` | Productos públicos o precios privados según sesión |
| GET | `/public-settings` | IVA vigente y WhatsApp comercial |

## Cliente aprobado

| Método | Ruta | Función |
|---|---|---|
| POST | `/orders` | Confirmar pedido y reservar precio |
| GET | `/orders/:id` | Consultar un pedido propio |
| POST | `/orders/:id/accept` | Reaceptar pedido modificado |

## Administración

| Método | Ruta | Función |
|---|---|---|
| GET | `/admin/customers` | Listar clientes |
| PATCH | `/admin/customers/:id/status` | Aprobar, rechazar o suspender |
| PATCH | `/admin/customers/:id/discounts` | Asignar hasta tres descuentos |
| POST | `/admin/products` | Crear o actualizar producto por código KM |
| GET | `/admin/orders` | Listar pedidos |
| PATCH | `/admin/orders/:id` | Actualizar estados con motivo |
| GET | `/admin/settings` | Ver IVA, WhatsApp y datos bancarios |
| PATCH | `/admin/settings` | Modificar configuración comercial |

## Convenciones monetarias

- Los importes se envían como enteros en centavos.
- Los porcentajes se envían en puntos básicos.
- Ejemplos: `$1.000,00 = 100000`; `21% = 2100`; `30% = 3000`.

## Pendiente para las siguientes iteraciones

- carga segura de comprobantes,
- modificación económica de pedidos y nueva aceptación,
- importador masivo Excel/CSV,
- integración opcional Mercado Pago,
- adaptador PostgreSQL,
- interfaz gráfica de cliente y administrador.
