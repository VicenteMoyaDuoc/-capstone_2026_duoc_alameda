export const environment = {
  production: false,
  /**
   * Solo para trabajar el front sin credenciales: simula una sesión con este rol.
   * Las consultas a Supabase seguirán devolviendo vacío (RLS exige sesión real).
   * Pon null para volver al login normal.
   */
  devRolFalso: null as 'administrador' | 'responsable' | 'miembro' | null,
  /**
   * Clave de Google Maps JavaScript API (restringida por dominio). Si queda vacía, el mapa usa OpenStreetMap.
   */
  googleMapsApiKey: 'AIzaSyDqb0MuaGCdQYu1a16LMA56taDmGG_8nBo',
  supabaseUrl: 'https://cyvkeqjakynfhludgrry.supabase.co',
  supabaseKey: 'sb_publishable_31clcB9W8uV484i40v2yzw_KS3Num22'
};
