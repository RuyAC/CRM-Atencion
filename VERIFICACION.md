# Verificación de Mate bar

Entrega local del 6 de octubre de 2026. Marca Mate bar, español y precios en bolivianos. Aplicación preparada y servidor disponible en `http://localhost:3001` al finalizar la entrega.

| Verificación ejecutada | Resultado |
|---|---|
| Servidor: autenticación, roles, llamadas, concurrencia, cancelación, QR, persistencia, presencia, medios, eventos, cocina, moneda, reportes, respaldo y automatización | 12 pruebas aprobadas |
| Navegador: circuito entre cliente, administrador y monitor, menú y pantallas principales | 9 comprobaciones aprobadas; sin errores de página |
| Navegador: formularios, video real cargado y reproducido, descargas PNG/SVG/CSV, cocina, configuración, roles y respaldo/restauración | 12 comprobaciones aprobadas; datos aislados |
| Accesibilidad enfocada: enlace de salto, menú móvil, Tab/Escape/retorno de foco, escritorio y 28 muestras de contraste | 4 comprobaciones aprobadas |
| Preparación de la aplicación | Compilación aprobada |
| Inicio local | Reconoce el servidor existente y abre una nueva instancia cuando está detenido |
| Revisión visual independiente | SHIP para entrega local; tres correcciones resueltas |
| Procedencia de imágenes de la aplicación | 8 archivos con origen incorporado; ninguno pendiente |

La revisión independiente comprobó las capturas y el código y leyó los resultados; no volvió a ejecutar las pruebas. El informe de confirmación es `.impeccable/review/finish-verdict.md`. Los resultados de navegador están en `ui-results.json`, `workflow-results.json` y `accessibility-results.json` dentro de esa carpeta.

La documentación visual final se extrajo directamente del código por el agente principal; la revisión de cierre se realizó por un agente independiente.

No se certifica igualdad exacta de píxeles en toda la aplicación: se preservó la composición observada y se adaptaron idioma, marca y moneda. Cocina es una implementación propia de una función anunciada sin pantalla original inspeccionada. La suscripción es informativa y no cobra. Las fotos y platos iniciales son de demostración.

Quedan para los dispositivos del restaurante las comprobaciones físicas de GPS, NFC, sonido, vibración, instalación, televisor y reloj. Las notificaciones se implementan para el monitor abierto, sin servicio externo de push. La comprobación de movimiento reducido y video se realizó en Edge; no se verificaron todos los navegadores ni lectores de pantalla. Las 28 muestras de contraste no equivalen a una auditoría completa de accesibilidad. Algunas fechas auxiliares del panel usan la zona del dispositivo; los períodos de reportes y el conteo diario usan la zona del restaurante.

No se publicó el código ni se creó hosting o un repositorio remoto. Los datos de la instalación permanecen en este equipo. Los recorridos CRUD, cocina y restauración se ejecutaron con un servidor de prueba independiente; las llamadas de verificación en Mesa 05 de la instalación principal quedaron finalizadas.


## Corrección de personalización · 2026-10-06

- Inspección autenticada del inventario original de Configuración y de su sección Identidad.
- Nueva página continua con ocho enlaces internos y todas las secciones visibles, en español para Mate bar.
- 11 comprobaciones de personalización, 6 de controles de configuración, 12 de servidor y 12 de flujos existentes aprobadas (41 en este pase).
- SQLite aislada para las pruebas; persistencia después de reinicio, actualizaciones en vivo, carga y eliminación de portada, cuatro presets de logotipo presentes, vista previa y restauración, mapa por ratón/teclado y modo pasivo conjunto.
- Capturas en `.impeccable/review/personalization/` a 390, 768, 1120 y 1440 px. Sin desborde en los recorridos probados; movimiento reducido habilitado en la prueba del mapa/controles.
- La localización conserva Mate bar, español, Bs y los datos existentes. No hubo publicación.
- La comparación no certifica igualdad de todos los píxeles ni de los recursos predefinidos del proveedor. Los logotipos predefinidos locales son iconos vectoriales propios; las portadas propuestas son fotografías de Unsplash.

El PIN general se obtiene mediante la acción ya existente reservada al propietario. Guardar otros ajustes envía un PIN vacío para conservar las sesiones del monitor; la prueba inspecciona ese envío. Un logotipo roto recupera la inicial en cliente y vista previa. El detector registró una fuente de URL sin documentar; se añadió el token de tipografía correspondiente al campo observado. Sus notas de paleta y radio fueron tratadas como variantes de la referencia.

## Corrección de redes · 2026-10-07

- Detección de IP pública desde el navegador mediante ipify, autorizada por el usuario. Nombre Wi-Fi/SSID no obtenido.
- Autorización opcional de la subred local detectada, guardada en SQLite; filtro de WSL y VPN conocidas.
- 30 pruebas unitarias y de servidor aprobadas, incluidas 18 específicas de red. Dos clientes LAN simulados autorizados y un cliente ajeno rechazado; cabeceras declaradas por el cliente no amplían el acceso.
- 9 recorridos de navegador y 2 casos adicionales de timeout/reintento aprobados con datos aislados. IP pública simulada para pruebas reproducibles; estas pruebas no confirman el acceso físico de teléfonos reales.
- Capturas a 390, 768 y 1440 px en `.impeccable/review/networks/`; persistencia, activación, registro manual, errores y teclado comprobados.
- Compilación aprobada con carga nativa de configuración de Vite; servidor local reiniciado sin sustituir sus datos.

## Reproducción de Equipo · 2026-10-07

- Referencia: dos capturas aportadas por el usuario, conservadas en `.impeccable/review/staff/`. Página y formulario reproducidos para Mate bar en español.
- 38 pruebas unitarias y de servidor aprobadas, incluidas ocho específicas de Equipo. Contraseña de miembros con mínimo de seis caracteres y PIN de cuatro dígitos; políticas independientes de contraseña personal y PIN general conservadas.
- 14 comprobaciones de navegador aprobadas sobre SQLite temporal después del ajuste final: crear, editar, revelar/ocultar PIN, cambiar credenciales, revocar sesiones, asignar roles, proteger al último propietario, informar correos duplicados y confirmar eliminación.
- Teclado: Tab y Shift+Tab permanecen dentro del diálogo, Escape cierra y devuelve el foco. Navegación móvil y movimiento reducido comprobados; cero errores JavaScript durante los recorridos.
- Capturas finales de la página a 1119, 1440, 768 y 390 px; formulario a 533, 1440 y 390 px. Cero desborde horizontal en la matriz. A 1119 px: sidebar 280 px, banner `(312,23)` de `783 × 152`, tarjetas de roles en y297 de 139 px y ficha en y460 de 126 px. El formulario mide 512 px de ancho a 533 px.
- Compilación final aprobada y aplicación principal respondiendo en `http://localhost:3001/dashboard/staff` con los archivos actualizados. Las pruebas conservaron la base principal y sus cuentas; no hubo publicación.
- El texto, los datos reales, la marca y el banner de instalación local son adaptaciones explícitas. Esta comparación no certifica identidad de todos los píxeles, todas las pantallas ni todos los navegadores. Los avisos del detector corresponden a variantes documentadas de la referencia; la revisión independiente se conserva en `finish-review.md`.

## Reproducción visual de Redes Wi-Fi · 2026-10-07

- Referencia: captura de 1116 × 854 aportada por el usuario. Banner local compartido, navegación, panel oscuro de IP, acciones verdes y lista de fichas reproducidos en español para Mate bar.
- 39 pruebas unitarias y de servidor aprobadas; el ajuste posterior para conservar fechas de creación desconocidas se confirmó con las 11 pruebas de red. Fechas de actualización generadas por el servidor, sin aceptar fechas enviadas por el cliente.
- 18 recorridos de navegador y 2 comprobaciones de timeout/reintento aprobados, sin errores JavaScript. Registro directo mediante ambos botones, repetición sin duplicar, edición, alta manual, validaciones, cambio de estado, eliminación con confirmación y errores recuperables comprobados.
- SQLite temporal y medios aislados, IP pública simulada y LAN física real. Los dos registros localhost usados para comparación existieron solo en las pruebas; las redes y cuentas principales se conservaron.
- Página a 1116/1440/768/390 px y formulario a 533/1440/390 px, cero desborde horizontal. Geometría en `.impeccable/review/networks-reference/geometry.json`: banner `(309,16)` de `784 × 152`, panel `(309,290)` de `784 × 138`, lista `(309,452)` de `784 × 228`, filas de 81 y acciones superiores de 40 px.
- Teclado, restauración del foco, móvil, movimiento reducido y cancelación al salir comprobados. El fallo de IP conserva el registro manual; el reintento descarta respuestas antiguas.
- Compilación aprobada. Servidor principal reiniciado con sus datos; entrega local en `http://localhost:3001/dashboard/networks`. No hubo publicación.
- Evaluación visual final realizada en el chat principal, con geometría y recorridos comprobados por el agente de verificación. Contraste de textos blancos sobre los verdes: 3,60:1 y 2,54:1, conservados por la referencia; no se certifica AA ni igualdad absoluta de píxeles. Sin captura del formulario original para comprobar su apariencia. Detector con 26 avisos advisory documentados; no se volvió a ejecutar.

## Barra lateral compartida · 2026-10-07

- Las diez rutas administrativas utilizan `AdminSidebar.jsx` y `admin-sidebar.css`, con el diseño de Redes Wi-Fi aceptado. Ancho de escritorio 277 px, padding `5px 9px 9px`; panel móvil de 280 px con padding de 12 px. Cocina y los accesos por rol se conservan.
- 11 comprobaciones aprobadas en `scripts/verify-sidebar.mjs`: firmas de estilos iguales en todas las rutas, foco y selección compartidos, navegación Wi-Fi → Menú → Configuración → Wi-Fi, herramientas alcanzables a 640 px de alto, tutorial, cliente, TV, formulario de producto, roles y cierre de sesión.
- Diez rutas a 1116/1440/768/390 px: 40 casos sin desborde horizontal. Panel móvil inerte al cerrar, foco contenido al abrir, Escape con retorno al disparador y movimiento reducido comprobados. Cero errores JavaScript.
- Pruebas con SQLite temporal, servidor y navegador aislados; solicitudes externas bloqueadas o simuladas. La base principal y sus cuentas permanecen intactas. Cinco capturas inspeccionadas, resultados y geometría en `.impeccable/review/sidebar-unified/`.
- Compilación aprobada con carga nativa de configuración. La aplicación principal responde 200 y sirve `index-CVa8E_6R.js` en `http://localhost:3001/dashboard/menu`.
- Revisión independiente: **ship**, limitada a consistencia lateral; registro completo en `finish-review.md`. Detector ejecutado una vez: 23 avisos advisory y cero hallazgos primarios. Contraste heredado blanco/rosa activo de 4,22:1 documentado sin certificar accesibilidad global. Documentación reconciliada con la implementación final; entrega exclusivamente local.

## Reproducción del tutorial · 2026-10-07

- Seis pasos observados reproducidos según las capturas aportadas: bienvenida, mesas, menú, TV, Wi-Fi y botones. Español, Mate bar y edición local conservados. El séptimo mantiene «Todo listo para comenzar» con una mesa de prueba real; no llegó su referencia original.
- Nuevo diálogo nativo de576px, barra de progreso6px, cabecera58px, tres filas de59px/gap8, ayuda contextual y pie66px. Cada paso se adapta al texto; el cuerpo desplaza en móvil corto sin perder las acciones.
- 11 comprobaciones aprobadas en `verify-tutorial.mjs`, con SQLite temporal, servidor y navegador aislados. Siete pasos, anterior/siguiente/indicadores, completar, enlaces reales, permisos, datos dinámicos, cierre/omitir/Escape/fondo, foco contenido y restaurado, navegación móvil y movimiento reducido comprobados. Cero errores JavaScript y cero desborde en los21 estados medidos de la matriz.
- Dieciséis capturas finales abiertas: siete recortes620×549, siete móviles390×844, móvil390×640 en paso5 y escritorio1116×854. Referencias, resultados, geometría y contraste en `.impeccable/review/tutorial-reference/`.
- La bienvenida describe la instalación sin suscripciones, las mesas se cuentan desde los datos activos y el PIN depende de Configuración. Se conservan los colores de la referencia con excepciones de contraste3,34:1 y2,93:1; el resto del texto medido cumple sus umbrales. No se certifica accesibilidad completa ni la apariencia original del paso7.
- Compilación aprobada; aplicación principal responde200 y sirve `index-B0l0p__z.js`. Base y cuentas principales intactas; sin publicación. Selector histórico del tutorial actualizado en el verificador de la barra lateral, sin volver a ejecutar su matriz completa.
- Revisión visual final y documentación realizadas directamente en el chat principal, sustituyendo esos handoffs delegados; disposición **ship** acotada a los pasos observados y cierre local provisional. Detector ejecutado una vez:23 avisos advisory y cero hallazgos primarios. Registro completo en `finish-review.md`.
- Se intentó leer la pestaña original de Atencion para contrastar el paso7. La acción no se ejecutó: el puente de aprobación automática devolvió502 («Previous response owner account is unavailable»). Fue un fallo del mecanismo de revisión, no una declaración de acción insegura ni prueba de bloqueo del sitio contra IA. No se eludió la revisión; las seis capturas proporcionadas siguieron siendo la autoridad.

## Cierre original del tutorial · 2026-10-07

- El usuario proporcionó la captura del paso7. Sustituido el cierre provisional por equipo, reportes y reapertura del tutorial; «Ver equipo» abre /dashboard/staff respetando los permisos. «Comenzar a usar» cierra y devuelve el foco.
- Icono de equipo verde, tres filas, ayuda ámbar y botón final verde con destellos amarillos. Color #009966 muestreado del original; contraste blanco/verde3,65:1 conservado sin certificar AA. Español y Mate bar mantienen las adaptaciones autorizadas.
- 11 comprobaciones del tutorial aprobadas nuevamente,21 estados medidos sin desborde y cero errores JavaScript. Capturas renovadas con SQLite/servidor/navegador aislados; base principal intacta. El paso7 mide576×524px en escritorio y mantiene sus acciones visibles en los dos altos móviles.
- Compilación aprobada; archivos actualizados index-4NOgRiHe.js/index-DMCLEJ06.css. Revisión visual del último paso realizada directamente en el chat principal: **ship** para el tutorial observado. Contrato, DESIGN.md y sidecar reconciliados con las siete referencias.
- Detector de esta corrección ejecutado una vez sobre Tutorial.jsx/tutorial.css:24 avisos advisory y cero hallazgos primarios, conservados como variantes de la referencia. No se necesitó volver a acceder a la plataforma original.

## Administración local de Atencion · 2026-10-07

- Cuatro rutas locales: `/saas`, `/saas/accounts`, `/saas/restaurants` y `/saas/activity`. Consultan la cuenta propietaria real `admin@local.test` y Mate bar; incluyen búsqueda, filtro de estado, CSV de cuentas visibles, detalles de cuenta/restaurante e historial de accesos exitosos de propietarios desde su habilitación. Las fechas desconocidas no se inventan.
- 47/47 pruebas unitarias y de servidor aprobadas, registradas en `.impeccable/review/saas/backend-tests.txt`. El permiso de plataforma es independiente de OWNER y se verifica en servidor; no se obtiene mediante los campos editables del equipo ni mediante un respaldo. La cuenta inicial autorizada se protege frente a sustitución de credenciales por otro propietario.
- 18/18 comprobaciones de navegador aprobadas en `results.json`: cuenta real, filtros, CSV, detalles, navegación, actividad, cierre de sesión y denegación para anónimo, PIN, gerente, garzón y OWNER adicional. Cero excepciones JavaScript; los mensajes de consola 401/403 son las respuestas esperadas de esos accesos denegados.
- Dieciséis combinaciones de las cuatro rutas a 1440×1000, 768×900, 390×844 y 320×740, más tres estados de diálogo, con desborde horizontal cero en `geometry.json`. Enlace de salto, foco visible, Tab/Shift+Tab contenidos, Escape, retorno del foco y movimiento reducido comprobados. Las pruebas usaron servidor, navegador y SQLite temporales, con solicitudes externas bloqueadas.
- La revisión inicial `finish-review.md` pidió corregir únicamente la explicación del permiso en el acceso. `fix-verdict.md` cierra ese ajuste con **ship**, limitado a la corrección: propietario de restaurante y administrador de Atencion son permisos distintos. `desktop-login.png`, `mobile-login.png` y `fix-verification.json` comprueban el texto final en el servidor real `http://localhost:3001`, campos vacíos, cero desborde y cero excepciones JavaScript a 1440 y 390 px.
- Compilación final aprobada; archivos servidos `index-DIInV4Ly.js` y `SaasAdmin-D-eac4EH.js`. `live-data-preservation.json` confirma Mate bar, sus cuentas y recursos conservados; el único cambio de acceso en la instalación es la concesión del permiso de plataforma a la cuenta inicial. No hubo publicación ni cambios remotos.
- Detector ejecutado anteriormente una vez: 70 avisos advisory y cero hallazgos primarios. `DESIGN.md` y `.impeccable/design.json` incorporan la extensión SaaS desde el código; esta documentación leyó la evidencia y validó su estructura, sin repetir pruebas, detector, compilación ni capturas.
- No se certifica AA integral ni preparación para producción SaaS. Registro multiempresa, aislamiento de negocios, suscripciones/pagos, acción de suspensión y despliegue de producción siguen pendientes. El modelo futuro decidido es mensual por restaurante; suspender deberá bloquear la administración y las nuevas llamadas. La pausa de atención actual no representa esa suspensión comercial.

## Separación de cliente y administrador SaaS · 2026-10-07

- Mate bar inicia sesión con ventas@matebar.com como OWNER. admin@local.test usa una identidad separada PLATFORM_ADMIN y una sesión exclusiva de plataforma; no pertenece a Equipo ni a la lista de clientes.
- Migración transaccional e idempotente, con respaldo SQLite y clave local previos en data/backups. Conserva la contraseña y el PIN de Mate bar, sus mesas, menú, equipo y solicitudes; invalida las sesiones antiguas del propietario. La evidencia live-data-preservation.json confirma las diez comprobaciones de conservación.
- 51/51 pruebas de servidor aprobadas, incluidas separación de permisos, correos reservados, contraseñas independientes, respaldos, restauración, migración legacy, revocación e inactividad del principal.
- 9/9 comprobaciones focales y 19/19 comprobaciones SaaS aprobadas con SQLite y navegador aislados. Acceso de ambos perfiles, redirección, denegación cruzada, CSV, filtros, actividad, diálogos, teclado, foco, movimiento reducido y cuatro anchos comprobados. Sin excepciones JavaScript ni desbordamiento en los casos verificados.
- Una ejecución SaaS inicial detectó selectores antiguos que seguían esperando el nombre Administrador. Se actualizaron al nombre real Mate bar y la ejecución final aprobó las 19 comprobaciones; no se cambió el comportamiento de la aplicación para acomodar esos selectores.
- Capturas desktop-client-account.png y mobile-client-account.png inspeccionadas. El enlace Entrar al restaurante abre /login; conserva nombre accesible cuando solo muestra un icono en celular. Los formularios de acceso dejan vacíos correo y contraseña.
- Verificación final sobre localhost:3001 en live-access.json: PLATFORM_ADMIN sin permiso de monitor, ventas como único cliente, OWNER sin permiso SaaS. Las dos sesiones de comprobación se cerraron. Compilación final aprobada con index-jDUap9OR.js y SaasAdmin-DVjeCqIH.js; servidor local activo.
- Evidencia en .impeccable/review/account-separation y .impeccable/review/saas. No se publicaron cambios; multiempresa, suscripciones, pagos y suspensión comercial siguen fuera de esta etapa.

## Registro local de restaurantes · 2026-10-07

- `/login` incorpora «Crear cuenta para mi restaurante» y `/register` permite registrar restaurante, propietario, correo y contraseña. El alta inicia la sesión y muestra cinco mesas con QR propios y el PIN del monitor; el menú comienza vacío y la moneda es Bs. La cuenta aparece en Cuentas y Restaurantes del SaaS con su fecha real de creación.
- Cada restaurante nuevo tiene base, clave, medios y canal de eventos separados; Mate bar conserva su base original. El servidor bloquea cruces entre sesiones, QR, menús, equipo, redes, ajustes, llamadas, respaldos y archivos, y no concede permisos de plataforma mediante el registro.
- 61/61 pruebas de servidor aprobadas, incluidas diez de registro y aislamiento, en `logs/registration-all-tests.txt`. 8/8 comprobaciones de navegador aprobadas en `.impeccable/review/registration/results.json` y `logs/registration-ui-tests.txt`, con SQLite, medios y navegador aislados y solicitudes externas bloqueadas. No se crearon restaurantes de prueba en la instalación principal.
- Login y registro comprobados a 1440, 768, 390 y 320 px, con teclado y preferencia de movimiento reducido; no hubo desborde ni excepciones JavaScript. Se comprobaron contraseñas distintas, correo repetido, alta, llamada desde QR al restaurante correspondiente, aparición en SaaS y reingreso móvil. La primera ejecución encontró que una ayuda se incluía en el nombre accesible de Contraseña; se corrigió con nombre propio y descripción vinculada antes de la ejecución final aprobada.
- Respaldo consistente previo en `data/backups/pre-registration-1791402856317.sqlite` y su clave. `live-data-preservation.json` compara el contenido antes y después de reiniciar y confirma conservación de metadatos, entidades, credenciales, solicitudes, operaciones e identidades e historial SaaS. Mate bar mantiene cinco mesas, seis productos, cuatro categorías, tres miembros y tres botones.
- Compilación final aprobada: `index-BpfgoiHf.js`, `index-Bhu6b7d5.css`, `Register-B4onSa6C.js` y `SaasAdmin-DLxfVeLI.js`. Servidor local activo en el puerto 3001, proceso 34192; `/api/health`, `/login` y `/register` respondieron HTTP 200 tras reiniciar. Capturas de escritorio y celular inspeccionadas. Los documentos se actualizaron después sin repetir pruebas ni compilación.
- Registro e independencia de restaurantes quedan implementados localmente. Verificación y recuperación de correo, suscripciones/pagos, suspensión comercial y publicación por internet siguen pendientes; no se publicaron cambios ni se modificaron repositorios remotos.

## Formulario de productos según las capturas · 2026-10-07

- Crear y editar productos usan `ProductEditor.jsx` y su CSS propio. Reproducen información del menú, estudio de medios, foto/video en teléfono 9:16, promoción y ahorro, descripción/contador, siete etiquetas predefinidas, etiquetas personalizadas eliminables, destacado, archivo/enlace, consejos desplegables y pie persistente. Se mantienen español, moneda configurada y disponibilidad previa del producto.
- 10/10 comprobaciones de navegador aprobadas en `.impeccable/review/product-editor/results.json` y `logs/product-editor-ui-tests.txt`: apertura/cierre y retorno del foco, foto/video, responsive, precios, etiquetas/Enter, destacado, error promocional recuperable, consejos, conservación de medios al cambiar pestaña, rechazo de archivos grandes, subida real de imagen/video, guardado y creación. Se verificaron 14 estados a 1119, 1440, 768, 390 y 320 px, teclado y movimiento reducido; cero desborde horizontal y excepciones JavaScript. SQLite, medios y navegador fueron temporales, con solicitudes externas bloqueadas.
- 3/3 pruebas existentes pertinentes del servidor aprobadas: CRUD/persistencia, subida/rangos/URL segura y edición de medios/moneda. No se repitió la suite completa porque no se modificó el servidor. La evidencia está en `backend-results.json`.
- La inspección inicial encontró que los estilos compartidos estrechaban el diálogo a 620 px y cambiaban fuentes. Se encapsularon los estilos y se confirmó visualmente el ancho de 1040 px, columnas 1.43:1, marco de teléfono y pie visible en escritorio y celular. Se conserva el texto de los precios mientras se escribe, permitiendo vacío y decimales. El fixture inicial de video no tenía frames; se corrigió la grabación de prueba y la carga final se verificó con un video decodificable.
- Detector ejecutado una vez antes de la corrección de herencia CSS: 22 avisos advisory y cero hallazgos primarios. Colores, tamaños, etiquetas con emojis y composición se conservan por la referencia explícita. `finish-review.md`, las dos referencias, capturas, contrato, DESIGN.md y sidecar registran el alcance. No se certifica igualdad absoluta de píxeles para traducciones ni contenido distinto.
- Compilación final aprobada con `index-DH-h-gcr.js` e `index-BSr4goX6.css`. `/dashboard/menu` y `/api/health` respondieron HTTP 200 en localhost:3001 y el HTML referencia el archivo nuevo. No se reinició el servidor ni se editaron los datos principales; no hubo publicación ni cambios remotos.
