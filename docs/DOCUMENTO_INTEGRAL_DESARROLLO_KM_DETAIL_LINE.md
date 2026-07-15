# Documento integral de desarrollo

## Plataforma comercial KM Detail Line

**Proyecto:** KM Detail Line  
**Dominio:** https://www.km-detail.com  
**Fecha:** 14 de julio de 2026  
**Estado:** Plataforma operativa en producción, en etapa de consolidación funcional, gráfica y comercial.  
**Repositorio:** `km-detail-shop`  
**Backend:** Node.js sobre Railway  
**Base de datos:** SQLite persistida en volumen Railway  
**Canal principal:** Web / PWA mobile-first  

---

## 1. Resumen ejecutivo

La plataforma KM Detail Line evolucionó desde una página web comercial hacia un sistema integral de comercialización B2B. Actualmente combina sitio institucional, catálogo técnico, tienda privada para clientes aprobados, panel administrativo, portal de vendedores, gestión de pedidos, cuenta corriente, logística, documentos operativos, notificaciones, analítica interna, SEO, backups y base para integración con medios de pago.

El objetivo central de la plataforma es permitir que KM administre su comercialización desde un sistema propio, dejando el sistema fiscal externo solamente para emitir comprobantes legales cuando corresponda.

La solución no fue pensada como una tienda minorista. Fue diseñada para un canal profesional compuesto por distribuidores, pinturerías, comercios especializados, vendedores y clientes aprobados por KM.

La definición comercial consolidada de KM dentro de la plataforma es:

> KM Detail Line fabrica consumibles técnicos para procesos profesionales de terminación automotriz. La línea fue desarrollada como un sistema modular de trabajo, donde cada pieza de la línea cumple una función específica y puede combinarse con otras para adaptar el proceso al tipo de superficie, nivel de corrección requerido, herramienta utilizada y resultado buscado. La comercialización se realiza a través de distribuidores especializados, capaces de brindar asesoramiento técnico para que cada profesional adopte correctamente la línea y obtenga resultados consistentes en su trabajo.

Esta definición ordena el mensaje principal: KM es fabricante, tiene más de 100 productos, los productos forman un sistema de trabajo, el uso es profesional y la comercialización se realiza mediante canal especializado.

---

## 2. Principios rectores del desarrollo

### 2.1 Plataforma B2B, no ecommerce minorista

La plataforma se orientó desde el inicio a operaciones comerciales B2B. Por eso:

- los precios no se muestran al público general;
- el cliente debe tener cuenta comercial aprobada;
- los precios son personalizados por cliente;
- se muestran precios netos en pesos argentinos;
- el IVA se discrimina;
- las condiciones de pago pueden variar por cliente;
- KM puede confirmar disponibilidad antes del pago;
- el pedido no descuenta stock porque el stock real se administra en el sistema de facturación/gestión de la empresa;
- el pedido reserva precio, no stock.

### 2.2 Mobile-first real

El sistema fue diseñado y corregido continuamente pensando primero en teléfono. Esta decisión afectó todos los módulos:

- navegación por tarjetas;
- eliminación de desplazamiento lateral;
- botones grandes y diferenciados;
- acciones por estado;
- vistas compactas;
- menú móvil;
- foco en una sección por vez en la app de cliente;
- formularios simplificados;
- galerías de producto con miniaturas;
- documentos generados desde teléfono;
- panel de vendedores operativo desde celular;
- normalización progresiva del panel administrativo.

### 2.3 Separación entre presentación y operación

El sitio cumple un doble propósito:

1. Presentación institucional y técnica de KM.
2. Plataforma operativa para pedidos, cuentas, vendedores y administración.

Para evitar confusión, se fue separando el contenido público del contenido operativo:

- usuario anónimo: ve presentación, catálogo, productos sin precio, distribuidores, contacto y solicitud de cuenta;
- cliente aprobado: ve principalmente productos, carrito, lista de precios, direcciones de entrega y mis compras;
- vendedor: usa portal específico de gestión de ventas;
- administrador KM: usa panel administrativo interno.

### 2.4 Acciones guiadas por estado

En pedidos y operaciones se corrigió el criterio inicial de mostrar demasiadas acciones simultáneas. La lógica actual prioriza mostrar la próxima acción válida según el estado del pedido:

- pedido recibido;
- confirmar disponibilidad;
- definir forma de pago;
- esperar pago o cuenta corriente;
- preparar pedido;
- marcar preparado para despacho;
- cargar despacho;
- esperar recepción del cliente;
- operación cerrada.

Esto reduce errores y confusión.

---

## 3. Arquitectura tecnológica general

### 3.1 Stack principal

La plataforma utiliza una arquitectura web liviana, directa y controlable:

- **Node.js** como runtime backend.
- **Servidor HTTP propio** con servicios modulares.
- **SQLite** como base de datos inicial.
- **Railway** como hosting de aplicación y volumen persistente.
- **HTML, CSS y JavaScript vanilla** para frontend.
- **Service Worker + Web Manifest** para comportamiento PWA.
- **Resend** para emails transaccionales.
- **Mercado Pago Checkout Pro** para pagos online.
- **Web Push** para notificaciones en teléfono.
- **GitHub** como repositorio y despliegue.
- **GoDaddy** para dominio.
- **Zoho Mail** para correo corporativo.

### 3.2 Decisión de no usar framework pesado

Se optó por una implementación liviana sin React/Vue/Angular. Esto permitió:

- carga rápida;
- control directo sobre HTML/CSS/JS;
- menor complejidad de build;
- despliegue simple en Railway;
- edición rápida durante iteraciones;
- menor dependencia de paquetes externos;
- mantenimiento más transparente para una plataforma comercial propia.

La contracara es que el orden del frontend debe cuidarse manualmente. Por eso se fueron separando módulos y normalizando patrones de UI.

### 3.3 Estructura principal de archivos

```text
km-detail-shop/
  index.html
  app.js
  styles.css
  admin.html
  admin.js
  admin.css
  vendedor.html
  vendedor.js
  vendedor.css
  reset.html
  reset.js
  labels.html / labels.js / labels.css
  picking.html / picking.js / picking.css
  delivery-note.html / delivery-note.js / delivery-note.css
  commission-settlement.html / commission-settlement.js / commission-settlement.css
  manifest.webmanifest
  service-worker.js
  robots.txt
  sitemap.xml
  server/
    app.js
    index.js
    http.js
    db.js
    config.js
    security.js
    rate-limit.js
    seo-pages.js
    domain/
      pricing.js
      validation.js
    services/
      auth-service.js
      customer-service.js
      product-service.js
      order-service.js
      sales-rep-service.js
      sales-quote-service.js
      email-service.js
      push-service.js
      mercadopago-service.js
      analytics-service.js
      payment-account-service.js
      shipping-address-service.js
      distributor-service.js
      price-list-service.js
      price-update-service.js
      storage-status-service.js
      security-event-service.js
      settings-service.js
      admin-report-service.js
    scripts/
      import-catalog.js
      backup-data.js
      check-database.js
      check-email.js
      send-test-email.js
  assets/
    catalogo-km-detail-2026.pdf
    catalogo-km-detail-cover.png
    km-metal-logo.png
    km-hero-detailing.png
    km-empresa.png
    km-contacto.png
    km-distribuidores.png
  uploads/
  backups/
  docs/
```

---

## 4. Modelo de datos

La base SQLite contiene tablas para usuarios, clientes, productos, imágenes, pedidos, vendedores, comisiones, emails, push, analytics, seguridad, direcciones, cuentas de pago, distribuidores y actualizaciones de precios.

### 4.1 Tablas principales

El esquema incluye, entre otras:

- `users`: usuarios de clientes y administradores.
- `customers`: cuentas comerciales.
- `customer_discounts`: descuentos globales por cliente.
- `customer_product_discounts`: descuentos adicionales por producto y cliente.
- `customer_shipping_addresses`: direcciones de recepción por cliente.
- `sales_reps`: vendedores.
- `sales_rep_sessions`: sesiones de vendedores.
- `sales_rep_password_reset_tokens`: recuperación de clave de vendedores.
- `sales_commission_settlements`: liquidaciones de comisión.
- `sales_commission_settlement_items`: pedidos incluidos en liquidaciones.
- `product_families`: familias comerciales.
- `products`: catálogo de productos.
- `product_images`: galería de imágenes por producto.
- `price_update_batches`: tandas de actualización de precios.
- `price_update_items`: precios programados por producto.
- `official_distributors`: distribuidores oficiales publicados.
- `settings`: configuración comercial general.
- `bank_settings`: configuración bancaria histórica.
- `payment_accounts`: cuentas de cobro.
- `customer_payment_accounts`: asignación de cuentas de cobro a clientes.
- `orders`: pedidos.
- `order_items`: productos de cada pedido.
- `sales_quotes`: presupuestos de vendedores.
- `sales_quote_items`: productos presupuestados.
- `order_events`: historial operativo de pedidos.
- `payment_receipts`: comprobantes de pago.
- `email_outbox`: bandeja de emails transaccionales.
- `push_subscriptions`: dispositivos autorizados para notificaciones.
- `push_outbox`: cola de notificaciones push.
- `sessions`: sesiones web de clientes/admin.
- `password_reset_tokens`: recuperación de contraseña de clientes.
- `security_events`: eventos de seguridad.
- `analytics_events`: actividad de navegación y uso.

### 4.2 Criterio de persistencia

La plataforma se ejecuta en Railway y depende de un volumen persistente para:

- base SQLite;
- imágenes de productos;
- comprobantes de pago;
- backups;
- documentos generados o archivos operativos.

El volumen fue ampliado porque la carga de imágenes reales de producto llevó el disco original al límite. Actualmente la persistencia es un componente crítico de operación.

---

## 5. Arquitectura backend

### 5.1 Capa de servidor

El backend concentra:

- enrutamiento HTTP;
- autenticación;
- autorización por rol;
- validación;
- servicios de negocio;
- persistencia SQLite;
- archivos subidos;
- generación de documentos;
- notificaciones;
- integraciones externas;
- dashboards administrativos.

### 5.2 Capa de dominio

Los módulos `server/domain` concentran reglas reutilizables:

- cálculo de precios;
- aplicación de descuentos;
- cálculo de IVA;
- formateo ARS;
- validación de campos;
- errores controlados.

El archivo `pricing.js` define reglas como:

- precios en centavos;
- descuentos en puntos básicos;
- descuentos en cascada;
- cálculo por línea;
- totales de pedido;
- IVA configurable.

### 5.3 Servicios de negocio

La carpeta `server/services` contiene la lógica de cada módulo:

- `auth-service.js`: registro, login, sesiones, recuperación de contraseña.
- `customer-service.js`: clientes, descuentos, condiciones, clasificación B/N.
- `product-service.js`: catálogo, productos, imágenes, familias, promociones, slugs SEO.
- `order-service.js`: pedidos, disponibilidad, pagos, cuenta corriente, despacho, documentos.
- `sales-rep-service.js`: vendedores, portal, comisiones, liquidaciones.
- `sales-quote-service.js`: presupuestos de vendedores.
- `email-service.js`: emails transaccionales.
- `push-service.js`: notificaciones push.
- `mercadopago-service.js`: preferencias y webhooks de Mercado Pago.
- `analytics-service.js`: actividad y visitas.
- `payment-account-service.js`: cuentas de cobro.
- `shipping-address-service.js`: direcciones de recepción.
- `distributor-service.js`: distribuidores oficiales.
- `price-list-service.js`: Excel de lista de precios personalizada.
- `price-update-service.js`: actualización programada de precios.
- `storage-status-service.js`: estado de almacenamiento y backups.
- `security-event-service.js`: auditoría de seguridad.
- `settings-service.js`: parámetros comerciales.

---

## 6. Frontend público y cliente

### 6.1 Sitio público

El sitio público presenta:

- inicio;
- empresa;
- productos;
- catálogo 2026;
- distribuidores;
- contacto;
- solicitud de cuenta comercial;
- login;
- recuperación de contraseña.

El diseño público se fue limpiando para evitar mezcla entre presentación y operación. El visitante ve una propuesta clara:

- KM fabrica consumibles técnicos;
- los productos son para uso profesional;
- se comercializa por distribuidores especializados;
- la cuenta comercial se solicita para operar.

### 6.2 Cliente aprobado

Cuando el cliente inicia sesión y está aprobado, la experiencia cambia:

- se prioriza productos y pedidos;
- se ocultan secciones institucionales innecesarias;
- se habilitan precios personalizados;
- se habilita carrito;
- se habilita lista de precios personalizada;
- se habilitan direcciones de entrega;
- se habilita mis compras;
- se habilita carga de comprobantes;
- se habilitan pagos por Mercado Pago si corresponde.

### 6.3 Modelo app

Se abandonó progresivamente la página tipo sábana para pasar a una experiencia tipo app:

- si el usuario entra a productos, ve productos;
- si entra a mis compras, ve mis compras;
- si entra a catálogo, ve catálogo;
- si entra a lista de precios, ve esa función;
- las acciones concretas ya no quedan mezcladas con otras secciones.

Esto fue clave para mejorar la experiencia en teléfono.

---

## 7. Diseño gráfico y sistema visual

### 7.1 Identidad visual

La estética final apunta a:

- entorno oscuro premium;
- sensación técnica e industrial;
- contraste alto;
- logo metálico KM;
- uso controlado del amarillo;
- grises neutros;
- acentos verdes para acciones positivas;
- acentos violetas/azulados para acciones administrativas o principales;
- bordes finos;
- tarjetas limpias;
- imágenes de producto protagonistas.

### 7.2 Corrección de paleta

Al inicio había demasiado amarillo. Se redujo su uso porque visualmente pesaba demasiado. El amarillo quedó como acento de:

- alertas;
- promociones;
- detalles gráficos;
- algunas líneas de marca.

Los botones se normalizaron:

- verde: actualizar, confirmar, acción positiva;
- violeta/azulado: crear, nuevo, acciones principales administrativas;
- gris claro: acciones secundarias;
- rojo: eliminar, rechazar, peligro;
- azul/celeste: estados de logística o despacho;
- verde oscuro: estados completados.

### 7.3 Tipografía

Se buscó una fuente fuerte, técnica y legible. Con el tiempo se detectó que algunos títulos eran demasiado grandes, especialmente en módulos de gestión. Se corrigió parcialmente en:

- portal vendedor;
- clientes;
- vendedores;
- productos;
- pedidos;
- emails;
- seguridad;
- actividad.

Todavía queda como criterio general mantener:

- títulos más compactos en paneles operativos;
- textos grandes solo para portadas o secciones públicas;
- botones legibles, pero no grotescos;
- evitar que texto y tarjetas se salgan del ancho del teléfono.

### 7.4 Tarjetas y mobile

El formato final más exitoso se logró en:

- portal vendedor;
- mis compras;
- clientes;
- productos admin;
- distribuidores admin;
- pedidos admin normalizados por estado.

La regla definida es:

- no usar tablas anchas en teléfono;
- convertir listados en tarjetas;
- mostrar solo la información clave;
- abrir detalle cuando sea necesario;
- evitar desplazamiento horizontal;
- mantener botones grandes y claros.

---

## 8. Catálogo y productos

### 8.1 Fuente de datos

El catálogo inicial se importó desde Excel y PDF. El sistema tomó:

- código KM;
- EAN;
- nombre;
- familia;
- subfamilia;
- medida;
- corte;
- sistema;
- precio;
- datos técnicos.

El catálogo operativo actual contiene más de 100 productos.

### 8.2 Familias

Los productos se organizan por familias. Cada familia puede tener descripción administrable:

- Pads 7,5 IN;
- Pad lana con backing;
- Pad poliespuma con backing;
- Pad poliespuma con velcro;
- Pad lana con velcro;
- Pad lana prelavada;
- Pads roto-orbitales;
- Backing;
- Backing flex;
- Aplicadores;
- Interfaces;
- Tacos.

Se implementó navegación por familia desde el lateral y se corrigió el desplazamiento para que al seleccionar una familia vaya al inicio correcto de la familia, sin saltos aleatorios hacia otras secciones.

### 8.3 Producto como ficha técnica

Cada producto puede contener:

- código KM;
- EAN;
- nombre;
- familia;
- subfamilia;
- medida;
- corte;
- sistema;
- material;
- ubicación de depósito;
- precio de lista;
- estado activo/inactivo;
- imágenes;
- promoción vigente;
- descuentos por cliente;
- slug SEO;
- ficha pública.

### 8.4 Imágenes

Se implementó galería tipo Mercado Libre:

- múltiples imágenes por producto;
- imagen principal;
- miniaturas;
- selección de imagen;
- zoom;
- formato visual 16:9;
- marco limpio;
- corrección de bandas blancas;
- tarjetas sin solapamiento;
- galería administrable desde admin.

El usuario está cargando imágenes editadas manualmente con fondo, calidad y formato uniforme. Esto elevó mucho la calidad visual del catálogo.

### 8.5 Promociones

Se implementaron promociones por producto:

- descuento promocional;
- vigencia desde/hasta;
- visible solo para clientes registrados/aprobados;
- badge destacado;
- producto resaltado visualmente;
- descuento aplicado al cálculo de precio;
- oculto para visitantes anónimos.

Se corrigió el diseño del badge para que no se confunda con indicadores técnicos del producto.

---

## 9. Precios, descuentos e IVA

### 9.1 Moneda y criterio impositivo

La moneda de operación es pesos argentinos.

Los precios:

- son precios de lista netos;
- no incluyen IVA;
- muestran IVA cuando corresponde;
- usan IVA configurable, actualmente 21%;
- aplican descuentos personalizados;
- se calculan en centavos para evitar errores de precisión.

### 9.2 Descuentos globales

Cada cliente puede tener descuentos globales. Se aplican en cascada sobre el precio de lista.

Ejemplo conceptual:

```text
Precio lista
- descuento 1
- descuento 2 sobre resultado anterior
= precio final neto
```

En la interfaz del cliente se simplificó el texto para evitar confusión: se habla de descuentos activos sobre precio de lista, sin explicar "cascada" en cada producto.

### 9.3 Descuentos específicos por producto

Se agregó la posibilidad de asignar descuentos adicionales por producto a un cliente específico. Esto permite condiciones especiales sin afectar la lista general ni otros clientes.

### 9.4 Clasificación B/N

Se incorporó clasificación interna por cliente:

- `B`
- `N`

La letra aparece visible en pedidos y clientes, sin texto explicativo hacia el cliente. Es una señal interna de KM.

La clasificación se usa también para el tratamiento de importes en Mercado Pago y compensaciones:

- clientes `B`: se considera total con IVA;
- clientes `N`: se considera monto neto sin IVA cuando corresponde.

### 9.5 Ajuste comercial interno

Se incorporó un ajuste comercial interno para compensar diferencias sin comunicarlas al cliente por email. Este ajuste evita que queden saldos artificiales cuando KM decide cerrar comercialmente una operación con un criterio interno.

---

## 10. Actualización de precios

Se implementó un módulo específico para actualizar precios fuera de la pantalla de productos, para no saturar la gestión del catálogo.

### 10.1 Dos métodos

1. **Actualización individual programada**
   - lista completa de productos;
   - código KM;
   - precio actual;
   - nuevo precio;
   - fecha de implementación;
   - dashboard de progreso;
   - tarjetas que cambian visualmente cuando el precio fue modificado.

2. **Actualización lineal**
   - porcentaje general;
   - fecha de aplicación;
   - afecta a todos los productos activos;
   - útil para aumentos generales de lista.

### 10.2 Objetivo operativo

El objetivo es evitar olvidos cuando hay que actualizar 104 productos desde teléfono o PC.

El sistema informa:

- cantidad de artículos;
- cuántos fueron modificados;
- variación positiva o negativa;
- fecha de aplicación;
- estado de la tanda.

---

## 11. Clientes

### 11.1 Alta comercial

El cliente puede solicitar una cuenta comercial desde la web. El formulario registra datos de empresa y contacto.

Se trabajó en:

- validación de email;
- validación de CUIT;
- teléfono;
- provincia;
- localidad;
- código postal;
- categoría fiscal;
- rubro;
- tipo de cliente;
- redacción de emails de bienvenida.

### 11.2 Gestión administrativa de clientes

El módulo clientes permite:

- listar clientes;
- buscar por nombre, CUIT, email o WhatsApp;
- filtrar por estado;
- crear cliente manualmente;
- aprobar;
- rechazar;
- suspender;
- editar datos del cliente;
- asignar descuentos globales;
- asignar descuentos por producto;
- asignar vendedor;
- asignar comisión;
- asignar clasificación B/N;
- asignar condición de pago;
- asignar cuentas de cobro;
- ver último pedido;
- ver ubicación;
- ver datos comerciales.

### 11.3 Reorganización del editor de cliente

Se definió que el cliente abierto debe mostrar:

1. ficha comercial;
2. datos editables del cliente;
3. estados globales;
4. descuentos globales;
5. descuentos por producto;
6. vendedor y comisión;
7. B/N;
8. condición de pago;
9. cuentas de cobro.

El objetivo fue separar datos comerciales de condiciones comerciales.

---

## 12. Direcciones de entrega

Se implementó un sistema similar a Mercado Libre:

- cada cliente puede tener más de un lugar de recepción;
- puede agregar;
- editar;
- eliminar;
- marcar preferida;
- elegir dirección al confirmar pedido.

En teléfono se simplificó la pantalla para mostrar:

- lugar activo;
- botón configurar entrega;
- botones principales de pedido.

Esto resolvió el problema de que el cliente tuviera que cargar todos sus datos de envío en cada pedido.

---

## 13. Pedidos

### 13.1 Pedido del cliente

El cliente:

- navega productos;
- agrega cantidades;
- elige lugar de entrega;
- confirma pedido a KM;
- recibe confirmación de recepción;
- espera disponibilidad confirmada;
- paga o queda en cuenta corriente según condición;
- carga comprobante si corresponde;
- ve estados en Mis compras;
- confirma recepción al final.

### 13.2 Reserva de precio

El pedido reserva precio al momento de generarse. No reserva stock. Esta decisión responde al modelo real de KM: stock y facturación se llevan en otro sistema.

### 13.3 Confirmación de disponibilidad

KM puede confirmar:

- disponibilidad total;
- disponibilidad parcial;
- disponibilidad cero de algún artículo;
- notas por artículo;
- nota general.

La aceptación del cliente solo se requiere si las cantidades confirmadas son distintas a las solicitadas. Si todo coincide, el cliente no debe aceptar nada adicional y puede avanzar al pago o cuenta corriente.

### 13.4 Estados

Se consolidaron estados internos separados:

- estado comercial;
- estado de pago;
- estado logístico.

El cliente no ve todos esos estados técnicos. En Mis compras se muestra un estado simplificado y entendible.

### 13.5 Estados desde la mirada del cliente

Se corrigieron textos para que el cliente entienda quién hace qué:

- KM recibió el pedido.
- KM confirmó disponibilidad.
- Pago registrado / pendiente / cuenta corriente.
- KM despachó el pedido.
- Confirmar recepción del pedido.
- Compra finalizada.

Se eliminó la duplicación de estados en el detalle de Mis compras porque confundía.

### 13.6 Estados desde la mirada de KM

En administración se usa una lógica de próxima acción:

- imprimir preparación;
- confirmar disponibilidad;
- revisar pago;
- preparar pedido;
- marcar preparado para despacho;
- cargar despacho;
- seguimiento;
- operación cerrada.

---

## 14. Carrito y experiencia de compra

El carrito fue simplificado para teléfono:

- título más compacto;
- botones claros;
- flujo en etapas;
- "Elegir lugar de envío";
- "Volver a compras";
- "Confirmar pedido a KM";
- "Copiar resumen";
- pantalla enfocada solo en la acción activa.

Se corrigió que quedaran estados anteriores activos después de confirmar un pedido.

---

## 15. Mis compras

### 15.1 Historial del cliente

El cliente puede ver:

- compras activas;
- compras para pagar;
- compras en despacho;
- historial;
- detalle cuando lo necesita.

### 15.2 Correcciones de UX

Se compactó el listado porque muchas compras desplegadas hacían la página ilegible.

Se eliminaron:

- importes en la tarjeta general;
- productos en la tarjeta general;
- líneas de estado duplicadas;
- exceso de detalle.

La información completa queda dentro de "Ver detalle".

### 15.3 Cierre del circuito

El cliente puede confirmar recepción del pedido. Esto cierra la compra desde el lado del cliente.

En administración se registra como operación cerrada/recibido por cliente.

---

## 16. Pagos

### 16.1 Transferencia bancaria

El cliente puede:

- ver datos de cuenta asignados;
- cargar comprobante;
- subir PDF/JPG/PNG;
- esperar revisión de KM.

KM puede:

- ver comprobante;
- aceptar;
- rechazar;
- registrar pago;
- continuar preparación.

### 16.2 Cuentas de cobro

Se implementaron múltiples cuentas de cobro:

- banco;
- alias;
- CBU/CVU;
- titular;
- estado activa/inactiva;
- asignación por cliente.

Esto permite que diferentes clientes vean diferentes cuentas para transferencia.

### 16.3 Mercado Pago

Se integró Mercado Pago Checkout Pro.

El sistema:

- crea preferencia de pago;
- abre Mercado Pago desde el pedido;
- recibe webhook;
- registra pago aprobado automáticamente;
- actualiza estado de pago;
- evita registro manual duplicado de Mercado Pago.

### 16.4 Cuenta corriente

Se implementó cuenta corriente para clientes con pago a plazo.

Características:

- condición por cliente;
- días de vencimiento;
- vencimiento calculado;
- saldo abierto;
- pagos parciales;
- múltiples formas de cobro;
- historial de pagos;
- notificaciones de vencimiento;
- compensación B/N cuando corresponde.

### 16.5 Formas de cobro manual

En cuenta corriente se definieron:

- transferencia;
- efectivo;
- cheque físico;
- eCheq.

Mercado Pago queda reservado para registro automático por integración, no como forma manual.

---

## 17. Notificaciones de vencimiento

Se implementó lógica para cuenta corriente:

- notificación el día de vencimiento;
- luego a las 72 horas;
- luego a las 48 horas;
- luego cada 24 horas mientras permanezca vencido.

Canales contemplados:

- email;
- notificación push;
- WhatsApp manual mediante texto sugerido.

Los mensajes se definieron para ser claros y no agresivos, evitando saturar al cliente.

---

## 18. Web Push / PWA

### 18.1 Permiso del cliente

El cliente puede autorizar notificaciones en el teléfono. No se especifica una categoría particular al pedir permiso; se habilita el canal general para avisos operativos.

### 18.2 Tecnología

Se usa:

- `manifest.webmanifest`;
- `service-worker.js`;
- `web-push`;
- claves VAPID;
- `push_subscriptions`;
- `push_outbox`.

### 18.3 Uso actual

Se usa principalmente para:

- vencimientos;
- avisos importantes de cuenta corriente;
- eventualmente otros eventos operativos.

---

## 19. Logística

### 19.1 Preparación de pedido

Se genera hoja de preparación con:

- pedido;
- cliente;
- entrega;
- producto;
- código;
- EAN;
- cantidad;
- ubicación de depósito;
- control.

La ubicación por producto se agregó para facilitar picking.

### 19.2 Etiquetas de envío

Se implementaron etiquetas A4:

- una etiqueta por bulto;
- "Bulto 1 de 4";
- código de barras;
- datos de pedido;
- datos de destino;
- formato profesional;
- sin detalle de productos para evitar información innecesaria en el exterior.

### 19.3 Detalle para caja

Se implementó documento comercial no fiscal:

- detalle de pedido;
- productos;
- cantidades;
- precios;
- totales;
- datos de KM;
- datos del cliente;
- leyenda "Documento no válido como factura";
- código de barras;
- campos preparado por / controlado por / recibido por.

Este documento se coloca dentro de la caja como referencia, no reemplaza factura fiscal.

---

## 20. Vendedores

### 20.1 Portal vendedor

Se creó `vendedor.html` como herramienta separada del panel administrativo.

El vendedor puede:

- iniciar sesión;
- recuperar contraseña;
- cambiar contraseña;
- ver clientes asignados;
- crear presupuestos;
- enviar presupuestos por email;
- enviar presupuestos por WhatsApp;
- convertir presupuesto en pedido;
- crear pedido para cliente asignado;
- ver estado de pedidos;
- ver comisiones;
- ver resumen por fechas;
- solicitar alta comercial de cliente a KM.

### 20.2 Criterio de permisos

El vendedor no administra clientes. Puede solicitar altas o modificaciones, pero KM decide.

El vendedor solo opera sobre clientes asignados y aprobados.

### 20.3 Pedidos generados por vendedor

Cuando un pedido es generado por vendedor, el sistema lo identifica. En administración se puede saber si el pedido fue generado por:

- cliente;
- KM;
- vendedor.

Esto permite trazabilidad comercial.

### 20.4 Presupuestos

El vendedor puede generar presupuesto:

- seleccionando cliente asignado;
- buscando productos;
- agregando cantidades;
- enviando por email;
- enviando por WhatsApp;
- convirtiendo a pedido.

Cuando el presupuesto se convierte a pedido, se ocultan acciones que ya no corresponden.

### 20.5 UX del vendedor

El portal vendedor fue tomado como referencia de diseño porque quedó:

- legible;
- operativo en teléfono;
- ordenado por tarjetas;
- con filtros útiles;
- sin exceso de tablas;
- con botones claros;
- con formularios colapsables.

Este diseño luego se empezó a trasladar al panel administrativo.

---

## 21. Comisiones

### 21.1 Comisión por vendedor

Cada vendedor puede tener:

- comisión general;
- clientes asignados;
- comisión por cliente;
- datos bancarios;
- historial de liquidaciones.

### 21.2 Liquidación

Las comisiones se liquidan sobre pedidos cobrados. Se separó la administración de vendedores de la administración de comisiones para evitar mezclar información.

El sistema permite:

- ver comisiones pendientes;
- seleccionar pedidos;
- generar liquidación;
- consultar historial;
- emitir documento de liquidación.

### 21.3 Estados en español

Se corrigieron estados internos como `commission_settled` para que el usuario vea textos en español.

---

## 22. Panel administrativo

### 22.1 Módulos

El panel administrativo contiene:

- Clientes;
- Vendedores;
- Distribuidores;
- Productos;
- Pedidos;
- Cta. corriente;
- Configuración;
- Emails;
- Seguridad;
- Actividad;
- Operación.

### 22.2 Normalización mobile

Se está normalizando cada pantalla para teléfono:

- menú superior sin desplazamiento lateral;
- navegación por tarjetas;
- botones con colores consistentes;
- sin tablas anchas;
- información segmentada;
- formularios colapsables;
- acciones por estado.

Pantallas ya muy avanzadas:

- Clientes;
- Vendedores;
- Comisiones;
- Productos;
- Distribuidores;
- Configuración;
- Emails;
- Seguridad;
- Actividad;
- Pedidos;
- Cuenta corriente.

### 22.3 Criterio de botones

Se definió un lenguaje visual común:

- verde: actualizar / confirmar / acción positiva;
- violeta: nuevo / crear / acción principal administrativa;
- gris: acción secundaria;
- rojo: eliminar / rechazar;
- azul/celeste: logística, despacho, información;
- badges por estado.

---

## 23. Emails transaccionales

### 23.1 Proveedor

Se configuró Resend con dominio `send.km-detail.com`, DKIM/SPF/MX de envío y buena entregabilidad.

### 23.2 Diseño de emails

Los emails se rediseñaron para no verse como texto plano confuso. Ahora tienen:

- encabezado KM Detail Line;
- subtítulo "Canal comercial";
- tarjeta oscura;
- título claro;
- bloques de resumen;
- tablas legibles;
- datos destacados;
- botón de acceso;
- pie consistente.

### 23.3 Emails principales

Se generan emails para:

- solicitud recibida;
- aprobación de cuenta;
- recuperación de contraseña;
- pedido recibido;
- disponibilidad confirmada;
- pago acreditado;
- comprobante observado;
- despacho;
- saldo vencido;
- presupuesto enviado;
- recuperación de clave de vendedor.

Se eliminaron emails innecesarios al vendedor porque el vendedor ya opera desde su portal.

### 23.4 Bandeja de emails

El admin tiene módulo de emails:

- total;
- pendientes;
- enviados;
- con error;
- búsqueda;
- reintentar pendientes;
- actualización.

La vista fue normalizada para que no sea una sábana ilegible.

---

## 24. WhatsApp

WhatsApp se mantiene como canal manual principal de conversación comercial.

Se decidió no automatizar WhatsApp con API en esta etapa porque:

- agrega costo;
- requiere aprobación;
- puede complejizar;
- el volumen inicial no lo justifica.

El sistema genera textos listos para copiar o abrir en WhatsApp, con:

- pedido;
- cliente;
- totales;
- subtotal neto;
- IVA;
- total con IVA;
- estado;
- instrucciones.

---

## 25. SEO

### 25.1 Elementos implementados

Se trabajó en:

- `robots.txt`;
- `sitemap.xml`;
- Google Search Console;
- envío de sitemap;
- URLs amigables;
- páginas SEO por producto;
- páginas SEO por familias;
- metadatos;
- Open Graph;
- favicon;
- títulos;
- descripciones;
- contenido indexable.

### 25.2 Páginas SEO

Se prepararon URLs como:

- `/productos`;
- `/catalogo-2026`;
- `/distribuidores`;
- `/contacto`;
- `/panos-para-pulir-autos`;
- `/gorros-de-lana-para-pulidora`;
- `/pads-de-espuma-para-pulido`;
- `/backings-para-pulidora`;
- `/tacos-de-lijado-automotriz`;
- `/insumos-para-chapa-y-pintura`;
- `/productos-para-detailing-profesional`;
- `/producto/...`.

### 25.3 Situación SEO

La página está técnicamente preparada, pero el posicionamiento orgánico requiere tiempo, señales externas, contenido, visitas y autoridad. El hecho de que el dueño vea la página en Google no garantiza que terceros la vean igual porque Google personaliza resultados por historial, ubicación y comportamiento.

### 25.4 Próximas mejoras SEO posibles

- ampliar contenido técnico por familia;
- crear guías específicas por proceso;
- mejorar fichas técnicas;
- publicar distribuidores oficiales;
- generar enlaces externos de calidad;
- agregar contenido sobre fabricante argentino;
- crear páginas para búsquedas concretas;
- mejorar textos alternativos de imágenes;
- medir consultas reales desde Search Console.

---

## 26. Analítica interna

Se creó un módulo propio para no operar a ciegas.

Mide:

- sesiones;
- visitantes anónimos;
- clientes activos;
- aperturas de acceso;
- solicitudes;
- vistas de productos;
- productos agregados;
- pedidos generados;
- origen;
- dispositivo;
- páginas visitadas;
- eventos recientes.

El objetivo no es reemplazar Google Analytics en profundidad, sino tener visibilidad operativa directa dentro del panel de KM.

---

## 27. Seguridad

### 27.1 Medidas implementadas

La plataforma incluye:

- cookies `HttpOnly`;
- cookies seguras en producción;
- sesiones aleatorias;
- hash SHA-256 para tokens;
- contraseñas con `scrypt`;
- recuperación con token de un solo uso;
- rate limit;
- roles separados;
- rutas protegidas;
- eventos de seguridad;
- separación cliente/admin/vendedor;
- validaciones de entrada;
- control de archivos subidos.

### 27.2 Auditoría

Se revisó la posibilidad de ataques por contraseña y se dejó claro que seguridad absoluta no existe, pero para el tipo de plataforma actual el nivel es sólido.

### 27.3 Panel seguridad

El panel muestra:

- eventos;
- accesos;
- errores;
- intentos;
- filtros;
- actualización.

Fue normalizado visualmente para teléfono.

---

## 28. Backups y operación

### 28.1 Backup

Se implementó script de backup:

```bash
npm run backup
```

También se agregó panel de operación con:

- estado de base;
- uploads;
- persistencia;
- último backup;
- cantidad de backups;
- tamaño de archivos;
- botón crear backup.

### 28.2 Borrar pedidos de prueba

Durante el desarrollo se agregó función para borrar pedidos de prueba, sin borrar:

- clientes;
- productos;
- imágenes;
- vendedores;
- configuración comercial.

Esto fue útil porque se hicieron muchas pruebas reales de flujo.

### 28.3 Almacenamiento Railway

El volumen llegó al límite por imágenes. Se amplió el plan y el volumen. Esto resolvió:

- error `database or disk is full`;
- caída de la app;
- imposibilidad de cargar comprobantes;
- riesgo al subir imágenes.

---

## 29. Catálogo PDF

Se implementó página de catálogo digital:

- visualización por imágenes PNG;
- navegación anterior/siguiente;
- descarga PDF;
- portada personalizada;
- botón de descarga sobre la imagen;
- diseño integrado a la estética del sitio.

Se corrigieron problemas de:

- navegadores que descargaban en lugar de previsualizar;
- páginas con proporciones distintas;
- botones duplicados;
- secciones repetitivas o confusas.

---

## 30. Lista de precios personalizada

El cliente aprobado puede descargar Excel con:

- código KM;
- EAN;
- producto;
- precio de lista + IVA;
- descuento activo;
- precio final + IVA.

Se simplificaron columnas para que sea útil y legible.

Se agregó pantalla intermedia con botón de descarga, en lugar de descargar inmediatamente desde el menú.

---

## 31. Distribuidores

### 31.1 Página pública

La página distribuidores fue simplificada para:

- solicitar cuenta comercial;
- explicar que KM evalúa incorporación a la red;
- preparar futura publicación de distribuidores oficiales.

### 31.2 Distribuidores oficiales

En administración se agregó:

- alta de distribuidor oficial;
- datos de contacto;
- ciudad/provincia;
- WhatsApp;
- web;
- estado publicado/no publicado.

Esto deja lista la función para publicar distribuidores autorizados cuando KM lo decida.

---

## 32. Mercado Pago

### 32.1 Integración actual

Se implementó integración con Checkout Pro:

- `MERCADOPAGO_ACCESS_TOKEN`;
- creación de preferencia;
- botón de pago;
- webhook;
- registro automático de pago.

### 32.2 Criterio B/N

Se ajustó el importe enviado a Mercado Pago según clasificación del cliente:

- cliente B: monto con IVA;
- cliente N: monto neto cuando corresponde.

### 32.3 Pendiente futuro

Cuando se pase de pruebas a producción, se deben cargar credenciales productivas en Railway.

---

## 33. Diseño de documentos

Se generaron documentos internos con estética propia:

- etiquetas A4;
- hoja de preparación;
- detalle para caja;
- liquidación de comisiones.

Criterios:

- no usar estética fiscal cuando no corresponde;
- dejar claro "no válido como factura";
- priorizar lectura rápida;
- usar código de barras donde aporta;
- mantener identidad KM.

---

## 34. Sistema de estados

### 34.1 Separación interna

El pedido maneja varios ejes:

- comercial;
- pago;
- logística;
- recepción cliente;
- cuenta corriente;
- comisión.

Esto es potente, pero también puede ser confuso. Por eso se simplificó la visualización según rol.

### 34.2 Cliente

El cliente ve estados simples.

### 34.3 KM

KM ve estados operativos y próxima acción.

### 34.4 Vendedor

El vendedor ve estados comerciales adaptados:

- cliente;
- KM;
- vos;
- estado del pedido;
- comisión.

---

## 35. Funcionalidad comercial avanzada

La plataforma ya permite:

- cliente con descuentos globales;
- cliente con descuentos por producto;
- promociones vigentes;
- clasificación B/N;
- condición de pago;
- cuenta corriente;
- varios medios de cobro;
- varias cuentas bancarias;
- vendedor asignado;
- comisión;
- presupuestos;
- pedidos por cliente;
- pedidos por vendedor;
- pedidos por KM;
- lista de precios personalizada;
- documentos logísticos;
- seguimiento de compra.

Esto convierte la plataforma en un sistema comercial real, no solo una web.

---

## 36. Estado actual por módulo

### 36.1 Sitio público

Estado: avanzado.  
Pendiente: seguir puliendo textos, SEO y contenido técnico.

### 36.2 Productos

Estado: funcional y visualmente fuerte.  
Pendiente: terminar carga de imágenes y mejorar fichas técnicas.

### 36.3 Clientes

Estado: avanzado.  
Pendiente: seguir unificando mobile y revisar validaciones finas.

### 36.4 Pedidos

Estado: funcional.  
Pendiente: continuar normalización visual en teléfono y simplificación por próxima acción.

### 36.5 Cuenta corriente

Estado: funcional.  
Pendiente: seguir testeando pagos parciales, vencimientos y notificaciones.

### 36.6 Vendedores

Estado: muy avanzado.  
Pendiente: ajustes gráficos menores.

### 36.7 Comisiones

Estado: funcional.  
Pendiente: probar con más vendedores y más casos reales.

### 36.8 Mercado Pago

Estado: implementado.  
Pendiente: credenciales productivas y pruebas reales controladas.

### 36.9 Emails

Estado: avanzado.  
Pendiente: monitorear entregabilidad.

### 36.10 PWA y push

Estado: funcional.  
Pendiente: verificar icono final en notificaciones y comportamiento en distintos Android.

### 36.11 Analytics

Estado: implementado.  
Pendiente: acumular datos reales.

### 36.12 Backups

Estado: implementado.  
Pendiente: definir rutina operativa.

---

## 37. Calidad y pruebas

El proyecto tiene pruebas automatizadas con `node --test`.

Cobertura existente:

- flujo API;
- importación de catálogo;
- flujo de pedidos;
- pricing;
- rate limit.

Scripts relevantes:

```bash
npm test
npm run db:check
npm run backup
npm run catalog:import
npm run email:check
npm run email:test
```

En cada corrección importante se verificó con:

- `node --check` en archivos JS;
- `git diff --check`;
- pruebas automatizadas cuando correspondía;
- prueba manual en PC;
- prueba manual en teléfono.

---

## 38. Decisiones comerciales importantes

### 38.1 No se descuenta stock

El stock real está en otro sistema. La plataforma no descuenta stock. Solo permite confirmar disponibilidad operativa.

### 38.2 Pedido reserva precio

El pedido reserva precio al momento de ser confirmado.

### 38.3 IVA configurable

Aunque hoy se usa 21%, se dejó configurable.

### 38.4 WhatsApp manual

WhatsApp se usa como canal corriente, pero no automatizado por API.

### 38.5 Vendedor sin emails operativos

El vendedor usa portal. Se evita saturación de emails.

### 38.6 Cliente no recibe excesivas notificaciones

Se decidió evitar exceso de comunicación. El cliente puede consultar Mis compras.

---

## 39. Puntos aprendidos durante el desarrollo

1. El teléfono obliga a simplificar.
2. Las tablas grandes destruyen la experiencia mobile.
3. Los estados técnicos no deben mostrarse tal cual al cliente.
4. El admin necesita acciones por próxima etapa.
5. Los emails deben ser visuales y ordenados.
6. Los botones deben tener color y jerarquía.
7. El catálogo visual mejora enormemente con imágenes propias.
8. La plataforma se volvió más potente que un sistema de facturación para información comercial.
9. La persistencia y backups son críticos.
10. El portal vendedor resolvió muchos flujos comerciales reales.

---

## 40. Riesgos actuales

### 40.1 Carga de imágenes

El proyecto depende de imágenes de producto. Si no se mantiene control de tamaño, puede crecer mucho el volumen.

### 40.2 SQLite

SQLite es adecuado para esta etapa, pero si aumenta mucho la concurrencia, convendrá evaluar PostgreSQL.

### 40.3 SEO

Google puede tardar en posicionar. La estructura ayuda, pero se necesita tiempo, contenido y autoridad externa.

### 40.4 Mercado Pago productivo

Debe probarse con credenciales reales en entorno controlado.

### 40.5 Normalización visual admin

Aunque avanzó mucho, todavía conviene revisar módulo por módulo en teléfono.

---

## 41. Próximas etapas recomendadas

### P1 - Terminar normalización mobile admin

- Actividad final.
- Operación.
- Cta corriente.
- Pedidos.
- Productos.
- Emails.

### P2 - Fichas técnicas de producto

Agregar:

- escala de corte;
- tipo de herramienta;
- superficie recomendada;
- proceso recomendado;
- compatibilidad;
- uso profesional;
- observaciones técnicas.

Esto prepara la base para un futuro asistente IA.

### P3 - Asistente técnico IA

Un asistente podría responder:

- qué producto usar;
- qué combinación conviene;
- diferencia entre familias;
- proceso sugerido;
- producto alternativo;
- consultas de distribuidores.

Pero primero conviene completar fichas técnicas.

### P4 - SEO de contenido

- guías técnicas;
- páginas por proceso;
- contenido para búsquedas reales;
- fichas más completas;
- enlaces desde distribuidores.

### P5 - Migración futura de base

Evaluar PostgreSQL si:

- crece el volumen;
- hay más usuarios simultáneos;
- se requiere reporting pesado;
- se necesita alta disponibilidad.

---

## 42. Mapa de roles

### Visitante

- ve sitio;
- ve productos sin precios;
- descarga catálogo;
- solicita cuenta;
- consulta distribuidores/contacto.

### Cliente pendiente

- puede iniciar sesión;
- no ve precios;
- espera aprobación.

### Cliente aprobado

- ve precios;
- compra;
- gestiona direcciones;
- ve lista de precios;
- ve Mis compras;
- paga;
- confirma recepción.

### Vendedor

- ve clientes asignados;
- genera presupuestos;
- genera pedidos;
- consulta estados;
- consulta comisiones;
- solicita altas.

### Administrador KM

- controla todo;
- aprueba clientes;
- maneja productos;
- maneja precios;
- maneja pedidos;
- maneja pagos;
- maneja logística;
- maneja vendedores;
- maneja comisiones;
- maneja distribuidores;
- ve seguridad;
- ve actividad;
- maneja configuración.

---

## 43. Flujos principales

### 43.1 Alta comercial

```text
Visitante solicita cuenta
KM recibe email interno
Cliente recibe email de recepción
KM revisa datos
KM aprueba / rechaza / suspende
Cliente recibe comunicación
Cuenta aprobada habilita precios y pedidos
```

### 43.2 Pedido cliente pago anticipado

```text
Cliente arma carrito
Selecciona entrega
Confirma pedido
KM confirma disponibilidad
Si hay cambios, cliente acepta
Cliente paga
KM revisa pago o Mercado Pago confirma
KM prepara
KM despacha
Cliente confirma recepción
Compra finalizada
```

### 43.3 Pedido cliente cuenta corriente

```text
Cliente confirma pedido
KM confirma disponibilidad
Pedido queda con saldo a fecha
KM prepara y despacha
Sistema controla vencimiento
Cliente paga parcial o total
KM registra cobros
Saldo cero cierra pago
Cliente confirma recepción
```

### 43.4 Pedido vendedor

```text
Vendedor entra al portal
Selecciona cliente asignado
Busca productos
Genera presupuesto o pedido
Si presupuesto, puede enviar por email/WhatsApp
Puede convertir presupuesto a pedido
KM recibe pedido identificado como generado por vendedor
Pedido sigue circuito normal
Comisión queda asociada
```

---

## 44. Conclusión

La plataforma KM Detail Line ya no es solamente una web. Es una herramienta comercial completa, construida alrededor del modo real en que KM vende, confirma, cobra, despacha y acompaña a sus clientes.

El desarrollo logró integrar:

- identidad institucional;
- catálogo operativo;
- precios personalizados;
- pedidos;
- pagos;
- cuenta corriente;
- logística;
- vendedores;
- comisiones;
- documentos;
- emails;
- push;
- SEO;
- analytics;
- backups;
- panel administrativo;
- app mobile-first.

La mayor fortaleza actual es que el sistema se fue diseñando desde casos reales de uso, corrigiendo pantallas, textos y flujos a medida que aparecían problemas concretos. Eso lo hace más cercano a una herramienta de trabajo real que a una demo.

El foco recomendado desde este punto es consolidar:

1. uniformidad visual total del panel administrativo;
2. fichas técnicas de producto;
3. contenido SEO;
4. pruebas reales con clientes;
5. operación formal de backups;
6. Mercado Pago productivo;
7. evolución futura hacia asistente técnico.

Con estos puntos, KM Detail Line queda posicionada para operar comercialmente desde su propia plataforma y escalar de forma ordenada.
