# capstone_2026_duoc_alameda

**Nombre del proyecto:** RegistrApp - Capstone-001D

**Descripción:** Plataforma web de gestión de asistencia mediante código QR firmado. Sustituye la pasada de lista tradicional en papel por un código QR de vigencia breve, permitiendo un proceso ágil donde el responsable proyecta el código, el miembro abre el enlace firmado con su cámara y el servidor registra la marca en vivo.

**Tecnologías utilizadas** (lenguajes, frameworks, base de datos, cloud): Angular 18, PrimeNG, angularx-qrcode, PostgreSQL en Supabase, Supabase Auth, Edge Functions (Deno/TS), SheetJS, pdfmake y Vercel.

**Demo en vivo:** (pendiente — se agrega el enlace de Vercel una vez desplegado)

**Instrucciones para ejecutar el proyecto localmente:**

1. Clonar el repositorio y entrar a la carpeta del proyecto Angular:
   ```
   git clone https://github.com/VicenteMoyaDuoc/-capstone_2026_duoc_alameda
   cd -capstone_2026_duoc_alameda/registrapp
   ```
2. Instalar las dependencias:
   ```
   npm install
   ```
3. Verificar que `src/environments/environment.ts` y `environment.development.ts` tengan la URL y la clave pública ("anon key") del proyecto Supabase (ya vienen configuradas en el repositorio; solo hay que revisarlas si se usa un proyecto Supabase distinto).
4. Levantar el servidor de desarrollo:
   ```
   npm start
   ```
5. Abrir [http://localhost:4200](http://localhost:4200) en el navegador. La app redirige automáticamente a `/login`.
6. Iniciar sesión con un usuario de prueba (administrador, responsable o miembro) para ver la aplicación funcionando con datos reales de Supabase.

**Despliegue:** el proyecto está pensado para desplegarse en Vercel, apuntando el "Root Directory" a la carpeta `registrapp` (ahí vive el proyecto Angular, no en la raíz del repositorio).

**Integrantes del equipo con sus roles:** Vicente Moya (Desarrollador), Marcos Tapia (Desarrollador) y Felipe Antonio Krauss (Docente).

**Metodología de trabajo del equipo** (Scrum, Kanban, DevOps, etc.): Scrum con sprints de dos semanas, planificación por épicas, estimación en puntos de función y control de avance en tablero.

**Arquitectura de la solución (descripción o diagrama):** Arquitectura de tres capas conformada por Presentación (Frontend) para el estado visual e interfaz; Lógica (Edge Functions) para validación y seguridad ejecutada f#uera del cliente; y Acceso a Datos (BD) usando PostgreSQL en Supabase con políticas nativas.
