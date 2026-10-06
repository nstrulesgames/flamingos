# Interfaz operativa · Flamingo’s

Modo Operate. Material solicitado: cristal esmerilado sobre fondo marfil con luz suave coral y dorada. El vidrio pertenece a navegación, panel de pedido y diálogos; los datos usan superficies de alta opacidad. Blur de 16px solo en superficies principales, con fallback sólido.

Tipografía de sistema para lectura operativa, cifras tabulares, encabezados compactos, texto principal tinta cálida. Rojo profundo para acciones y selección, verde para confirmación, ámbar para pendientes. No depender únicamente del color. Controles de al menos 44px, inputs de 16px, safe areas y altura dinámica.

Venta: composición de celular en todas las pantallas, hasta 480px de ancho. Dos columnas de productos, búsqueda y categorías adhesivas, cuatro accesos inferiores. Tarjetas de familias para evitar listar 18 escarchas: tamaño y sabor en un diálogo; botellas y bolos requieren una sola selección de variante. Pedido en diálogo nativo de pantalla completa, con cantidades de 44px y cobro inferior. Acceso directo a cobrar desde el catálogo. Sin banner comercial ni animaciones en cada selección.

Arqueo: progreso real, búsqueda por nombre, filtro de pendientes, acción siguiente pendiente y Enter para avanzar. Cantidades vacías nunca equivalen a cero. Borrador local y envío explícito. Revisión prioriza discrepancias y conserva coincidencias plegadas e historial completo.

Propietario: resumen al entrar, estado actual separado del período consultado, acceso al arqueo y stock bajo. Fechas rápidas y gráfico accesible con detalle textual de cada hora.

Inventario, recetas e historiales usan tarjetas y listas verticales. Líquidos en litros para las entradas físicas; recetas conservan la unidad base ml. Campos vacíos y contenido oculto respetan la validación nativa. Diálogos nativos mantienen el foco e impiden interactuar con las pantallas inferiores.

Fuentes aplicadas (instrucciones consultadas, no instalación global):
- https://github.com/pbakaus/impeccable — skill impeccable, craft-floor y operate.
- https://github.com/emilkowalski/skills — emil-design-eng y mobile-native.

Copias locales de referencia en design-references/ (excluidas de Git); las fuentes originales están enlazadas arriba. Se utilizó el fallback de lectura directa porque el launcher no está instalado. El usuario eligió los conceptos Cristal claro y Cristal oscuro de la ronda de imágenes del 6 de octubre para los dos modos de color.

## Revisión de legibilidad · 6 de octubre de 2026

Una familia de sistema para las operaciones y el acceso, con escala fija en rem: cuerpo 15px, información secundaria 13px, campos y precios 16px, secciones 20px y títulos 26px. El nombre de marca conserva su lettering. Importes con cifras tabulares y nombres de productos sin tracking comprimido. La composición sigue limitada a 480px.

Perfil abre las opciones de cuenta; cerrar sesión permanece como acción explícita con confirmación. Contraseña con control Mostrar/Ocultar accesible. Diálogos enfocan su título en celular para presentar el contexto antes de activar un campo; teclado de escritorio conserva el enfoque de formulario. Métodos de pago exponen su selección con aria-pressed. Importes rápidos se distribuyen en dos filas para conservar etiquetas completas.

El resumen usa una columna de métricas a 320px y dos en celulares más anchos. El gráfico conserva etiquetas legibles y desplaza sus horas dentro del panel. El acceso público muestra una explicación si falta el propietario y el alta local está bloqueada, en lugar de ofrecer un formulario que sería rechazado.

## Cristal claro y Cristal oscuro · 6 de octubre de 2026

La versión clara usa cristal marfil con luz coral y ámbar, tinta cálida y acciones rojas. La oscura usa borgoña, vidrio ahumado, texto marfil y acciones coral. Ambas comparten proporciones, controles, navegación y colores de estado. Los precios y las cantidades permanecen sobre superficies legibles.

La apariencia se elige en el acceso o en Más → Apariencia: Claro, Oscuro o Sistema. Por defecto se sigue al dispositivo. La preferencia se guarda en este navegador, se aplica antes del primer pintado y se sincroniza entre pestañas. Cambiarla no vuelve a renderizar formularios ni pedidos. El modo Sistema responde a cambios del teléfono; una elección manual prevalece. El color de la barra del navegador y los controles nativos sigue al tema.

Se reutilizan las miniaturas del catálogo existente. Blur limitado a cabecera, búsqueda, navegación, pedido y acceso; las tarjetas usan transparencia sin filtros individuales. Fallback sólido para navegadores sin backdrop-filter y para reducción de transparencia. Se respeta la reducción de movimiento, y el comprobante impreso conserva papel blanco y tinta oscura.

| Before | After | Why |
| --- | --- | --- |
| Una sola paleta marfil | Cristal claro y cristal oscuro con colores semánticos compartidos | Mantener legibilidad y estados coherentes en ambas apariencias |
| Colores fijos en formularios y paneles | Superficies, campos, alertas, gráficos y foco definidos con variables | Evitar pantallas claras o textos oscuros dentro del modo oscuro |
| Resumen precedido por avisos y estado de caja | Importes del período antes del estado actual y avisos | Facilitar la consulta rápida del propietario |
| Sin selección de apariencia | Claro, Oscuro y Sistema con persistencia local | Respetar la elección del usuario al volver a abrir el POS |
