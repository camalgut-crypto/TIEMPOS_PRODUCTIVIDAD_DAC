# Tiempos DAC

Tiempos de respuesta y productividad del Departamento de Análisis de Crédito (Instacredit Nicaragua).
Aplicación web en línea (GitHub Pages + Supabase): se abre desde cualquier computadora o celular, aunque la máquina que la creó esté apagada.

| Perfil | Qué ve |
|---|---|
| **Administrador** y **Jefe DAC** | Todo: Dashboard, Tiempos por analista, Preaprobado condicionado, Cartera actual, Productividad, Acumulado, Departamento (global), Flujo Rápido y motor, Capacidad instalada, Vacaciones y calendario, Administración (el ciclo de la solicitud lo ve solo el administrador y el gerente) |
| **Analista con reprocesamiento** | Lo del analista más Preaprobado condicionado; el reprocesamiento queda a su nombre (`dac_config.analista_reproceso`) |
| **Analista** | Dashboard y sus propios tiempos, cartera, productividad y acumulado |
| **Gerente DAC** | Dashboard y Ciclo de la solicitud |

## Cómo está armado

- `public/`: la página. Cada `push` a `main` la publica en GitHub Pages (`.github/workflows/pages.yml`).
- `supabase/schema.sql`: tablas, seguridad por rol (RLS) y funciones.
- `worker/`: proceso de actualización en Python. Ejecuta las dos consultas (`Bitacora Tiempo.sql` y `Historico de solicitudes Tiempo.sql`, que se leen tal cual), arma los tramos de cada analista (`worker/tiempos_dac/motor.py`) y los sube a Supabase.
  El datawarehouse está en la red interna, por eso este proceso debe correr en un equipo de la red. La app y sus datos sí están en la nube.

## Reglas de cálculo

- **Universo DAC**: solicitudes que pasaron por POR ASIGNAR A ANALISTA. Se cuentan el día y el mes en que ingresaron por primera vez. Si se crearon en un mes y entraron al DAC el siguiente (creada el 31, entra el 1), no se cuentan como ingreso.
- **Metas de tiempo** (por producto de la solicitud, configurables en Administración): PERS ≤ 20 min, MOTO ≤ 30 min, PYMES ≤ 40 min (29-oct; antes 40 y 50).
- **Flujo Rápido (motor de decisiones)**: todas las solicitudes con APROBADO o RECHAZADO POR MOTOR que no pasaron por POR ASIGNAR A ANALISTA, hayan seguido o no a otro estado (formalizado, TUD, anulado, pre análisis…), aunque la jefatura las haya tocado (29-oct; antes se exigía un estado posterior).
- **Capacidad instalada**: con el presupuesto de colocación y el % por producto, y la historia del mes, trimestre o semestre anterior (ticket promedio de los colocados, solicitudes DAC por crédito colocado, tiempo del caso más preaprobado condicionado y productividad), calcula los analistas necesarios por producto. La bitácora de cada mes se guarda resumida en `dac_bitacora_resumen` y no se pierde al cambiar de mes.
- **Tramo del analista**: empieza en ANALISTA ASIGNADO y termina en APROBADO/RECHAZADO POR ANALISTA, RECHAZADO POR RECEPCION, RECHAZADO RESOLUCION, cualquier TUD, PRE ANALISIS o PREAPROBADO CONDICIONADO. Si el analista toma la solicitud de la cola sin registrar ANALISTA ASIGNADO (POR ASIGNAR → EN ANALISIS), el tramo empieza en ese EN ANALISIS. Es del analista que lo trabaja (primer EN ANALISIS o la decisión), no de quien asignó. No cuentan, como en el Excel, PENDIENTES, VERIFICADOR MOTORIZADO, REVISION APROBADOR, COMITE CREDITO, DEVUELTO GERENCIA y los estados de resolución (configurable en Administración).
- **Dueño del caso**: quien dio la última decisión; si cierra un preaprobado condicionado, el analista que lo dejó en preaprobado. Sin decisión, el último analista que la tuvo. Un TUD registrado por el promotor es del analista del tramo.
- **Productividad del departamento**: productividad de cada producto ponderada por su peso en solicitudes. El tiempo se mide en horas hábiles: L-V 8:00–18:00 y sábado 8:00–14:00, más los horarios especiales por fecha (por ejemplo, días que el DAC cierra a las 8:00 pm).
- **Mes de tiempos y productividad**: sin corte de mes. Cada solicitud se mide completa y cuenta en el mes de su última resolución; sin resolución, en el último mes en que tuvo un estado del DAC (si hoy está en uno, en el mes en curso). Los ingresos (mapa de flujo y horas pico) siguen por el día y mes de ingreso al DAC. Las consultas mensuales traen lo creado este mes y el anterior.
- **Preaprobado condicionado**: un caso por solicitud, desde PREAPROBADO CONDICIONADO hasta la decisión (aprobado, rechazado o TUD). Solo cuenta el tiempo EN ANALISIS; en PREAPROBADO CONDICIONADO el tiempo se detiene. Todo queda a nombre del analista con reprocesamiento.
- **Motor**: de ENVIADO a APROBADO / RECHAZADO POR MOTOR; meta de 1 minuto. El Flujo Rápido no cuenta en los tiempos ni en la productividad del DAC.
- **Ciclo de la solicitud** (gerente): de la creación a FORMALIZADO (de cara al cliente) o al rechazo, TUD o anulación. Cada estado es del departamento DAC o Comercial; los estados sin departamento fijo son de quien pasó la solicitud a ese estado.
- **Duración total de la solicitud**: desde su creación hasta la última decisión del analista (aprobado/rechazado por analista o TUD).
- **Tiempo de la solicitud**: el del tramo del dueño del caso.
- **Producto**: PYMES, MOTO; el resto es PERS. **Reestructura**: Monto Colocado 0 o 1 (cuenta para productividad y, desde el 29-oct, también para tiempos con la meta de su producto).
- **Productividad**: solicitudes ÷ días hábiles ÷ analistas (por disponibilidad, descontando vacaciones). Para el analista: solicitudes en que intervino ÷ sus días disponibles (más eventos especiales).
- **Días hábiles**: lunes a viernes 1, sábado 0.5, domingo 0, feriados 0 (si caen domingo se reponen el lunes).

## Puesta en marcha (una sola vez)

1. Crear un proyecto en [supabase.com](https://supabase.com) y copiar la **Project URL** y la clave **anon public** en `public/config.js` y `worker/config.toml`.
2. En Supabase › **SQL Editor**, ejecutar `supabase/schema.sql` (una instalación existente solo necesita las migraciones `supabase/migracion_*.sql` que no haya ejecutado).
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
