# AUnToque: lanzamiento y operación

El proyecto implementa registro multi-restaurante, planes, activación manual, vencimiento, gracia, recuperación de acceso, verificación de correo, respaldo completo y asistente inicial. Las credenciales, el dominio y las cuentas externas deben ser proporcionados por el operador. No se ha desplegado ningún servicio ni contratado infraestructura.

## 1. Configuración inicial (Ubuntu con Docker y Compose)

1. Configura DNS del dominio hacia el servidor. Permite únicamente SSH, HTTP y HTTPS en el firewall. El puerto 3001 no se publica.
2. Copia `deploy/env.example` a `deploy/.env`. Sustituye todos los valores de ejemplo. Usa contraseñas diferentes de al menos 16 caracteres. Configura correos distintos para el propietario inicial y el administrador de plataforma.
3. Crea la cuenta de Resend, verifica el dominio de envío con SPF/DKIM y configura `RESEND_API_KEY` y `MAIL_FROM`. No envíes claves por chat ni las guardes en Git. El transporte usa la API HTTPS de Resend; no es SMTP.
4. Ejecuta desde la raíz:

```sh
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d app caddy
docker compose -f deploy/compose.yaml logs --tail=100 app caddy
```

El contenedor comprueba la configuración antes de iniciar. Caddy solicita HTTPS automáticamente. La base, las claves y los archivos se guardan en `app_data`, fuera de la imagen; los respaldos en `backups`. No ejecutes `down -v`, ya que eliminaría volúmenes. La primera instalación es limpia: no se copia la base local ni los archivos de demostración. No cargues credenciales locales al servidor.

El acceso inicial usa los correos configurados en `.env`. Las contraseñas de bootstrap se usan solo al crear las bases; cambiarlas en el archivo no restablece contraseñas existentes. Después del primer acceso puedes retirar las contraseñas de bootstrap del archivo. Conserva las demás variables para los reinicios.

## 2. Primer restaurante y cobro

- El registro guarda plan y período, crea cinco mesas y deja la suscripción pendiente. Configurar el menú no requiere pago automático.
- En `/saas/restaurants`, abre el restaurante, selecciona plan, período, estado activo, vencimiento y referencia del pago confirmado. Solo la plataforma puede hacerlo. La fecha de vencimiento del formulario se interpreta al final del día UTC.
- En el panel del restaurante, envía el enlace de verificación. Hasta que un propietario lo verifique y el plan esté activo, no se habilitan llamadas al público.
- Mensual: Bs 150 / 250 / 500. Anual: Bs 1.500 / 2.500 / 5.000. El vencimiento se establece manualmente según el pago real; no se cobra, factura ni renueva automáticamente.
- La gracia por defecto es de tres días. Después se bloquea la atención; los datos, el acceso al panel y los respaldos permanecen disponibles. La suspensión explícita no tiene gracia.
- Una instalación local anterior conserva estado `legacy` y plan Business para evitar cortar el servicio. No es una prueba gratuita. La instalación nueva de producción empieza pendiente.

## 3. Alcance de los planes

El catálogo de precios y permisos está en `shared/plans.mjs`. El servidor comprueba límites al crear/activar mesas, usuarios y botones; valida videos, perfiles de gerente, cocina, sectores, exportación y personalización de displays. Los restauradores JSON tampoco pueden eludir esos límites. El cambio a un plan menor se rechaza si excede mesas, usuarios, videos, perfiles, botones o sectores; ajusta esos recursos primero.

Almacenamiento: 1/3/10 GB por restaurante; imágenes hasta 5 MB, videos hasta 10 MB. `MEDIA_QUOTA_BYTES`, si se configura, puede establecer un techo adicional de infraestructura. Los archivos cargados sin uso ocupan espacio hasta ejecutar la limpieza con vista previa y confirmación desde SaaS. Solo se retiran archivos gestionados sin referencias y con más de siete días.

El historial visible es 30 días / 365 días / completo; los datos históricos se conservan en las bases y respaldos para recuperación. La exportación Excel usa SpreadsheetML `.xls`, con celdas de texto; PDF usa la impresión del navegador. El display completo se descarga en PNG; el QR individual en PNG/SVG. Sectores se asignan a las mesas en Business; no es una red multi-sucursal.

## 4. Copias y restauración

En `/saas` pulsa **Crear respaldo completo** antes de activar el primer restaurante. Luego se ejecuta cada 24 horas mientras el proceso esté activo (`BACKUP_INTERVAL_HOURS`). Cada copia incluye SQLite, claves de cifrado y archivos multimedia; los backups JSON de un restaurante no incluyen medios ni configuración SaaS. Las copias completas tienen manifiesto SHA-256 y verificación de integridad SQLite. Las operaciones de escritura HTTP reciben 503 durante la copia para mantener estable el inventario. Las carpetas `.partial` indican una copia fallida y no se restauran como válidas.

Las copias locales NO protegen contra pérdida del servidor. Para copia externa cifrada:

1. Contrata un bucket S3 compatible en una cuenta separada. Crea credenciales restringidas al bucket.
2. Copia `deploy/env.offsite.example` a `deploy/.env.offsite`, completa el repositorio y una contraseña de cifrado única. Guarda una copia de esa contraseña fuera del servidor.
3. Inicializa una sola vez y activa el servicio:

```sh
docker compose -f deploy/compose.yaml --profile offsite run --rm --entrypoint restic offsite init
docker compose -f deploy/compose.yaml --profile offsite up -d offsite
docker compose -f deploy/compose.yaml logs --tail=50 offsite
```

El servicio copia cada seis horas, verifica el repositorio y conserva 7 copias diarias, 4 semanales y 6 mensuales. La retención local conserva al menos siete respaldos verificados y todos los de los últimos treinta días. Las copias incompletas o alteradas quedan para revisión manual. No se ha verificado conectividad al proveedor sin sus credenciales.

Ensayo de restauración: descarga una instantánea externa con `restic restore` a una ubicación separada. Con Node.js 24, ejecuta:

```sh
node scripts/restore-full.mjs /respaldo-completo /destino-nuevo-vacio
```

El comando rechaza destinos no vacíos, rutas superpuestas, archivos modificados y bases corruptas. No sustituye una instalación activa. Inicia una instancia de prueba usando `DB_PATH=/destino-nuevo-vacio/data/platform.sqlite` y `MEDIA_DIR=/destino-nuevo-vacio/uploads`. Comprueba login, restaurantes, menú y llamadas antes de cambiar el servicio. Conservar claves `.key` es imprescindible.

## 5. Disponibilidad y actualizaciones

- `/api/health`: control público mínimo; `/api/saas/ops`: estado privado de memoria, antigüedad de proceso, correo y último respaldo de esta ejecución.
- Configura un monitor externo contra `/api/health` cada minuto. Puede ejecutarse `scripts/check-health.mjs` desde otro equipo con `HEALTH_URL` y un `ALERT_WEBHOOK` opcional. Configura la alerta en tu canal; no se ha enviado ninguna notificación externa.
- Docker reinicia procesos ante fallos; un estado unhealthy por sí solo no reinicia un contenedor. El monitor debe alertar si el proceso sigue vivo pero no responde.
- Mira logs de app, Caddy y copia externa. Se rotan logs de la app. Alertar también por disco libre, fallo de restic y ausencia de respaldos recientes.
- Antes de actualizar: respaldo completo, copia externa confirmada y prueba de compilación. Reconstruye app y verifica health. Una reversión debe usar imagen y respaldo compatibles; no sustituyas bases en caliente.
- Solo se confía en `X-Real-IP` cuando procede de la IP explícita de Caddy (172.30.0.2). Nunca configures confianza indiscriminada en cabeceras reenviadas.

## 6. Piloto de aceptación antes de vender

1. Dos restaurantes separados: menú, cuentas, archivos y colas sin cruces.
2. Un teléfono con datos móviles abre el QR público; no debe contener localhost.
3. Registro Pro anual muestra Bs 2.500, queda pendiente y solo el administrador lo activa.
4. Correo real recibido: verificar, recuperar acceso, comprobar que un enlace usado no sirve nuevamente.
5. Llamar, aceptar desde otro dispositivo y finalizar. Dos garzones no pueden aceptar la misma solicitud.
6. Desconectar y reconectar la pantalla: aparece aviso y se recupera la cola. Probar sonido en el hardware real y mantener el monitor abierto.
7. Vencimiento y suspensión impiden llamadas sin borrar datos. Límites de mesas y videos también se cumplen enviando peticiones directas a la API.
8. Restaurar una copia externa en otra máquina y comparar los dos restaurantes.
9. Revisar condiciones comerciales, privacidad, soporte, facturación y cancelación con los datos legales del proveedor. No hay disponibilidad/SLA garantizados por este código.

Las pruebas automatizadas no sustituyen DNS, correo real, disponibilidad del proveedor ni audio/GPS/NFC del dispositivo físico.

## 7. Producto y monitoreo

Consulta OPERACION-COMERCIAL.md para contacto, condiciones, bandeja comercial y acta del piloto. Los datos del proveedor permanecen pendientes hasta completarlos. Ejecuta `node scripts/check-release.mjs` antes de vender.

Activa el monitoreo con `docker compose -f deploy/compose.yaml --profile monitoring up -d monitor`. Configura ALERT_WEBHOOK HTTPS para recibir JSON con campo text, y prueba entrega y recuperación. El monitor consulta health cada minuto, revisa disco, antigüedad del respaldo local y, si OFFSITE_STATUS_FILE=/status/offsite-success está configurado, la última copia externa. El perfil offsite actualiza esa marca solo después de backup, retención y check correctos. Configura el límite de antigüedad local por encima de BACKUP_INTERVAL_HOURS.

Un monitor en el mismo servidor no puede notificar si se apaga toda la máquina. Mantén además un control HTTPS externo. No se han enviado alertas reales desde este equipo. El monitoreo no reinicia contenedores por un estado unhealthy.

La medición local reproducible está en `scripts/benchmark-local.mjs`; usa cinco restaurantes temporales, hasta treinta peticiones concurrentes y no admite una URL de producción. Repetir las mediciones en el VPS antes de prometer capacidad.

## Seguridad y entregas

Configurar REQUIRE_PLATFORM_MFA=true en producción. Vincular cada cuenta de plataforma desde /saas/security y guardar sus códigos de recuperación fuera del servidor; la recuperación por correo no desactiva el segundo factor. La aplicación bloquea la gestión de plataforma hasta completar la vinculación cuando la variable está activa. Nunca compartir la clave de cifrado ni los códigos.

Seguir ACTUALIZACIONES.md para preparar entregas sin datos privados, ensayar, cambiar versiones y recuperar la instalación. El historial manual y las solicitudes de baja se administran desde /saas/finance; no hay cobro automático ni facturación fiscal.

