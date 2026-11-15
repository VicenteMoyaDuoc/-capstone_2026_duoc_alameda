-- Configura la verificación de ubicación para la sede Alameda de Duoc UC.
-- Ejecutar DESPUÉS de la migración 12 (ya incluida en setup_nuevo_proyecto.sql).
--
-- Punto de la sede: Av. España 8, Santiago (junto a Metro República).
-- Coordenadas tomadas de OpenStreetMap. Pueden diferir unos metros del acceso real:
-- confírmalas parado en la entrada con el botón "Usar mi ubicación actual" de la
-- pantalla Institución, o copiándolas desde Google Maps (clic derecho en el mapa).

update public.instituciones
set sede_lat           = -33.4489437,
    sede_lng           = -70.6700844,
    radio_proximidad_m = 300,   -- "estar en el campus"
    radio_exacto_m     = 40,    -- "estar en la sala"
    geo_modo           = 'proximidad'
where tipo = 'educativa';

-- Para exigir estar en la sala, cambia el modo (el profesor debe tener el GPS activo
-- al iniciar la clase: ese punto es el centro del círculo de 40 m):
--   update public.instituciones set geo_modo = 'exacta'     where tipo = 'educativa';
-- Para apagarlo:
--   update public.instituciones set geo_modo = 'off'        where tipo = 'educativa';

select nombre, geo_modo, sede_lat, sede_lng, radio_proximidad_m, radio_exacto_m from public.instituciones;
