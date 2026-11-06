# Tiendita Musical Hugo Congas — Cloudflare SIN R2

Esta adaptación permite utilizar **Cloudflare Workers + D1** sin activar tarjeta ni R2. Conserva el diseño existente. La tienda y el administrador guardan productos, precios y textos en D1. **Las fotografías NO se suben desde el panel**: se usan direcciones HTTPS públicas, o archivos incluidos en `public/images/` y después referenciados como `/images/foto.jpg`.

## Configuración (una sola vez)

1. En Cloudflare → **D1 SQL Database** → `hugo-congas-db` → **Console**, abre `schema.sql` en un editor, copia su contenido completo, pégalo en la consola SQL y ejecútalo. La base debe estar **nueva/vacía**; el script carga productos de demostración. No vuelvas a ejecutarlo innecesariamente.
2. Sube **los archivos y carpetas dentro de** `hugo-congas-cloudflare/` **a la raíz** del repositorio GitHub `tiendita-hugo-congas`. Sube `worker.js`, `wrangler.jsonc`, `package.json`, `schema.sql`, `README.md` y la carpeta `public` sin agregar una carpeta contenedora extra. `wrangler.jsonc` ya incluye el identificador D1 tomado de la captura de tu cuenta.
3. En Cloudflare → Workers & Pages → Create application → Connect GitHub → `tiendita-hugo-congas`. Build command vacío, Deploy command `npx wrangler deploy`. Despliega.
4. En el Worker ya creado → **Settings → Variables and Secrets**, agrega dos variables de tipo **Secret**: `ADMIN_USER` y `ADMIN_PASSWORD` (contraseña **de al menos 12 caracteres**). Nunca publiques las credenciales en GitHub.
5. Abre la URL `.workers.dev`, entra en **Administrador** y prueba un cambio de precio. Vuelve a cargar para verificar que persista.

## Fotos sin R2

Para usar una fotografía: súbela a `public/images/` del repositorio y despliega la actualización, o usa un enlace HTTPS de un alojamiento permitido. En el panel, pega la URL, por ejemplo `/images/congas.jpg` y guarda el instrumento. No es posible subir imágenes directamente desde el administrador en esta versión.

## Notas
- El catálogo inicial es **demostrativo**: verifica productos, precios y existencias antes de abrir al público.
- Se mantienen el mensaje «Envíos a todo el Perú · Tienda virtual · Atención personalizada online» y WhatsApp 916200641.
- No contiene pagos reales ni gestión de pedidos.
- No solicites activar R2: esta versión no lo necesita.
- Si las tablas D1 aún no existen, el Worker devuelve un error hasta que ejecutes `schema.sql`.
