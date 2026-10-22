# Tiempos DAC

Tiempos de respuesta y productividad del Departamento de Análisis de Crédito (Instacredit Nicaragua).
Aplicación web en línea (GitHub Pages + Supabase): se abre desde cualquier computadora o celular, aunque la máquina que la creó esté apagada.

| Perfil | Qué ve |
|---|---|
| **Administrador** y **Jefe DAC** | Todo: Dashboard, Tiempos por analista, Preaprobado condicionado, Productividad, Acumulado, Departamento (global), Vacaciones y calendario, Administración |
| **Analista** | Dashboard y sus propios tiempos, reprocesos, productividad y acumulado |
| **Gerente DAC** | Solo el Dashboard |

## Cómo está armado

- `public/`: la página. Cada `push` a `main` la publica en GitHub Pages (`.github/workflows/pages.yml`).
- `supabase/schema.sql`: tablas, seguridad por rol (RLS) y funciones.
- `worker/`: proceso de actualización en Python. Ejecuta las dos consultas (`Bitacora Tiempo.sql` y `Historico de solicitudes Tiempo.sql`, que se leen tal cual), arma los tramos de cada analista (`worker/tiempos_dac/motor.py`) y los sube a Supabase.
  El datawarehouse está en la red interna, por eso este proceso debe correr en un equipo de la red. La app y sus datos sí están en la nube.

## Reglas de cálculo

- **Universo DAC**: solicitudes que pasaron por POR ASIGNAR A ANALISTA. Se cuentan en el mes en que ingresaron por primera vez.
- **Tramo del analista**: empieza en ANALISTA ASIGNADO y termina en APROBADO/RECHAZADO POR ANALISTA, cualquier TUD, PRE ANALISIS o PREAPROBADO CONDICIONADO. No cuentan, como en el Excel, PENDIENTES, VERIFICADOR MOTORIZADO, REVISION APROBADOR, COMITE CREDITO, DEVUELTO GERENCIA y los estados de resolución (configurable en Administración). El tiempo se mide en horas hábiles: L-V 8:00–18:00 y sábado 8:00–14:00, más los horarios especiales por fecha (por ejemplo, días que el DAC cierra a las 8:00 pm).
- **Corte de mes**: cada solicitud pertenece al mes en que ingresó al DAC y se mide solo hasta el cierre de ese mes; lo que siga abierto se cierra en el corte. Del día 1 al 5 de cada mes el proceso vuelve a leer el mes anterior para cerrarlo.
- **Preaprobado condicionado**: desde PREAPROBADO CONDICIONADO hasta la decisión del analista que la retoma, a quien se le asigna el reprocesamiento.
- **Duración total de la solicitud**: desde su creación hasta la última decisión del analista (aprobado/rechazado por analista o TUD).
- **Tiempo de la solicitud**: el del último tramo de análisis; el caso queda a ese analista.
- **Producto**: PYMES, MOTO; el resto es PERS. **Reestructura**: Monto Colocado 0 o 1 (cuenta para productividad, no para tiempos).
- **Productividad**: solicitudes ÷ días hábiles ÷ analistas (por disponibilidad, descontando vacaciones). Para el analista: solicitudes en que intervino ÷ sus días disponibles (más eventos especiales).
- **Días hábiles**: lunes a viernes 1, sábado 0.5, domingo 0, feriados 0 (si caen domingo se reponen el lunes).

## Puesta en marcha (una sola vez)

1. Crear un proyecto en [supabase.com](https://supabase.com) y copiar la **Project URL** y la clave **anon public** en `public/config.js` y `worker/config.toml`.
2. En Supabase › **SQL Editor**, ejecutar `supabase/schema.sql`.
3. En el equipo de la red: `python worker/generar_semilla.py` crea `data/semilla.sql` (usuarios, analistas y el usuario de sistema, con su contraseña guardada en el Administrador de credenciales). Ejecutarlo en el SQL Editor. No se sube a Git.
4. En Supabase › Authentication › Sign In / Providers, desactivar **Allow new users to sign up**.
5. Programar `Ejecutar actualizacion.bat` al iniciar sesión en ese equipo (Programador de tareas). Atiende el botón **Actualizar** y actualiza sola cada 60 minutos.

## Vista previa local

```bash
.venv/Scripts/python worker/actualizar.py --local
.venv/Scripts/python -m http.server 3000 --directory public
```

Con `public/config.js` vacío (o abriendo `?local`) la app usa `public/local/datos.json` y guarda lo registrado solo en el navegador. Contraseña de todos: 12345678.

Repositorio: https://github.com/camalgut-crypto/TIEMPOS_PRODUCTIVIDAD_DAC
