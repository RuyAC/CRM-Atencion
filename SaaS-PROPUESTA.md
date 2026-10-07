# Administración de Atencion

La administración de la plataforma debe estar separada de la administración de cada restaurante. Ser propietario de un restaurante no concede acceso a las cuentas de otros negocios.

## Primera sección local

| Sección | Contenido |
| --- | --- |
| Resumen | Cuentas, restaurantes, cuentas activas y solicitudes del día, obtenidos de los datos reales. |
| Cuentas | Nombre, correo, restaurante, estado, fecha de registro cuando se conoce, último acceso, búsqueda y exportación. La cuenta inicial es la propietaria de Mate bar. |
| Restaurantes | Nombre, contacto propietario, mesas, productos, miembros del equipo, moneda, zona horaria y estado de atención. |
| Actividad | Accesos de los propietarios registrados a partir de esta versión. |

Los garzones y gerentes pertenecen al equipo de cada restaurante. No se cuentan como personas que registraron un negocio. Las cuentas anteriores a este panel no reciben una fecha de registro inventada.

Mate bar figura como cliente con `ventas@matebar.com`. La cuenta `admin@local.test` pertenece exclusivamente al administrador de Atencion: consulta el panel SaaS, pero no forma parte del equipo ni de la lista de clientes. Para administrar el restaurante hay que iniciar sesión con su propia cuenta.

## Siguientes módulos recomendados

- **Altas y aprobación:** el registro local ya crea al propietario y su restaurante con datos independientes. Queda definir confirmación de correo y un proceso de aprobación si se decide exigirlo.
- **Planes y suscripciones:** suscripción mensual por restaurante, según la decisión del usuario. Definir precio, moneda, límites, prueba si se decide ofrecerla, vencimiento, renovación e historial de pagos antes de integrar cobros.
- **Suspensión del servicio:** bloquear la administración del restaurante y la creación de nuevas llamadas de sus mesas, según la decisión del usuario. Implementar esa regla en el servidor al añadir la gestión de suscripciones.
- **Soporte:** solicitudes por restaurante, responsable, prioridad, conversación y resolución.
- **Uso del servicio:** restaurantes activos, mesas y productos utilizados, volumen de llamadas y tiempo de respuesta. Mostrar ingresos solo cuando existan pagos registrados.
- **Administradores y seguridad:** permisos de plataforma, registro de cambios sensibles, recuperación de acceso y autenticación reforzada.

## Paso necesario para ofrecerlo a otros restaurantes

El registro local ya admite varios restaurantes: cada uno tiene base, clave, archivos, accesos y canal de eventos separados. Las pruebas comprueban aislamiento de menú, mesas, equipo, llamadas, redes, ajustes, QR, respaldos y archivos; el administrador SaaS consulta el inventario agregado. Mate bar conserva sus datos y su acceso.

Antes de ofrecerlo por internet quedan el despliegue solicitado por el usuario, recuperación/verificación de correo, gestión operativa del servicio y las suscripciones mensuales con sus reglas de suspensión.

Esta versión se entrega localmente. Publicación, dominio, servidor y cobros se definirán cuando se solicite esa siguiente etapa.
