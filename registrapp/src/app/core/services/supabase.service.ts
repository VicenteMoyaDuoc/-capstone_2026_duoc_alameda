import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { crearClienteFalso } from '../dev/supabase-fake';
import { rolFalsoActivo } from '../dev/dev-datos';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  readonly client: SupabaseClient = rolFalsoActivo()
    ? crearClienteFalso() // solo desarrollo: datos ficticios en memoria, sin tocar Supabase
    : createClient(environment.supabaseUrl, environment.supabaseKey);
}
