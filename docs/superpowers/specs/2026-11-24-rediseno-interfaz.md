# Rediseño de la interfaz del panel PROMOVER

Fecha: 2026-11-24 · Modo: **Operate** (herramienta de trabajo diaria). Contexto de producto: `PRODUCT.md`.

## 0. El equipo

| Rol | Mirada |
|---|---|
| Diseño de producto (líder) | Arquitectura de información, flujo de trabajo, qué va en cada pantalla |
| Investigación UX | Cómo lo resuelven productos parecidos; qué les funciona y qué no |
| Ingeniería de diseño (escuela Emil Kowalski) | Interacción, movimiento, estados, sensación de respuesta |
| Operaciones de admisión en salud | Realidad del agendamiento: documentos, OPS, Visoft, WhatsApp al lado |
| Accesibilidad | Contraste, foco, teclado, celular |

## 1. Diagnóstico de la interfaz actual

- **Navegación plana en la barra superior**: Dashboard, Lista de espera, Agendas, Usuarios, Simulador al mismo nivel. Las colas de trabajo (Mi cola, Bolsa, En gestión por otros), que son lo que el equipo usa todo el día, están **escondidas en pestañas dentro** de Lista de espera, sin presencia en la navegación.
- **Agendas** repite el patrón: sus vistas (Servicios, Agenda SOS, Reglas) son pestañas internas.
- **Detalle de solicitud**: 9 tarjetas apiladas en dos columnas (Alertas, A verificar, Datos, OCR, Observaciones, Gestión, Cerrar, Documentos, Historial). No dice **qué falta** de un vistazo; «Gestión» muestra todos los estados de documentos a todos los tipos; «Guardar cambios» y «Marcar como GESTIONADA» no tienen relación entre sí.
- **Identidad**: Geist + slate + teal-700, correcta pero sin jerarquía: todo es tarjeta blanca con borde.
- **Usuario y salir**: siempre visibles en la barra, ocupando espacio de trabajo en un portátil de 13".

## 2. Qué hacen productos parecidos

| Producto | Qué funciona | Qué no |
|---|---|---|
| Zendesk Agent Workspace | Vistas (colas) en la lateral con conteos; ticket con propiedades a un lado, conversación al centro y panel de contexto ([Zendesk](https://support.zendesk.com/hc/en-us/articles/6259543948442-Best-practices-for-creating-custom-layouts)); vista dividida lista+ticket en pruebas ([split view](https://support.zendesk.com/hc/en-us/articles/10413364615194-Using-split-view-on-Agent-Home-Closed-EAP)) | Tres columnas se vuelven estrechas en portátil |
| Front (bandeja compartida) | Todo en una barra lateral colapsable con secciones por estado ([Front](https://front.com/blog/the-new-front-inbox)) | Sus usuarios se quejaron de que la búsqueda dejó de estar siempre visible y de que cambiar de estado en la lateral se volvió más lento ([comunidad Front](https://community.front.com/workflows-discussion-47/new-ui-inbox-is-two-steps-back-2906)) |
| Linear (triage) | Bandeja de dos columnas y navegación por teclado ([Linear](https://linear.app/changelog/2021-09-23-desktop-navigation)) | Pensado para desarrolladores; los atajos son poco descubribles |
| Software de admisión de remisiones médicas | Lista de chequeo por documento: recibido / falta / verificar / exceptuado, cada ítem verificable por separado, los faltantes como bloqueo explícito ([UI Bakery](https://uibakery.io/blog/referral-intake-playbook)) | Casi todo es material de proveedores, no estudios de uso |

## 3. Propuesta v1 (diseño de producto)

- Barra lateral con todo: colas, dashboard, configuración, usuario.
- **Vista dividida** estilo Linear/Zendesk: lista a la izquierda, solicitud a la derecha, sin cambiar de página.
- Búsqueda global por nombre o documento en la barra superior.
- Detalle con tres columnas: datos · documentos · gestión.

## 4. Evaluación de la v1

| Quién | Hallazgo | Consecuencia |
|---|---|---|
| Investigación UX | El equipo trabaja en **portátil de 13–15"** con WhatsApp al lado: lateral (230 px) + lista (~400 px) + detalle no caben sin comprimir el detalle, que es donde se trabaja | Se descarta la vista dividida; se gana velocidad con «siguiente/anterior» dentro del detalle |
| Operaciones | Búsqueda por nombre o documento en la URL rompe la regla de privacidad del proyecto (la búsqueda de la lista es local a propósito) | La búsqueda global va por **número de solicitud** (no es dato personal); nombre y documento se siguen buscando en la lista, localmente |
| Operaciones | Tres columnas en el detalle repiten el problema de hoy: no dicen qué falta | El detalle se organiza alrededor de una **lista de requisitos** del tipo de solicitud |
| Investigación UX | Front mezcló estados y tipos en la lateral y sus usuarios se perdieron | La lateral separa **trabajo** (colas) de **configuración**; los filtros (EPS, servicio, estado) se quedan en la lista |
| Ingeniería de diseño | Una lateral siempre abierta roba ancho en el portátil | Lateral **colapsable a riel de íconos**, recordando la preferencia; sin animación al colapsar con teclado |
| Accesibilidad | El usuario y «Salir» siempre visibles quitan espacio | Pasan a un menú de usuario en la barra superior |

## 5. Propuesta v2 (la que se construye)

### Estructura

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ PROMOVER Cali │  Lista de espera › Mi bandeja     [Ir a solicitud… ⌘K]  ● Bot  (DM)▾ │
│               ├──────────────────────────────────────────────────────────┤
│ TRABAJO       │                                                          │
│ ▣ Mi bandeja 12│   contenido de la sección                               │
│ ○ Por tomar   34│                                                         │
│ ◎ En gestión   9│  (solo administradores)                                │
│               │                                                          │
│ SEGUIMIENTO   │                                                          │
│ ▤ Indicadores │                                                          │
│               │                                                          │
│ CONFIGURACIÓN │  (solo administradores)                                  │
│ ▦ Agendas   ▾ │                                                          │
│    Servicios  │                                                          │
│    Agenda SOS │                                                          │
│    Reglas     │                                                          │
│ ◍ Usuarios    │                                                          │
│               │                                                          │
│ ⇤ Contraer    │                                                          │
└───────────────┴──────────────────────────────────────────────────────────┘
```

- **Barra lateral** (oscura, tinta verde azulada): grupos Trabajo · Seguimiento · Configuración · Herramientas (Simulador, solo en modo simulación). Las colas muestran su conteo. «Agendas» se despliega con sus tres vistas como submenú. Se contrae a un riel de íconos con tooltip; en celular es un cajón.
- **Barra superior** (clara): migas de pan con la ubicación, «Ir a solicitud» por número, estado del bot (interruptor para super_admin, indicador para los demás) y menú de usuario (nombre, rol, salir).
- **Lista de espera**: el título es la cola elegida en la lateral; buscador local + filtros en una barra compacta; tabla igual de densa.
- **Detalle de solicitud**:
  1. Encabezado fijo: número, nombre, documento, EPS, servicio, días en espera, y las acciones del momento (Tomar / Revisado / Gestionada), más «‹ anterior · siguiente ›» en la cola.
  2. **Qué falta**: lista de requisitos del tipo (terapia / valoración / especialista) con estado por documento: recibido, falta, verificar, no aplica. Los que no aplican no aparecen.
  3. Alertas abiertas y «A verificar al agendar».
  4. Columna de gestión: datos editables y estados de documentos **solo de los que aplican**, observaciones; botón **«Revisado»** (guarda y marca revisión completa). «Gestionada» se habilita solo después de «Revisado».
  5. Documentos, datos del OCR e historial, plegables.
- **Indicadores** (antes «Dashboard»), **Usuarios** y **Simulador** cambian de envoltura, no de función.

### Mundo visual

Escena: personas en una oficina iluminada de día, en portátil, ocho horas seguidas → **claro**, sobrio, denso.
- Lateral en tinta oscura verde azulada (`#0d2b2b`), contenido sobre gris muy claro frío, tarjetas blancas.
- Un acento (verde azulado PROMOVER) solo para acción principal, selección y foco. Semánticos: verde (listo), ámbar (verificar), rojo (falta / vencido), azul (información).
- Geist con números tabulares en conteos, códigos y fechas. Escala tipográfica corta (12–20 px).
- Movimiento: 150–200 ms, `ease-out` fuerte; botones con escala 0.97 al presionar; menús que crecen desde su disparador; sin animación al contraer la lateral con teclado; respeta `prefers-reduced-motion`.

### Fuera de este paso

Registro de aprendizaje al pulsar «Revisado» y la página «Aprendizaje» (diseño aprobado, etapa siguiente).
