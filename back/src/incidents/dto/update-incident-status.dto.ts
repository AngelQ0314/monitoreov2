export class UpdateIncidentStatusDto {
  estado: 'Abierto' | 'En progreso' | 'Resuelto';
  fechaResolucion?: string; 
}
