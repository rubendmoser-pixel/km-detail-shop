# Informe de estado - KM Detail Line

Fecha: 2026-06-26
Dominio: https://www.km-detail.com

## Resumen ejecutivo

La plataforma ya funciona como sitio institucional, catalogo tecnico, sistema de pedidos B2B y panel interno de administracion comercial. El estado general es avanzado para una primera version operativa: permite captar clientes comerciales, aprobar cuentas, mostrar precios privados, tomar pedidos, confirmar disponibilidad, gestionar pago, despacho, documentos logisticos y seguimiento del cliente.

El punto mas importante a revisar antes de cargar volumen grande de datos reales es la persistencia de base de datos y archivos subidos en Railway. La aplicacion usa SQLite y almacenamiento de archivos local configurable. Debe confirmarse que `DATABASE_PATH` y `UPLOADS_PATH` apunten a un volumen persistente. Sin volumen, un redeploy podria perder imagenes subidas, comprobantes o datos nuevos.

## Sitio publico

- Inicio con posicionamiento claro de KM como fabricante argentino.
- Pagina Empresa con enfoque institucional y tecnico.
- Pagina Productos con catalogo operativo, filtros, buscador, imagenes y galerias.
- Pagina Catalogo 2026 con visualizador por imagenes y descarga PDF.
- Pagina Distribuidores separada de Contacto.
- Pagina Contacto separada, con datos comerciales.
- Navegacion responsive con menu mobile.
- SEO tecnico inicial: sitemap, robots, canonical, Open Graph, Twitter Card y datos estructurados Organization/WebSite/WebPage.
- URLs SEO para familias y productos.

## Sistema comercial cliente

- Registro de cuenta comercial.
- Validacion inicial de datos comerciales.
- Login, logout y recuperacion de contrasena.
- Cuenta pendiente/aprobada/suspendida.
- Precios en pesos argentinos.
- Precios sin IVA, IVA discriminado.
- Descuentos comerciales por cliente.
- Carrito de pedidos con totales claros.
- Direcciones de recepcion multiples por cliente.
- Direccion preferida, alta, edicion y baja.
- Creacion de pedidos con reserva de precio.
- Historial "Mis compras" con estado, lineas, entrega y acciones.
- Carga de comprobante cuando corresponde.
- Reaceptacion de pedido modificado cuando KM confirma disponibilidad parcial.

## Panel administrativo

- Gestion de clientes.
- Aprobacion, rechazo y suspension.
- Asignacion de descuentos por cliente.
- Gestion de vendedores.
- Asignacion de vendedor y comision por cliente.
- Gestion de productos.
- Carga de imagenes multiples por producto.
- Seleccion de imagen principal.
- Ubicacion de deposito por articulo.
- Gestion de pedidos.
- Estados comerciales, pago y despacho diferenciados.
- Confirmacion de disponibilidad por articulo.
- Ajuste de cantidades disponibles.
- Notas para el cliente.
- Carga y revision de comprobantes.
- Gestion de despacho: estado, modalidad, transporte, guia/remito, fecha estimada y observaciones.
- Panel de emails.
- Panel de seguridad con eventos de acceso.
- Configuracion comercial: IVA, WhatsApp, banco y parametros.

## Logistica y documentos

- Etiquetas A4 por bulto.
- Codigo de barras por pedido/bulto.
- Numeracion tipo "Bulto 1 de 4".
- Hoja de preparacion de pedido con ubicacion de deposito.
- Documento comercial no fiscal para caja.
- Detalle de productos, cantidades, precios y totales.
- Datos comerciales de KM en documento.
- Campos de control interno: preparado, controlado y recibido.

## Notificaciones

- Email por alta comercial.
- Email de bienvenida/recepcion.
- Email de aprobacion, rechazo o suspension.
- Email al cliente por pedido creado.
- Email a KM por pedido.
- Email al vendedor asignado con copia/seguimiento.
- Email por disponibilidad confirmada.
- Email por pago acreditado u observado.
- Email por despacho.
- WhatsApp manual al cliente con texto en castellano.

## Seguridad

- Cookies `HttpOnly`.
- Cookies seguras en produccion.
- Sesiones aleatorias guardadas con hash SHA-256.
- Contrasenas protegidas con `scrypt`.
- Recuperacion de contrasena con token de un solo uso.
- Rate limit por IP/ruta para evitar fuerza bruta.
- Registro de eventos de seguridad.
- Separacion de roles admin/cliente.
- Rutas administrativas protegidas.

Estado: solido para el tipo de plataforma actual. No existe seguridad absoluta, pero la base esta bien armada para un sistema B2B privado.

## PWA / instalacion como app

La web esta configurada como PWA con:

- `manifest.webmanifest`.
- `service-worker.js`.
- Iconos 192 y 512.
- `apple-touch-icon`.
- Tema oscuro.
- Modo standalone.

Se ajusto el manifest para que la app se instale como "KM Detail Line" y no como "KM Compras". Tambien se agregaron `id`, `scope`, `start_url`, idioma, categorias, shortcuts e iconos `maskable`.

### Bloqueo de Google Play Protect

La captura muestra: "Se bloqueo la app no segura" y "Esta app se diseno para una version anterior de Android". Ese mensaje normalmente corresponde a un APK/instalador Android que apunta a una version antigua de Android, no a la web en si.

Recomendacion:

- Para uso inmediato: instalar desde Chrome como PWA usando "Instalar app" o "Agregar a pantalla principal", no mediante APK externo.
- Si se quiere una app Android real: construir una TWA moderna con target SDK actual, firmarla correctamente y publicarla por Play Console o distribuirla por canal controlado.
- No conviene usar generadores viejos de APK/PWA porque Android puede bloquearlos por privacidad/seguridad.

## Riesgos o pendientes importantes

1. Persistencia en Railway

Confirmar volumen persistente para:

- base SQLite (`DATABASE_PATH`);
- imagenes de productos (`UPLOADS_PATH/products`);
- comprobantes (`UPLOADS_PATH/receipts`).

2. Backup

Implementar copia periodica de base e imagenes. Es clave porque ya se estan cargando imagenes editadas manualmente.

3. Auditoria de flujo de pedidos

Seguir puliendo permisos por estado para que el administrador vea solo acciones logicas segun el estado: disponibilidad, pago, despacho, documentos y cierre.

4. Validaciones comerciales

Completar validaciones finas de CUIT, telefono, provincia, localidad, codigo postal y condicion IVA.

5. Mercado Pago

Dejado para etapa posterior. La arquitectura permite agregarlo.

6. Escalabilidad futura

SQLite sirve para esta etapa, pero para crecimiento multiusuario fuerte conviene migrar a PostgreSQL.

## Estado recomendado para seguir

Prioridad 1: confirmar persistencia y backups.

Prioridad 2: terminar "Mis compras" y flujo cliente mobile con pruebas reales desde telefono.

Prioridad 3: terminar validaciones del registro comercial.

Prioridad 4: seguir carga de imagenes de producto.

Prioridad 5: panel de informes/dashboard comercial por fecha, cliente, vendedor y articulo.

Prioridad 6: integracion Mercado Pago.

