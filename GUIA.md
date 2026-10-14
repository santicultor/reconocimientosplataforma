# Conexión · Reconocimientos DBEE — guía de puesta en marcha

Esta es tu réplica de la app de Lovable, pero el código es tuyo y ya no depende de créditos.
Hace lo mismo: ciclo mensual (nominar → comité aprueba → finalistas → votación secreta → ganadores → premio), con los colores institucionales.

## 1. Probarla ya, sin configurar nada (modo demostración)

```
npm install
npm run dev:demo
```
Abre http://localhost:5173. Usa personas ficticias y guarda todo solo en tu navegador.
Abajo a la izquierda hay un selector "Ver como" para entrar como miembro o como comité, y un botón "Reiniciar".

## 2. Ponerla en producción (con datos reales)

### A. Base de datos (Supabase, gratis)
1. Entra a supabase.com → **New project**. Guarda la contraseña que elijas.
2. Menú **SQL Editor → New query**. Pega TODO el contenido de `supabase/schema.sql` y pulsa **Run**.
   - Esto crea las tablas, activa la seguridad y te deja a ti (santiago.bedoya@unisabana.edu.co) como primera persona del comité.
3. Menú **Project Settings → API**. Copia estos tres valores:
   - **Project URL**
   - **anon / publishable key** (pública)
   - **service_role / secret key** (secreta: no la pegues en el chat ni la subas a GitHub)
4. Menú **Authentication → URL Configuration**: en *Site URL* pon la dirección final de tu app (la de Netlify) y agrégala también en *Redirect URLs*.

### B. Publicar (Netlify)
1. Sube la carpeta a un repositorio de GitHub y conéctalo a Netlify (**Add new site → Import from Git**). La configuración ya está en `netlify.toml`.
2. En **Site configuration → Environment variables** agrega:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = llave anon
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = llave service_role
3. **Deploys → Trigger deploy**. Al terminar, esa es tu dirección.

### C. Primer uso
1. Entra con tu correo institucional (te llega un enlace; no hay contraseña).
2. **Comité → Personas → Importar CSV** y sube `data/equipo_dbee.csv` (52 personas, sacadas de tu Excel).
3. Revisa las filas marcadas "VERIFICAR jefatura": la jefatura la deduje del cargo y no es un dato oficial. Corrígelas con **Editar**.
4. Marca como **Comité** a las otras 5 personas (solo tu rol quedó asignado).
5. **Comité → Ciclo → Nuevo ciclo** y abre las nominaciones.

## 3. Cosas a tener en cuenta
- **Correos de acceso:** el envío de correos que trae Supabase por defecto es muy limitado (pocos por hora). Para que entren ~52 personas conviene configurar un SMTP propio en *Authentication → SMTP Settings* (por ejemplo el de tu Microsoft 365 o un servicio como Resend).
- **Quién puede entrar:** solo correos que estén en la lista de personas y activos.
- **Voto secreto:** el servidor nunca devuelve quién votó por quién; el comité solo ve conteos.
- **Borradores míos que debes revisar:** las descripciones cortas de los 5 valores (`src/shared/constants.ts`) y las jefaturas inferidas del CSV.
- **Fuera de alcance (como pediste):** Huella Individual, Huella de Equipo, Legado del Año, Gala, notificaciones y cumpleaños. El modelo ya tiene el campo `cycle_type` para sumarlos.
- **Foto de perfil:** se sube desde Comité → Personas → Editar (después de guardar a la persona).

## 4. Mapa del código
- `src/shared/logic.ts` — todas las reglas (nominar, votar, empates, publicar).
- `netlify/functions/api.ts` — el servidor.
- `supabase/schema.sql` — la base de datos.
- `src/pages/` — pantallas de miembros; `src/admin/Admin.tsx` — panel del comité.
- `tests/` — pruebas de las reglas (`npm test`).
