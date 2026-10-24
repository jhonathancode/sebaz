# Sistema de rendición para MCP

Sistema en la nube para que las Municipalidades de Centros Poblados (MCP) registren sus gastos y armen la
rendición mensual a la municipalidad distrital y a la provincial. Todo se trabaja en **vista expediente**.

> El nombre que se muestra en pantalla sale de la variable `NEXT_PUBLIC_APP_NOMBRE`. Cambiarlo no requiere tocar código.

## Qué hace

| Módulo | Qué incluye |
|---|---|
| Expedientes | Requerimiento → cotizaciones (cuadro comparativo) → orden de compra o servicio → memorando de conformidad → comprobante de pago. Formatos imprimibles de requerimiento, orden y memorando. |
| Comprobantes de pago | El formato del comprobante (codificación, contabilidad presupuestal y patrimonial, deducciones, forma de pago, cheque, recibí conforme). Aprobación del alcalde, cheque al girar. Comprobantes directos para dietas y honorarios. |
| Caja chica | Fondo del mes, gastos con su sustento (DJ, boletas, facturas, etc.), declaración jurada imprimible, relación de gastos, liquidación que genera su comprobante de pago. |
| Ingresos | Recibos de ingreso con numeración automática; se anulan con motivo. |
| Rendición | Por municipalidad (distrito o provincia): se marcan los comprobantes de pago, el total y el saldo se calculan al instante, y sale el informe con el formato de Perené (Anexo 02, capítulos I y II) o de Chanchamayo (ingresos por rubro y gastos por función). |
| Responsables | Quién tiene cada cargo, desde y hasta cuándo. |
| Configuración | Datos de la MCP para los encabezados, capítulo I fijo del informe, cierre y reapertura de meses. |
| Auditoría | Todo cambio con usuario, fecha, valor anterior y nuevo. |
| Soporte | Alta de MCP, usuarios, relevos y estado de activación. Soporte **no** ve datos financieros. |

## Reglas que hace cumplir la base de datos

Están en `supabase/migrations` y no dependen de la pantalla:

- Cada MCP ve solo sus datos (Row Level Security).
- Nada se borra: se anula con un motivo de al menos 10 caracteres.
- Un documento aprobado no se edita; solo se devuelve (con motivo), se anula o se rinde. El cheque se escribe una vez.
- Solo el alcalde o el administrador aprueban.
- El comprobante de pago de un expediente exige requerimiento aprobado y conformidad.
- Un comprobante solo puede estar en una rendición vigente; solo entran los aprobados con cheque.
- Un mes cerrado no acepta cambios; reabrirlo exige motivo y queda registrado.
- Numeración automática por MCP, tipo de documento y año.
- Al registrar un relevo, quien sale pierde el acceso y su historial se conserva.
- La auditoría no se puede editar ni borrar.

Las pruebas de estas reglas están en `supabase/tests/pruebas_reglas.sql`.

## Puesta en marcha

### 1. Supabase
1. Cree un proyecto en Supabase (región más cercana: São Paulo).
2. En **SQL Editor**, ejecute en orden cada archivo de `supabase/migrations` (uno por vez, del más antiguo al más nuevo):
   - `20261019000000_esquema_inicial.sql`
   - `20261019010000_tipos_y_propios.sql` (pago fijo, ingresos propios como fuente, corrección de requerimientos)
   - `20261023000000_cuadres.sql` (la caja chica y la rendición solo se cierran si cuadran exacto)
   - `20261024000000_fecha_limite.sql` (día límite de la rendición por municipalidad)
   - `20261024010000_logos.sql` (logo de la MCP)
   - `20261024020000_almacen.sql` (almacén: NEA, PECOSA, stock; la compra de bienes pasa por almacén)
   - `20261024030000_pagos_fijos.sql` (lista de pagos fijos y meses pagados)
   - `20261024040000_corrige_aprobar_comprobante.sql` (corrige el error al aprobar comprobantes)
   - `20261024050000_cheque_previsto.sql` (cheque anotado en el pago fijo)
   - O, más fácil: pegar `supabase/ACTUALIZAR_BASE.sql` (trae todas las actualizaciones juntas y se puede repetir sin problema)
3. En **Authentication → Sign In / Providers → Email**, desactive **Allow new users to sign up**. Los usuarios solo los crea soporte.
4. En **Authentication → Users → Add user**, cree su usuario de soporte (correo y clave).
5. En **SQL Editor**, conviértalo en soporte:
   ```sql
   update perfiles set es_soporte = true
   where id = (select id from auth.users where email = 'su-correo@ejemplo.com');
   ```
6. En **Project Settings → API**, copie la URL, la `anon key` y la `service_role key`.

### 2. Vercel
1. **Add New → Project**, importe este repositorio de GitHub.
2. En **Environment Variables**, agregue las de `.env.example`:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_NOMBRE`.
3. **Deploy**.

### 3. Primer uso
1. Ingrese con el usuario de soporte → **Soporte → Dar de alta una MCP** (montos de Perené y Chanchamayo ya sugeridos).
2. Cree los usuarios: administrador, tesorero(a) y alcalde. La clave temporal aparece 2 minutos en pantalla; entréguela en persona.
3. Cada usuario cambia su clave en **Mi cuenta** (clic en su nombre, arriba a la derecha).

## Desarrollo local

```bash
cp .env.example .env.local   # complete los valores
npm install
npm run dev                  # http://localhost:3000
```

Probar las reglas de la base de datos en un Postgres local (sin Supabase):

```bash
createdb prueba
psql -d prueba -f supabase/tests/stub_supabase.sql
psql -d prueba -f supabase/migrations/20261019000000_esquema_inicial.sql
psql -d prueba -f supabase/tests/pruebas_reglas.sql   # termina con "TODAS LAS PRUEBAS PASARON"
psql -d prueba -f supabase/migrations/20261019010000_tipos_y_propios.sql
psql -d prueba -f supabase/migrations/20261023000000_cuadres.sql
psql -d prueba -f supabase/tests/pruebas_tipos_propios.sql
```

## Pendiente (siguientes fases)

- Consulta de RUC y DNI a SUNAT/RENIEC desde los formularios.
- Subida de fotos de sustentos (el bucket privado `sustentos` ya está creado con sus permisos).
- Doble verificación (2FA) obligatoria.
- Exportar a Excel las rendiciones.
- Contabilidad (libro de bancos, conciliación) e inventario.
- Avisos de fecha de rendición.
