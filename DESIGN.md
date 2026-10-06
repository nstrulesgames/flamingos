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

Copias locales de referencia en design-references/ (excluidas de Git); las fuentes originales están enlazadas arriba. Se utilizó el fallback de lectura directa porque el launcher no está instalado. La dirección visual y alcance ya fueron fijados por el usuario; no se generó una ronda de conceptos alternativa.

## Revisión de legibilidad · 6 de octubre de 2026

Una familia de sistema para las operaciones y el acceso, con escala fija en rem: cuerpo 15px, información secundaria 13px, campos y precios 16px, secciones 20px y títulos 26px. El nombre de marca conserva su lettering. Importes con cifras tabulares y nombres de productos sin tracking comprimido. La composición sigue limitada a 480px.

Perfil abre las opciones de cuenta; cerrar sesión permanece como acción explícita con confirmación. Contraseña con control Mostrar/Ocultar accesible. Diálogos enfocan su título en celular para presentar el contexto antes de activar un campo; teclado de escritorio conserva el enfoque de formulario. Métodos de pago exponen su selección con aria-pressed. Importes rápidos se distribuyen en dos filas para conservar etiquetas completas.

El resumen usa una columna de métricas a 320px y dos en celulares más anchos. El gráfico conserva etiquetas legibles y desplaza sus horas dentro del panel. El acceso público muestra una explicación si falta el propietario y el alta local está bloqueada, en lugar de ofrecer un formulario que sería rechazado.
