# Menú del cliente

Versión 2 (9 de octubre de 2026), ajustada con las observaciones de la propietaria tras el primer día: **todo se cuenta por unidad, sin recetas ni litros**. Importes en Bs; fuente del catálogo: `lib/menu.js`. 38 productos en seis categorías, agrupados en 33 tarjetas de venta.

| Control | Productos |
|---|---|
| Stock propio por unidad | Sandwiches, empanadas, dulces, bebidas, vasos de escarcha y bolos |
| Solo registra la venta | Hamburguesa express, cafés y batidos |
| Solo registra la venta | Helado de Açaí con precio libre en caja |

| Comida | Bs |
|---|---:|
| Sandwich mixto | 12 |
| Sandwich mixto integral | 12 |
| Empanada de queso | 6 |
| Empanada integral | 8 |
| Hamburguesa express | 15 |
| Brownie | 8 |
| Mini brownie | 3 |
| Alfajor | 6 |
| Galletas | 6 |
| Mini galletas | 3 |

| Bebidas frías | Bs |
|---|---:|
| Coca-Cola 300 ml | 5 |
| Coca-Cola 500 ml | 7 |
| Agua Vital 600 ml | 6 |
| Aquarius 300 ml | 5 |
| Del Valle 300 ml | 5 |
| Sante 500 ml | 9 |
| Sante 1 L | 14 |
| Powerade 500 ml | 9 |
| Powerade 1 L | 13 |
| Malta | 9 |
| Black | 9 |
| Rush | 13 |
| Sfrut | 7 |
| Agua con gas | 7 |

Las últimas cinco bebidas no indican volumen en la fotografía. No se ha asignado uno.

| Cafés y batidos | Bs |
|---|---:|
| Café americano | 12 |
| Café con leche | 15 |
| Café frío | 15 |
| Capuchino | 15 |
| Frapuchino | 18 |
| Latte frío | 16 |
| Batido de proteína con agua | 22 |
| Batido de proteína con leche | 25 |

| Escarcha | Existencia contada | Paquete | Bs |
|---|---|---:|---:|
| Escarcha 250 ml | Vaso de escarcha 250 ml | 100 | 5 |
| Escarcha 300 ml | Vaso de escarcha 300 ml | 100 | 7 |
| Escarcha 500 ml | Vaso de escarcha 500 ml | 50 | 10 |

Cada venta descuenta un vaso. El sabor no se registra. Los vasos se reponen solo por paquete completo.

| Bolos | Bs por unidad |
|---|---:|
| Bolo de agua | 2,50 |
| Bolo de leche | 4 |
| Bolo de fruta | 3,50 |

Un solo conteo por tipo, sin separar sabores.

## Reglas de inventario

- Reposición: el cajero durante su turno o la propietaria. Los productos con paquete solo aceptan paquetes completos.
- Merma (dar de baja): solo la propietaria.
- Nuevos productos: **Más → Productos → Nuevo producto**. La propietaria elige entre contar sus unidades o solo registrar sus ventas. No hay que crear un insumo ni una receta. El stock comienza en cero y se ingresa con **Reponer**. El control de un producto existente se cambia entre turnos.

## Paso de la versión 1 a la 2

Se aplica una sola vez, nunca con un turno abierto: al iniciar el servidor entre turnos o inmediatamente después de aprobar el arqueo del turno abierto.

- Los bolos por sabor se archivan y su stock pasa al bolo de su tipo, con movimientos «Traspaso al nuevo menú».
- Las 18 escarchas por sabor y las mezclas en ml se archivan. Ese stock no se puede convertir a vasos.
- Los productos que ya existían conservan precio, nombre y recetas editadas por la propietaria. Solo cambian los que seguían pendientes de receta.
- Las ventas, comprobantes y arqueos anteriores no cambian.

## Simplificación a productos · 17 de octubre de 2026

La operación usa únicamente productos terminados. Los ingredientes anteriores se archivan con sus cantidades e historial intactos y dejan de aparecer en la recepción y el arqueo. Los productos con un stock propio de una unidad conservan ese stock. Cafés, batidos, hamburguesa express y Açaí quedan en **Solo registrar ventas**; otros preparados con ingredientes compartidos o medidos también quedan sin conteo para no inventar cantidades de productos terminados.

La adaptación se registra en auditoría una sola vez. Si hay un turno abierto, conserva su inventario hasta aprobar su arqueo; el siguiente turno recibe el inventario simplificado. No cambia precios, ventas, saldos de clientes, cantidades ni arqueos cerrados. La propietaria puede habilitar unidades posteriormente por producto entre turnos.

## Helado de Açaí y precio libre

El Helado de Açaí usa **Precio libre en caja**, con **Solo registrar ventas**. El cajero toca el producto, escribe el importe que corresponde cobrar según el peso (por ejemplo, Bs 18,50) y lo añade al pedido. El importe es obligatorio y mayor a cero; porciones con importes distintos se conservan en líneas separadas. **Editar importe** permite corregir el valor antes de cobrar. El comprobante identifica el precio libre y al cajero que registró la venta.

La propietaria puede editarlo en **Más → Productos → Editar producto → Tipo de cobro**. El precio base anterior se conserva como referencia para volver a precio por porción, pero no se cobra automáticamente cuando está seleccionado precio libre. La actualización habilita el modo libre una sola vez; los cambios posteriores de la propietaria se conservan.

## Cobro automático por peso (opcional)

Para cobrar por peso, selecciona **Tipo de cobro → Por peso**, elige la tarifa por **100 gramos, 1 kilo o 1 gramo**, escribe su precio y guarda. El control de existencias es independiente: puede mantenerse en **Solo registrar ventas**, sin receta ni descuento de gramos de inventario.

El vendedor toca el producto, escribe el peso neto en gramos (sin el recipiente), revisa el total y lo añade al pedido. Puede añadir porciones de pesos distintos o usar **Cambiar peso** antes de cobrar. El signo `+` repite una porción del mismo peso. El comprobante conserva el peso, la tarifa y el importe de cada porción aunque se modifique el producto después. No se conecta automáticamente a una balanza: el peso se ingresa manualmente.
