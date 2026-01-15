export class CreateIncidentDto {
  _id?: string;
  serviceId: string;
  titulo: string;
  descripcion: string;
  severidad: 'Baja' | 'Media' | 'Alta';
  estado: 'Abierto' | 'En progreso' | 'Resuelto';
  cadena: string;
  restaurante: string;
  fechaInicio: string;  
}
