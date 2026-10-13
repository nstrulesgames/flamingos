# Helado de Açaí y cobros por peso

El producto **Helado de Açaí** se agrega a Helados con precio inicial **Bs 1,00 por porción**, **Solo registrar ventas** y sin receta. Se incorpora una sola vez al menú vigente, sin cambiar stock, caja o ajustes posteriores de la propietaria.

En **Más → Inventario → Menú y recetas**, la propietaria puede editar el producto y elegir **Tipo de cobro → Por peso**. La tarifa se configura por 100 g, por kilo o por gramo. El vendedor ingresa gramos enteros de peso neto, revisa el importe y añade la porción. Porciones de distinto peso permanecen separadas; **Cambiar peso** permite corregirlas antes del cobro. No incluye lectura automática de balanza.

El backend calcula los importes en centavos con la tarifa del catálogo, valida pesos y calcula cada porción antes de multiplicar por cantidad. No confía en importes enviados por el navegador. Los comprobantes conservan gramos, tarifa, base y precio cobrado, aunque el producto cambie después. Se mantienen cobros en efectivo, QR, tarjeta, saldo a favor, reintentos sin duplicación, anulaciones y arqueo. El modo de inventario permanece independiente del cobro por peso.

## Validación

- Suite completa: **111/111 pruebas aprobadas**; registro local en `tmp/acai-test-suite.log`.
- Después se añadió y verificó un caso de incorporación al reiniciar con un turno abierto: **7/7 pruebas de peso aprobadas**, incluyendo el caso adicional. Son 112 casos distintos verificados.
- `npm run check`, `node --check public/pricing.js` y `git diff --check` correctos.
- Pruebas en SQLite y PostgreSQL/PGlite con rol limitado: redondeos, gramajes inválidos, precio manipulado, porciones diferentes, reintentos, pago con saldo, reversión, historial, cierre y conservación de configuración.
- Revisión móvil a 390 × 844: precio inicial Bs 1,00; cambio a peso; 250 g y 125 g en líneas distintas; cambio de 250 g a 300 g; cobro de Bs 4,25 y recuperación del comprobante desde historial, sin errores de consola. La demostración quedó otra vez por porción a Bs 1,00.
- Capturas locales: `output/acai-2026-10-13/peso-250g.png` y `output/acai-2026-10-13/comprobante-peso.png`.

## Publicación coordinada

Proyecto Supabase `oozvdybbdajbmfwikczt`, cuenta nstrulesgames, esquema privado flamingo. Antes de migrar: esquema 3, menú v2, 58 ventas, 123 movimientos y turno 2 abierto; no existía Açaí.

Se creó respaldo consistente privado en `data/backups/flamingo-postgres-2026-10-13T12-44-07-404Z.json`, excluido de Git y Vercel. Migración generada mediante CLI: `20261013122250_weighted_sales.sql`. Añade columnas y restricciones; no modifica ventas, pagos, existencias ni permisos. Se compiló el despliegue compatible antes de aplicar el esquema 4 y promover Vercel.

La migración quedó registrada en Supabase como `20261013124945 flamingo_weighted_sales`. Verificación posterior: esquema 4, 58 ventas por 50.250 centavos, 123 movimientos, suma de existencias 600.487 y turno 2 abierto, iguales a la comprobación previa. Açaí se creó una sola vez: activo, precio 100 centavos, cobro por porción, sin receta y sin control de stock. Ninguna transacción de prueba se registró en la base real.

Se conservaron las 20 tablas privadas con RLS y la ausencia de acceso al esquema para anon/authenticated. El asesor no encontró problemas nuevos; permanece el aviso previo de Supabase Auth sobre [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), sin cambios de configuración de autenticación.

Código: commit `30e024b`. Despliegue coordinado: `dpl_gtXQ4MXA97zJZtCBRxuaECVrHpGq`, `https://flamingos-6fiwudi6s-nstrulesgames.vercel.app`, promovido a `https://flamingos-psi.vercel.app/`. El CLI necesitó especificar `--scope nstrulesgames`. `/api/status` devolvió HTTP 200 con PostgreSQL y Google activos; `npm run db:check` confirmó el esquema 4 con el rol limitado del backend.
