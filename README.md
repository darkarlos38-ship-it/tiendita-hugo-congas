# Hugo Congas — corrección de interfaz y Libro de Reclamaciones

## Archivos a reemplazar en GitHub
- `public/index.html`: corrige el color de modales/carrito; introduce el formulario de reclamaciones. Conserva el resto del diseño AMOLED.
- `public/admin-ui.js`: incorpora la configuración legal y la consulta de reclamaciones.
- `worker.js`: añade endpoints seguros `/api/provider`, `/api/claims` en Cloudflare Worker y registra reclamaciones en D1.

## Obligatorio: crear tabla D1
En Cloudflare → D1 SQL Database → `hugo-congas-db` → Console ejecutar el texto de `claims.sql`. No subas `claims.sql` al directorio public.

## Datos legales
Después del despliegue, entra al administrador, completa **razón social/nombre legal**, **RUC de 11 dígitos** y **domicilio legal**. Nunca deben inventarse. Hasta que los completes, el formulario mostrará un error explícito al intentar registrarse.

## Comportamiento del Libro
La página permite registrar digitalmente la hoja, genera código único y ofrece una copia imprimible (guardar PDF usando Imprimir). Los reclamos se conservan en D1, y el administrador puede revisarlos al entrar en su panel. **No hay correo automático**: el titular debe revisar las reclamaciones regularmente y responder al consumidor por correo dentro de 15 días hábiles. Configurar un servicio de correo transaccional será necesario para copia automática vía email. Pide asesoría legal para adecuación final a la regulación peruana.

## Prueba
`public/index.html` abierto desde disco permite revisar colores, botones y formulario, pero **no enviará reclamos** sin Cloudflare y D1. No publiques datos reales de clientes en GitHub.
