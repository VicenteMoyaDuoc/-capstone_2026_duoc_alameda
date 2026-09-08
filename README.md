# -capstone_2026_duoc_alameda

## Nombre del proyecto

RegistrApp - Capstone DuocUC Alameda


## Descripción

RegistrApp es una plataforma web de gestión de asistencia mediante código QR firmado. Este sistema busca sustituir la tradicional pasada de lista en papel por un código QR de vigencia breve. Permite un proceso ágil en el que el responsable proyecta el código y los miembros lo escanean, registrando la marca en vivo en el servidor. Además, cuenta con seguridad de nivel empresarial mediante la autenticación por rol y firma de tokens criptográficos.

## Tecnologías utilizadas

* **Frontend:** Angular 18 (framework principal standalone), PrimeNG (componentes accesibles) y angularx-qrcode (renderizado de QR).


* **Base de datos:** PostgreSQL relacional integrado mediante Supabase.


* **Autenticación y Seguridad:** Supabase Auth y Políticas de visibilidad por rol directas en la BD (RLS).


* **Lógica de Servidor / Backend:** Edge Functions ejecutadas en Deno/TypeScript.


* **Reportería:** SheetJS y pdfmake para exportación de archivos puramente desde el navegador.


* **Cloud / Despliegue:** Vercel para vistas previas y publicación continua.


* **Testing:** Pruebas unitarias con Jasmine y Karma, y de extremo a extremo con Playwright.



## Instrucciones para ejecutar el proyecto localmente

*(En construcción)*

## Integrantes del equipo con sus roles

* **Vicente Moya:** Integrante del equipo / Desarrollador


* **Marcos Tapia:** Integrante del equipo / Desarrollador


* **Felipe Antonio Krauss:** Docente

## Metodología de trabajo del equipo

El equipo trabaja bajo la metodología ágil **Scrum**, organizada en Sprints de 2 semanas. La gestión del proyecto se lleva a cabo mediante planificación por épicas, estimación en puntos de función y control de avance a través de un tablero.

## Arquitectura de la solución

La arquitectura está estructurada en tres capas principales:

* **1. Presentación (Frontend):** Interfaz de usuario tipada con TypeScript que maneja el estado visual, el enrutamiento por rol, el diseño responsivo y la reacción a eventos.


* **2. Lógica (Edge Functions):** Capa encargada de la validación y seguridad ejecutada en un entorno de confianza fuera del cliente, incluyendo la firma y validación del token criptográfico del QR.


* **3. Acceso a Datos (BD):** Motor relacional PostgreSQL en Supabase con políticas de seguridad a nivel de fila (RLS), vistas agregadas y capacidades de tiempo real integradas sin necesidad de API propia.
