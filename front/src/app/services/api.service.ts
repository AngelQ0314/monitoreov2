import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = 'http://localhost:3000'; // URL del backend

  constructor(private http: HttpClient) {}

  // Servicios
  getServices(filters?: any): Observable<any> {
    return this.http.get(`${this.baseUrl}/services`, { params: filters });
  }

  getDeletedServices(): Observable<any> {
    return this.http.get(`${this.baseUrl}/services/deleted`);
  }

  getServicesResumen(): Observable<any> {
    return this.http.get(`${this.baseUrl}/services/resumen`);
  }

  createService(service: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/services`, service);
  }

  updateService(id: string, body: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/services/${id}`, body);
  }

  deleteService(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/services/${id}`);
  }

  // Hard delete
  deleteServiceHard(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/services/${id}`, { params: { hard: 'true' } });
  }

  restoreService(id: string): Observable<any> {
    return this.updateService(id, { activo: true });
  }

  // Incidentes
  getIncidents(): Observable<any> {
    return this.http.get(`${this.baseUrl}/incidents`);
  }

  createIncident(incident: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/incidents`, incident);
  }

  updateIncidentStatus(id: string, status: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/incidents/${id}/estado`, status);
  }

  deleteIncident(id: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/incidents/${id}`);
  }

  // Mantenimiento
  getMaintenance(): Observable<any> {
    return this.http.get(`${this.baseUrl}/maintenance`);
  }

  createMaintenance(maintenance: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/maintenance`, maintenance);
  }

  updateMaintenance(id: string, body: any): Observable<any> {
    return this.http.patch(`${this.baseUrl}/maintenance/${id}`, body);
  }

  deleteMaintenance(id: string, hard: boolean = false): Observable<any> {
    const params: any = {};
    if (hard) params.hard = 'true';
    return this.http.delete(`${this.baseUrl}/maintenance/${id}`, { params });
  }

  // Health-checks
  getHealthChecks(): Observable<any> {
    return this.http.get(`${this.baseUrl}/health-checks`);
  }

  // Settings
  getSettings(): Observable<any> {
    return this.http.get(`${this.baseUrl}/settings`);
  }

  updateSettings(body: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/settings`, body);
  }

  // Filtros únicos para selectores
  getEstados(): Observable<any> {
    return this.http.get(`${this.baseUrl}/services/estados`);
  }

  getCadenas(): Observable<any> {
    return this.http.get(`${this.baseUrl}/services/cadenas`);
  }

  getRestaurantes(): Observable<any> {
    return this.http.get(`${this.baseUrl}/services/restaurantes`);
  }
}