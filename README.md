# capstone_2026_duoc_alameda

Nombre del proyecto: RegistrApp - Capstone-001D

Descripción: Plataforma web de gestión de asistencia mediante código QR firmado. Sustituye la pasada de lista tradicional en papel por un código QR de vigencia breve, permitiendo un proceso ágil donde el responsable proyecta el código, el miembro abre el enlace firmado con su cámara y el servidor registra la marca en vivo.

Tecnologías utilizadas (lenguajes, frameworks, base de datos, cloud): Angular 18, PrimeNG, angularx-qrcode, PostgreSQL en Supabase, Supabase Auth, Edge Functions (Deno/TS), SheetJS, pdfmake y Vercel.

Instrucciones para ejecutar el proyecto localmente: (Pendiente de definición)

Integrantes del equipo con sus roles: Vicente Moya (Desarrollador), Marcos Tapia (Desarrollador) y Felipe Antonio Krauss (Docente).

Metodología de trabajo del equipo (Scrum, Kanban, DevOps, etc.): Scrum con sprints de dos semanas, planificación por épicas, estimación en puntos de función y control de avance en tablero.

Arquitectura de la solución (descripción o diagrama): Arquitectura de tres capas conformada por Presentación (Frontend) para el estado visual e interfaz; Lógica (Edge Functions) para validación y seguridad ejecutada fuera del cliente; y Acceso a Datos (BD) usando PostgreSQL en Supabase con políticas nativas.
