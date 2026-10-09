# Actualización del 9 de octubre de 2026

Tres bloques: inventario por unidades, flujos sin trabas y clientes con saldo a favor.

## 1. Inventario por unidades

Cambios pedidos por la propietaria después del primer día de uso.

## Qué cambia

| Antes | Ahora |
|---|---|
| 10 bolos, stock separado por sabor | 3 bolos (agua, leche, fruta), un stock por tipo |
| 18 escarchas que descuentan ml de una mezcla por sabor | 3 escarchas (250, 300 y 500 ml) que descuentan 1 vaso |
| 11 preparados «pendientes de receta» que no se podían vender ni reponer | Sandwiches con stock por unidad; hamburguesa, cafés y batidos solo registran la venta |
| Reposición de cualquier cantidad | Los vasos se reponen por paquete completo (100 o 50) |
| El cajero podía registrar mermas | Solo la propietaria da de baja |

El cobro en efectivo ya venía con el monto exacto cargado: el cajero elige **Efectivo** o **QR** y confirma.

## 2. Flujos sin trabas

- Si el cajero se va sin contar, la propietaria cuenta en su lugar (motivo obligatorio) y aprueba.
- La propietaria puede vender en el turno abierto del cajero, crear insumos con el turno abierto y restablecer contraseñas sin cerrar el turno.
- Todos pueden cambiar su propia contraseña en **Más**.

## 3. Clientes con saldo a favor

Vuelto guardado, recargas, pago con saldo, devoluciones y ajustes (solo la propietaria), con historial por cliente y efectivo del arqueo cuadrado. Detalle en el README, sección «Clientes con saldo a favor».

## Cómo aplicarlo en producción (Supabase)

1. **La propietaria aprueba el arqueo del turno abierto.** La actualización no cambia nada mientras hay un turno abierto.
2. **Respaldo:** `npm run backup`.
3. **Migraciones** en Supabase → SQL Editor, con el usuario dueño de la base, en este orden:
   - `supabase/migrations/202610090001_units_and_packages.sql` (columna `pack_size`, esquema 2);
   - `supabase/migrations/202610090002_customer_credit.sql` (clientes y saldo a favor, esquema 3).
4. **Desplegar el código nuevo inmediatamente después.** El código anterior exige el esquema 1 y el nuevo exige el 3, así que entre los pasos 3 y 4 el servidor no inicia.
5. Al iniciar, el servidor aplica el menú v2 una sola vez:
   - el stock cargado en bolos por sabor pasa al bolo de su tipo (grosella → agua, copoazú → fruta, chocolate → leche), con movimientos «Traspaso al nuevo menú»;
   - se archivan las variantes por sabor y las mezclas en ml (las ventas pasadas no cambian);
   - quedan creados los vasos y el stock de sandwiches en cero.
6. Revisar en **Más → Inventario** y cargar con **Reponer** los sandwiches y vasos que hay físicamente. Después el cajero abre su turno.

Si el servidor ya estaba en marcha con un turno abierto, el menú se aplica en el momento en que se aprueba ese arqueo.

## Pendiente de confirmar con la propietaria

- Confirmar que «acreedores» era el saldo a favor. Las ventas fiadas (el cliente debe al negocio) no están incluidas.
- Crear su usuario de propietaria (correo) para que deje de usarse la cuenta del ingeniero.
