# Menú del cliente

Versión 2 (9 de octubre de 2026), ajustada con las observaciones de la propietaria tras el primer día: **todo se cuenta por unidad, sin recetas ni litros**. Importes en Bs; fuente del catálogo: `lib/menu.js`. 38 productos en seis categorías, agrupados en 33 tarjetas de venta.

| Control | Productos |
|---|---|
| Stock propio por unidad | Sandwiches, empanadas, dulces, bebidas, vasos de escarcha y bolos |
| Solo registra la venta | Hamburguesa express, cafés y batidos |
| Insumos sueltos (los crea la propietaria) | Pan, jamón, huevo… Se reponen, se dan de baja y se cuentan en el arqueo; las ventas no los descuentan |

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

| Escarcha | Insumo | Paquete | Bs |
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

- Reposición: el cajero durante su turno o la propietaria. Los insumos con paquete solo aceptan paquetes completos.
- Merma (dar de baja): solo la propietaria.
- Nuevos insumos: la propietaria, entre turnos (**Más → Inventario → Nuevo insumo**), con su tamaño de paquete si corresponde.

## Paso de la versión 1 a la 2

Se aplica una sola vez, nunca con un turno abierto: al iniciar el servidor entre turnos o inmediatamente después de aprobar el arqueo del turno abierto.

- Los bolos por sabor se archivan y su stock pasa al bolo de su tipo, con movimientos «Traspaso al nuevo menú».
- Las 18 escarchas por sabor y las mezclas en ml se archivan. Ese stock no se puede convertir a vasos.
- Los productos que ya existían conservan precio, nombre y recetas editadas por la propietaria. Solo cambian los que seguían pendientes de receta.
- Las ventas, comprobantes y arqueos anteriores no cambian.
