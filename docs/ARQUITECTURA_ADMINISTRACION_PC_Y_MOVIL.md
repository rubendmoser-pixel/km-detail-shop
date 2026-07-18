# Arquitectura de Administración para PC y operación móvil

## Objetivo

Separar la administración completa de KM Detail Line de las acciones operativas que se realizan desde un teléfono. Ambas experiencias comparten usuarios, permisos, reglas y base de datos, pero no comparten necesariamente la misma presentación ni la misma navegación.

## Principios aprobados

1. La PC se utiliza para crear, configurar, corregir, conciliar y auditar.
2. El teléfono se utiliza para consultar, cargar, confirmar y resolver acciones simples.
3. Una herramienta compleja no se reduce a tarjetas para hacerla móvil: se ofrece una vista de consulta o se marca como exclusiva de escritorio.
4. Ocultar una acción en la interfaz no reemplaza los permisos del servidor.
5. Los listados y formularios de edición no se muestran completos al mismo tiempo.
6. Cada ficha destaca una única próxima acción y evita repetir información.
7. Las pantallas actuales continúan disponibles hasta que su reemplazo esté probado.

## Áreas principales de Administración para PC

### Inicio

- Tablero general
- Alertas y próximas acciones
- Actividad reciente

### Comercial

- Clientes
- Vendedores
- Distribuidores
- Comisiones
- Productos comerciales
- Precios

### Pedidos y logística

- Pedidos activos
- Histórico de pedidos
- Preparación y despacho
- Operarios de logística
- Documentos de envío

### Finanzas

- Cuenta corriente
- Comprobantes y cobros
- Cuentas de cobro
- Liquidaciones

### Producción

- Tablero de producción
- Planificación semanal
- Partes diarios
- Recetas
- Operarios de producción

### Stock e insumos

- Resumen de inventario
- Insumos
- Intermedios
- Productos terminados
- Depósitos y ubicaciones
- Movimientos
- Stock inicial y conciliaciones

### Compras

- Proveedores
- Insumos por proveedor
- Necesidades de compra
- Historial de costos

### Sistema

- Configuración comercial
- Tipo de cambio y costos
- Emails
- Seguridad y accesos
- Analítica
- Backups y mantenimiento

## Administración operativa para teléfono

La PWA KM Admin abrirá un acceso operativo diferente de la administración completa.

- Resumen de alertas
- Pedidos que requieren acción
- Partes de producción pendientes de revisión
- Consulta rápida de stock
- Alertas de faltantes
- Comprobantes pendientes
- Búsqueda rápida de cliente, pedido, producto o insumo
- Aprobaciones y rechazos simples

No incluirá editores de recetas, maestros de costos, proveedores, stock inicial, conciliaciones ni configuración avanzada.

## Matriz inicial por dispositivo

| Función | Teléfono | PC |
| --- | --- | --- |
| Ver tablero y alertas | Completo | Completo |
| Consultar pedidos | Completo | Completo |
| Ejecutar próxima acción de un pedido | Completo | Completo |
| Ver planificación de producción | Completo | Completo |
| Crear o modificar planificación | No | Completo |
| Cargar parte diario | Completo en KM Producción | Completo |
| Revisar y confirmar parte | Resumido | Completo |
| Consultar stock | Resumido | Completo |
| Registrar movimiento operativo simple | Sí, con flujo guiado | Completo |
| Crear o editar productos | No | Completo |
| Crear o versionar recetas | No | Completo |
| Crear o editar insumos | No | Completo |
| Crear o editar proveedores | No | Completo |
| Fabricar o ingresar intermedios | Flujo guiado | Completo |
| Cargar stock inicial | No | Completo |
| Conciliar o ajustar inventario | No | Completo |
| Configurar tipo de cambio | No | Completo |
| Seguridad, backups y auditoría | No | Completo |

## Maestros del primer bloque funcional

### Producto

- Identidad absoluta por código KM y EAN.
- Puede existir comercialmente sin receta.
- No puede planificarse para fabricación sin una receta vigente.
- Estado productivo visible: sin receta, borrador o receta vigente.

### Insumo

- Código interno único.
- Nombre, categoría y estado.
- Tipo: materia prima, embalaje, servicio o intermedio.
- Unidad de compra y unidad de stock.
- Factor de conversión.
- Moneda y costo de compra.
- Proveedor principal y alternativas.
- Compra mínima y plazo habitual de entrega.
- Servicios y mano de obra afectan el costo, pero no generan stock físico.

### Proveedor

- Identidad fiscal y datos de contacto.
- Insumos provistos.
- Presentación, precio, moneda y vigencia.
- Compra mínima y plazo de entrega.
- Un proveedor principal por insumo, con alternativas permitidas.

### Receta

- Puede pertenecer a un producto terminado o a un intermedio.
- Una sola versión vigente por producto.
- Las versiones vigentes no se editan: se reemplazan por una nueva versión.
- Cada componente registra insumo, cantidad, unidad, etapa y observaciones.
- Conserva una fotografía de costos al confirmar fabricación.
- Las 104 recetas validadas se migran como versión inicial vigente.

## Flujo para dar de alta un producto fabricable

1. Administración crea el producto comercial con código KM y EAN.
2. El sistema lo marca como `Sin receta`.
3. Desde la ficha del producto se abre `Producción / Receta`.
4. Se crea una receta en borrador y se agregan insumos o intermedios.
5. El sistema valida unidades, cantidades y componentes activos.
6. Administración activa la receta.
7. El producto queda habilitado para planificación.

## Comportamiento de las pantallas exclusivas de PC

Cuando se abran desde un teléfono, la aplicación no cargará el formulario complejo. Mostrará un aviso breve y una acción para regresar al tablero operativo. Esta restricción es de experiencia de usuario; la autorización real seguirá controlada por roles y permisos en el servidor.

## Estrategia de implementación

1. Crear el nuevo armazón de Administración para PC sin retirar el actual.
2. Crear el acceso `admin-operativo` para la PWA móvil.
3. Implementar Proveedores, Insumos y Recetas como primer módulo del nuevo armazón.
4. Migrar las 104 recetas validadas a versiones editables y vigentes.
5. Incorporar stock inicial, depósitos y movimientos sobre esos maestros.
6. Migrar progresivamente el resto de las secciones administrativas.
7. Retirar una pantalla anterior únicamente después de validar su reemplazo.
