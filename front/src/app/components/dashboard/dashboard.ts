import { Component, OnInit, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SettingsComponent } from '../settings/settings';
import { DeletedServicesComponent } from '../deleted-services/deleted-services';
import { MaintenanceComponent } from '../maintenance/maintenance';
import { ViewChild } from '@angular/core';
import { ApiService } from '../../services/api.service';
import { Chart, ChartConfiguration } from 'chart.js/auto';

interface DayHistory {
  date: string;
  fullDate: Date;
  status: 'operational' | 'problems' | 'interruption';
  statusLabel: string;
}

interface ServiceHistory {
  name: string;
  serviceId: string;
  history: DayHistory[];
}

interface TrendDay {
  date: string;
  operational: number;
  problems: number;
  interruption: number;
  availability: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SettingsComponent, MaintenanceComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit, AfterViewInit {
  // ========================================
  // PROPIEDADES DE COMPONENTE
  // ========================================
  showSettings = false;
  showCreateService = false;
  activeTab: string = 'actual';
  showSuccessNotification = false;
  successMessage = '';
  successNotificationTimeout: any = null;
  
  // ========================================
  // DATOS PRINCIPALES
  // ========================================
  services: any[] = [];
  resumen: any = {};
  incidents: any[] = [];
  healthChecks: any[] = [];

  // ========================================
  // VIEWCHILDS
  // ========================================
  @ViewChild(SettingsComponent) settingsCmp?: SettingsComponent;
  @ViewChild(MaintenanceComponent) maintenanceCmp?: MaintenanceComponent;

  // ========================================
  // FILTROS GENERALES
  // ========================================
  filtroDesde: string = '';
  filtroHasta: string = '';
  filtroEstado: string = '';
  filtroCadena: string = '';
  filtroRestaurante: string = '';

  // ========================================
  // FILTROS SEPARADOS: SERVICIOS
  // ========================================
  filtroServiciosEstado: string = '';
  filtroServiciosCadena: string = '';
  filtroServiciosRestaurante: string = '';
  filtroServiciosImportancia: string = '';

  // ========================================
  // FILTROS SEPARADOS: HEALTH CHECKS
  // ========================================
  filtroChecksDesde: string = '';
  filtroChecksHasta: string = '';
  filtroChecksEstado: string = '';
  filtroChecksImportancia: string = '';
  filtroChecksCadena: string = '';
  filtroChecksRestaurante: string = '';

  // ========================================
  // NUEVO SERVICIO
  // ========================================
  newService: any = {
    nombre: '',
    descripcion: '',
    tipo: 'backend',
    ambiente: 'produccion',
    clasificacion: { cadena: '', restaurante: '' },
    endpoint: { url: '', metodo: 'GET' },
    importancia: 'media',
    activo: true,
  };

  // ========================================
  // NUEVO INCIDENTE
  // ========================================
  newIncident: any = {
    serviceId: '',
    titulo: '',
    descripcion: '',
    severidad: 'Media',
    estado: 'Abierto',
    fechaInicio: new Date().toISOString(),
    cadena: '',
    restaurante: '',
  };

  // ========================================
  // ESTADOS DE OPERACIONES
  // ========================================
  creating = false;
  editingServiceId: string | null = null;
  editingService: any = null;
  savingEdit = false;
  deleting = false;
  showDeleteIncident = false;
  selectedIncidentToDelete: string = '';
  deletingIncident = false;

  // ========================================
  // DATOS ÚNICOS PARA FILTROS
  // ========================================
  estados: string[] = [];
  cadenas: string[] = [];
  restaurantes: string[] = [];

  // ========================================
  // PAGINACIÓN
  // ========================================
  currentPage: number = 1;
  healthChecksPerPage: number = 5;

  // ========================================
  // CALENDARIO
  // ========================================
  currentMonth: number = new Date().getMonth();
  currentYear: number = new Date().getFullYear();
  calendarDays: any[] = [];
  recentIncidents: any[] = [];
  
  // Estadísticas de Mantenimiento
  monthlyMaintenances: any[] = [];
  activeMaintenances: number = 0;
  
  // Estadísticas de Servicios en el Período
  servicesWithProblems: number = 0;
  mostAffectedServices: any[] = [];
  avgResolutionTime: string = '—';
  
  // Alertas Rápidas
  unresolvedIncidents: any[] = [];
  overdueMaintenances: any[] = [];

  // ========================================
  // HISTORIAL Y TENDENCIAS
  // ========================================
  historyDays: number = 30;
  servicesHistory: ServiceHistory[] = [];
  trendData: TrendDay[] = [];
  areaChart!: Chart;
  availabilityChart!: Chart;


  // ========================================
  // CONSTRUCTOR
  // ========================================
  constructor(
    private apiService: ApiService,
    private cdr: ChangeDetectorRef
  ) {}

  // ========================================
  // LIFECYCLE HOOKS
  // ========================================
  ngOnInit() {
    this.loadData();
    this.loadFiltrosUnicos();
    this.generateCalendar();
    this.loadRecentIncidents();
  }

  ngAfterViewInit() {
    this.subscribeToSettingsEvents();
  }

  // ========================================
  // SUSCRIPCIONES A EVENTOS
  // ========================================
  private subscribeToSettingsEvents() {
    try {
      if (this.settingsCmp && (this.settingsCmp as any).onSaved) {
        (this.settingsCmp as any).onSaved.subscribe(() => {
          this.loadData();
        });
      }
    } catch (err) {
      console.warn('No se pudo suscribir a onSaved de SettingsComponent', err);
    }

    try {
      if (this.settingsCmp && (this.settingsCmp as any).onOpenDeleted) {
        (this.settingsCmp as any).onOpenDeleted.subscribe(() => {
          this.setActiveTab('deleted');
        });
      }
    } catch (err) {
      console.warn('No se pudo suscribir a onOpenDeleted de SettingsComponent', err);
    }
  }

  private subscribeSettingsSavedOnce() {
    try {
      if (this.settingsCmp && (this.settingsCmp as any).onSaved && !(this as any)._settingsSubscribed) {
        (this.settingsCmp as any).onSaved.subscribe(() => {
          this.loadData();
        });
        if ((this.settingsCmp as any).onOpenDeleted) {
          (this.settingsCmp as any).onOpenDeleted.subscribe(() => {
            this.setActiveTab('deleted');
          });
        }
        (this as any)._settingsSubscribed = true;
      }
    } catch (err) {
      console.warn('subscribeSettingsSavedOnce error', err);
    }
  }

  // ========================================
  // CARGA DE DATOS
  // ========================================
  loadData(filtros: any = {}) {
    // Por defecto, filtrar solo servicios activos (excluir eliminados)
    // A menos que explícitamente se pida incluir inactivos
    if (filtros.activo === undefined) {
      filtros.activo = 'true';
    }
    
    Promise.all([
      this.apiService.getServices(filtros).toPromise(),
      this.apiService.getIncidents().toPromise(),
      this.apiService.getHealthChecks().toPromise()
    ]).then(([services, incidents, healthChecks]) => {
      this.services = services || [];
      this.incidents = incidents || [];
      this.healthChecks = healthChecks || [];
      
      this.calculateResumen();
      this.generateServicesHistory();
      this.loadRecentIncidents();
      this.cdr.detectChanges();
    }).catch(err => {
      console.error('Error cargando datos:', err);
      this.cdr.detectChanges();
    });

    this.apiService.getServicesResumen().subscribe(data => {
      this.resumen = data;
      this.calculateResumen();
      this.cdr.detectChanges();
    }, error => {
      this.calculateResumen();
      this.cdr.detectChanges();
    });
  }

  loadFiltrosUnicos() {
    this.apiService.getEstados().subscribe(d => this.estados = d || []);
    this.apiService.getCadenas().subscribe(d => this.cadenas = d || []);
    this.apiService.getRestaurantes().subscribe(d => this.restaurantes = d || []);
  }

  // ========================================
  // CÁLCULOS Y RESUMEN
  // ========================================
  calculateResumen() {
    // Filtrar solo servicios activos para el resumen
    const servicios = (this.services || []).filter(s => s.activo !== false);
    const total = servicios.length;

    if (total === 0) {
      this.resumen = {
        totalServicios: 0,
        operando: 0,
        impactado: 0,
        degradado: 0,
        interrumpido: 0,
        saludGeneral: 0,
        estabilidad: 0
      };
      return;
    }

    const operando = servicios.filter(s => s.estado === 'Operando normalmente').length;
    const impactado = servicios.filter(s => s.estado === 'Impactado').length;
    const degradado = servicios.filter(s => s.estado === 'Degradado').length;
    const interrumpido = servicios.filter(s => s.estado === 'Interrumpido').length;

    const saludGeneral = Math.round(
      ((operando * 100) + (degradado * 50) + (impactado * 25)) / total
    );

    const estabilidad = Math.round((operando / total) * 100);

    this.resumen = {
      totalServicios: total,
      operando,
      impactado,
      degradado,
      interrumpido,
      saludGeneral,
      estabilidad
    };
  }

  // ========================================
  // GESTIÓN DE SERVICIOS
  // ========================================
  toggleCreateService() { 
    this.showCreateService = !this.showCreateService; 
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
    if (this.showSettings) {
      setTimeout(() => this.subscribeSettingsSavedOnce(), 100);
    }
  }

  createService() {
    if (this.creating) return;
    this.creating = true;
    
    this.apiService.createService(this.newService).subscribe({
      next: (res) => {
        this.creating = false;
        this.showCreateService = false;
        
        // Mostrar notificación de éxito
        this.successMessage = `✅ Servicio "${this.newService.nombre}" creado exitosamente`;
        this.showSuccessNotification = true;
        this.cdr.detectChanges();
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        this.newService = { 
          nombre: '', 
          descripcion: '', 
          tipo: 'backend', 
          ambiente: 'produccion', 
          clasificacion: { cadena: '', restaurante: '' }, 
          endpoint: { url: '', metodo: 'GET' }, 
          importancia: 'media', 
          activo: true 
        };
        
        // Recargar datos después de 500ms para asegurar que se cree
        setTimeout(() => {
          this.loadData();
          this.cdr.detectChanges();
        }, 500);
      },
      error: (err) => {
        this.creating = false;
        console.error('Error creando servicio', err);
        
        // Extraer mensaje de error específico del backend
        let errorMessage = '❌ Error al crear el servicio';
        if (err.error && err.error.message) {
          errorMessage = `❌ ${err.error.message}`;
        } else if (err.message) {
          errorMessage = `❌ ${err.message}`;
        }
        
        alert(errorMessage);
        this.cdr.detectChanges();
      }
    });
  }

  startEdit(service: any) {
    this.editingServiceId = service._id;
    this.editingService = JSON.parse(JSON.stringify(service));
    if (!this.editingService.clasificacion) {
      this.editingService.clasificacion = { cadena: '', restaurante: '' };
    }
    if (!this.editingService.endpoint) {
      this.editingService.endpoint = { url: '', metodo: 'GET' };
    }
    // Asegurar que endpoint.metodo tenga un valor por defecto
    if (!this.editingService.endpoint.metodo) {
      this.editingService.endpoint.metodo = 'GET';
    }
  }

  cancelEdit() {
    this.editingServiceId = null;
    this.editingService = null;
  }

  saveEdit(id: string) {
    if (this.savingEdit) return;
    this.savingEdit = true;
    const serviceName = this.editingService?.nombre || 'Servicio';
    const body = { ...this.editingService };
    this.apiService.updateService(id, body).subscribe({
      next: () => {
        this.savingEdit = false;
        this.editingServiceId = null;
        this.editingService = null;
        
        // Mostrar notificación de éxito
        this.successMessage = `✅ ${serviceName} actualizado correctamente`;
        this.showSuccessNotification = true;
        this.cdr.detectChanges();
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        // Recargar datos automáticamente
        setTimeout(() => {
          this.loadData();
          this.cdr.detectChanges();
        }, 300);
      },
      error: (err) => {
        this.savingEdit = false;
        console.error('Error actualizando servicio', err);
        alert('❌ Error al actualizar el servicio. Intenta de nuevo.');
        this.cdr.detectChanges();
      }
    });
  }

  deleteService(id: string) {
    if (!confirm('¿Eliminar este servicio?')) return;
    if (this.deleting) return;
    this.deleting = true;
    
    // Eliminar inmediatamente de la lista para feedback visual
    const indexToRemove = this.services.findIndex((s: any) => s._id === id);
    const removedService = indexToRemove >= 0 ? this.services[indexToRemove] : null;
    const serviceName = removedService?.nombre || 'Servicio';
    
    if (indexToRemove >= 0) {
      this.services.splice(indexToRemove, 1);
      this.cdr.detectChanges();
    }
    
    this.apiService.deleteService(id).subscribe({
      next: () => {
        this.deleting = false;
        
        // Mostrar notificación de éxito
        this.successMessage = `✅ "${serviceName}" eliminado exitosamente`;
        this.showSuccessNotification = true;
        this.cdr.detectChanges();
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        // Recargar datos desde el servidor
        setTimeout(() => {
          this.loadData();
          this.cdr.detectChanges();
        }, 300);
      },
      error: (err) => {
        this.deleting = false;
        console.error('Error eliminando servicio', err);
        
        // Restaurar en la lista si falla
        if (removedService && indexToRemove >= 0) {
          this.services.splice(indexToRemove, 0, removedService);
        }
        alert('❌ Error al eliminar el servicio. Intenta de nuevo.');
        this.cdr.detectChanges();
      }
    });
  }

  getLastHealthStatus(serviceId: string): string | null {
    if (!this.healthChecks || !this.healthChecks.length) return null;
    const checks = this.healthChecks
      .filter(h => h.serviceId === serviceId)
      .sort((a, b) => {
        const da = new Date(a.fecha || a.fechaRevision || a.createdAt || 0).getTime();
        const db = new Date(b.fecha || b.fechaRevision || b.createdAt || 0).getTime();
        return db - da;
      });
    if (!checks.length) return null;
    return checks[0].estado || null;
  }

  // ========================================
  // GESTIÓN DE INCIDENTES
  // ========================================
  createIncident() {
    if (!this.newIncident.serviceId || !this.newIncident.titulo) {
      alert('Selecciona servicio y escribe un título');
      return;
    }
    const payload = { ...this.newIncident };
    const serviceName = this.getServiceNameById(this.newIncident.serviceId);
    this.apiService.createIncident(payload).subscribe({
      next: (res) => {
        // Mostrar notificación de éxito
        this.successMessage = `✅ Incidente en "${serviceName}" creado exitosamente`;
        this.showSuccessNotification = true;
        this.cdr.detectChanges();
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        this.newIncident = { 
          serviceId: '', 
          titulo: '', 
          descripcion: '', 
          severidad: 'Media', 
          estado: 'Abierto', 
          fechaInicio: new Date().toISOString(), 
          cadena: '', 
          restaurante: '' 
        };
        
        // Recargar datos automáticamente después de 300ms
        setTimeout(() => {
          this.loadData();
          this.cdr.detectChanges();
        }, 300);
      },
      error: (err) => {
        console.error('Error creando incidente', err);
        
        // Extraer mensaje de error específico del backend
        let errorMessage = '❌ Error al crear el incidente';
        if (err.error && err.error.message) {
          errorMessage = `❌ ${err.error.message}`;
        } else if (err.message) {
          errorMessage = `❌ ${err.message}`;
        }
        
        alert(errorMessage);
      }
    });
  }

  onIncidentServiceChange() {
    const id = this.newIncident.serviceId;
    const svc = this.services.find(s => s._id === id);
    if (svc) {
      this.newIncident.cadena = svc.clasificacion?.cadena || svc.cadena || '';
      this.newIncident.restaurante = svc.clasificacion?.restaurante || svc.restaurante || '';
    } else {
      this.newIncident.cadena = '';
      this.newIncident.restaurante = '';
    }
  }

  toggleDeleteIncident() {
    this.showDeleteIncident = !this.showDeleteIncident;
    if (!this.showDeleteIncident) {
      this.selectedIncidentToDelete = '';
    }
  }

  confirmAndDeleteIncident() {
    if (!this.selectedIncidentToDelete) {
      alert('Selecciona un incidente para eliminar');
      return;
    }
    if (!confirm('¿Estás seguro de que deseas eliminar este incidente?')) {
      return;
    }
    this.deletingIncident = true;
    
    // Encontrar y remover inmediatamente de la lista
    const indexToRemove = this.incidents.findIndex((i: any) => i._id === this.selectedIncidentToDelete);
    const removedIncident = indexToRemove >= 0 ? this.incidents[indexToRemove] : null;
    
    if (indexToRemove >= 0) {
      this.incidents.splice(indexToRemove, 1);
      this.cdr.detectChanges();
    }
    
    this.apiService.deleteIncident(this.selectedIncidentToDelete).subscribe({
      next: (res) => {
        this.deletingIncident = false;
        this.showDeleteIncident = false;
        this.selectedIncidentToDelete = '';
        
        // Mostrar notificación de éxito
        this.successMessage = '✅ Incidente eliminado exitosamente';
        this.showSuccessNotification = true;
        this.cdr.detectChanges();
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        // Recargar datos automáticamente
        setTimeout(() => {
          this.loadData();
          this.cdr.detectChanges();
        }, 300);
      },
      error: (err) => {
        console.error('Error eliminando incidente', err);
        this.deletingIncident = false;
        
        // Restaurar en la lista si falla
        if (removedIncident && indexToRemove >= 0) {
          this.incidents.splice(indexToRemove, 0, removedIncident);
        }
        alert('❌ Error al eliminar el incidente. Intenta de nuevo.');
        this.cdr.detectChanges();
      }
    });
  }

  resolveIncident(id: string) {
    if (!confirm('Marcar incidente como Resuelto?')) return;
    const payload = { estado: 'Resuelto', fechaResolucion: new Date().toISOString() };
    this.apiService.updateIncidentStatus(id, payload).subscribe({
      next: () => {
        // Mostrar notificación de éxito
        this.successMessage = '✅ Incidente marcado como resuelto';
        this.showSuccessNotification = true;
        this.cdr.detectChanges();
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        // Recargar datos automáticamente
        setTimeout(() => {
          this.loadData();
          this.cdr.detectChanges();
        }, 300);
      },
      error: (err) => {
        console.error('Error resolviendo incidente', err);
        alert('❌ Error al resolver el incidente. Intenta de nuevo.');
      }
    });
  }

  deleteIncident(id: string) {
    if (!confirm('Eliminar este incidente?')) return;
    this.apiService.deleteIncident(id).subscribe({
      next: () => this.loadData(),
      error: (err) => {
        console.error('Error eliminando incidente', err);
        alert('No se pudo eliminar el incidente');
      }
    });
  }

  loadRecentIncidents() {
    this.recentIncidents = [...this.incidents]
      .sort((a, b) => +new Date(b.fechaInicio) - +new Date(a.fechaInicio))
      .slice(0, 4)
      .map(i => ({
        service: this.getServiceNameById(i.serviceId),
        description: i.descripcion || i.titulo,
        date: new Date(i.fechaInicio).toLocaleDateString('es-EC'),
        duration: '—'
      }));
    
    // Calcular estadísticas del período
    this.calculateMonthlyStatistics();
    this.cdr.detectChanges();
  }

  calculateMonthlyStatistics() {
    const now = new Date();
    const monthStart = new Date(this.currentYear, this.currentMonth, 1);
    const monthEnd = new Date(this.currentYear, this.currentMonth + 1, 0);

    // ========== ESTADÍSTICAS DE MANTENIMIENTO ==========
    const maintenanceApi = (this.maintenanceCmp as any)?.maintenances || [];
    this.monthlyMaintenances = maintenanceApi.filter((m: any) => {
      const mStart = new Date(m.inicio);
      return mStart >= monthStart && mStart <= monthEnd;
    });
    
    this.activeMaintenances = maintenanceApi.filter((m: any) => {
      const mEnd = new Date(m.fin);
      return mEnd > now;
    }).length;

    // ========== ESTADÍSTICAS DE SERVICIOS EN EL PERÍODO ==========
    const incidentsInMonth = this.incidents.filter((i: any) => {
      const iDate = new Date(i.fechaInicio);
      return iDate >= monthStart && iDate <= monthEnd;
    });

    // Servicios con problemas
    const affectedServiceIds = new Set(incidentsInMonth.map((i: any) => i.serviceId));
    this.servicesWithProblems = affectedServiceIds.size;

    // Servicios más afectados
    const serviceIncidentCount: { [key: string]: { count: number; name: string } } = {};
    incidentsInMonth.forEach((i: any) => {
      const svc = this.getServiceNameById(i.serviceId);
      if (!serviceIncidentCount[i.serviceId]) {
        serviceIncidentCount[i.serviceId] = { count: 0, name: svc };
      }
      serviceIncidentCount[i.serviceId].count++;
    });

    this.mostAffectedServices = Object.values(serviceIncidentCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Tiempo promedio de resolución
    const resolvedIncidents = incidentsInMonth.filter((i: any) => i.estado === 'Resuelto' && i.fechaResolucion);
    if (resolvedIncidents.length > 0) {
      const totalTime = resolvedIncidents.reduce((sum: number, i: any) => {
        const start = new Date(i.fechaInicio).getTime();
        const end = new Date(i.fechaResolucion).getTime();
        return sum + (end - start);
      }, 0);
      const avgMs = totalTime / resolvedIncidents.length;
      const avgHours = Math.round(avgMs / (1000 * 60 * 60) * 10) / 10;
      this.avgResolutionTime = avgHours < 24 ? `${avgHours}h` : `${Math.round(avgHours / 24)}d`;
    }

    // ========== ALERTAS RÁPIDAS ==========
    this.unresolvedIncidents = this.incidents
      .filter((i: any) => i.estado !== 'Resuelto')
      .sort((a, b) => +new Date(b.fechaInicio) - +new Date(a.fechaInicio))
      .slice(0, 3)
      .map((i: any) => ({
        service: this.getServiceNameById(i.serviceId),
        title: i.titulo,
        severity: i.severidad,
        days: this.getDaysDifference(new Date(i.fechaInicio))
      }));

    this.overdueMaintenances = maintenanceApi
      .filter((m: any) => {
        const end = new Date(m.fin);
        return end < now && m.estado !== 'Completado';
      })
      .slice(0, 3)
      .map((m: any) => ({
        service: this.getServiceNameById(m.serviceId),
        daysOverdue: this.getDaysDifference(new Date(m.fin))
      }));
  }

  getDaysDifference(date: Date): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  getServiceNameById(id: string): string {
    return this.services.find(s => s._id === id)?.nombre || id;
  }

  // ========================================
  // FILTROS
  // ========================================
  get filteredServices(): any[] {
    let list = this.services || [];
    list = list.filter(s => s.activo !== false);
    
    if (this.filtroServiciosCadena) {
      const f = this.filtroServiciosCadena.toLowerCase();
      list = list.filter(s => (s.clasificacion && s.clasificacion.cadena || '').toLowerCase().includes(f));
    }

    if (this.filtroServiciosRestaurante) {
      const f = this.filtroServiciosRestaurante.toLowerCase();
      list = list.filter(s => (s.clasificacion && s.clasificacion.restaurante || '').toLowerCase().includes(f));
    }

    if (this.filtroServiciosEstado) {
      const f = this.filtroServiciosEstado.toLowerCase();
      list = list.filter(s => ((s.estado || '').toLowerCase().indexOf(f) !== -1));
    }

    if (this.filtroServiciosImportancia) {
      const fImp = this.filtroServiciosImportancia.toLowerCase();
      list = list.filter(s => ((s.importancia || '').toLowerCase() === fImp));
    }

    return list;
  }

  get filteredHealthChecks(): any[] {
    return this.getFilteredHealthChecks();
  }

  get totalHealthPages(): number {
    return Math.ceil(this.filteredHealthChecks.length / this.healthChecksPerPage);
  }

  get healthChecksPage(): any[] {
    const list = this.getFilteredHealthChecks();
    const start = (this.currentPage - 1) * this.healthChecksPerPage;
    const end = start + this.healthChecksPerPage;
    return list.slice(start, end);
  }

  getFilteredHealthChecks(): any[] {
    let list = this.healthChecks || [];

    const activeServiceIds = new Set((this.services || []).filter(s => s.activo !== false).map(s => s._id));
    list = list.filter(h => activeServiceIds.has(h.serviceId));

    if (this.filtroChecksEstado) {
      const f = this.filtroChecksEstado.toLowerCase();
      list = list.filter(h => (h.estado || '').toLowerCase().indexOf(f) !== -1);
    }

    if (this.filtroChecksImportancia) {
      const fImp = this.filtroChecksImportancia.toLowerCase();
      list = list.filter(h => ((h.importancia || '').toLowerCase() === fImp));
    }

    // Filtrar por rango de fechas
    if (this.filtroChecksDesde || this.filtroChecksHasta) {
      list = list.filter(h => {
        const fechaRevision = h.fecha || h.fechaRevision || h.fechaCreacion || h.createdAt;
        if (!fechaRevision) return false;
        
        // Convertir fechaRevision a Date para comparación
        const fechaCheck = new Date(fechaRevision);
        
        if (this.filtroChecksDesde) {
          // Convertir fecha local a inicio del día en hora local
          const desde = new Date(this.filtroChecksDesde + 'T00:00:00');
          if (fechaCheck < desde) return false;
        }
        
        if (this.filtroChecksHasta) {
          // Convertir fecha local a fin del día en hora local
          const hasta = new Date(this.filtroChecksHasta + 'T23:59:59.999');
          if (fechaCheck > hasta) return false;
        }
        
        return true;
      });
    }

    if (this.filtroChecksCadena) {
      const f = this.filtroChecksCadena.toLowerCase();
      list = list.filter(h => (h.cadena || '').toLowerCase().indexOf(f) !== -1);
    }

    if (this.filtroChecksRestaurante) {
      const f = this.filtroChecksRestaurante.toLowerCase();
      list = list.filter(h => (h.restaurante || '').toLowerCase().indexOf(f) !== -1);
    }

    return list;
  }

  // ========================================
  // PAGINACIÓN
  // ========================================
  goToPage(page: number) {
    if (page < 1 || page > this.totalHealthPages) return;
    this.currentPage = page;
  }

  nextPage() {
    if (this.currentPage < this.totalHealthPages) {
      this.currentPage++;
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
    }
  }

  // ========================================
  // HISTORIAL DE SERVICIOS
  // ========================================
  generateServicesHistory() {
    const servicesList = this.filteredServices || [];
    if (!servicesList.length) return;

    this.servicesHistory = servicesList.map(service => {
      const history: DayHistory[] = [];
      const today = new Date();

      for (let i = this.historyDays - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);

        const status = this.getServiceStatusForDate(service._id, date);

        history.push({
          date: date.toLocaleDateString('es-EC', {
            day: '2-digit',
            month: '2-digit'
          }),
          fullDate: new Date(date),
          status,
          statusLabel: this.getStatusLabel(status)
        });
      }

      return {
        name: service.nombre,
        serviceId: service._id,
        history
      };
    });

    this.generateTrends();
    this.cdr.detectChanges();
  }

  getServiceStatusForDate(
    serviceId: string,
    date: Date
  ): 'operational' | 'problems' | 'interruption' {

    const dayIncidents = this.incidents.filter(i => {
      if (i.serviceId !== serviceId || !i.fechaInicio) return false;
      const start = new Date(i.fechaInicio);
      const end = i.fechaFin ? new Date(i.fechaFin) : new Date();
      return date >= start && date <= end;
    });

    if (dayIncidents.length) {
      if (dayIncidents.some(i => i.estado === 'Abierto' || i.severidad === 'Alta')) {
        return 'interruption';
      }
      if (dayIncidents.some(i => i.estado === 'Investigando' || i.severidad === 'Media')) {
        return 'problems';
      }
    }

    const dayChecks = this.healthChecks.filter(c => {
      if (c.serviceId !== serviceId) return false;
      const checkDate = new Date(c.fecha || c.fechaRevision);
      return checkDate.toDateString() === date.toDateString();
    });

    if (dayChecks.some(c => c.estado === 'Interrumpido')) return 'interruption';
    if (dayChecks.some(c => c.estado === 'Degradado' || c.estado === 'Impactado')) return 'problems';

    return 'operational';
  }

  getStatusLabel(status: DayHistory['status']): string {
    return {
      operational: 'Operacional',
      problems: 'Problemas',
      interruption: 'Interrupción'
    }[status];
  }

  getHistoryStartDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - (this.historyDays - 1));
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' });
  }

  getHistoryEndDate(): string {
    return new Date().toLocaleDateString('es-EC', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  // ========================================
  // TENDENCIAS Y GRÁFICOS
  // ========================================
  generateTrends() {
    console.log('generateTrends() llamado');
    console.log('servicesHistory:', this.servicesHistory);
    
    if (!this.servicesHistory.length) {
      console.warn('No hay historial de servicios');
      return;
    }
    
    const days = this.servicesHistory[0].history.length;
    const totalServices = this.servicesHistory.length;
    console.log('Generando tendencias: días=', days, 'servicios=', totalServices);
    this.trendData = [];
    
    for (let i = 0; i < days; i++) {
      let operational = 0;
      let problems = 0;
      let interruption = 0;
      
      this.servicesHistory.forEach(service => {
        const status = service.history[i].status;
        if (status === 'operational') operational++;
        if (status === 'problems') problems++;
        if (status === 'interruption') interruption++;
      });
      
      const availability = Math.round(
        (operational / totalServices) * 100
      );
      
      this.trendData.push({
        date: this.servicesHistory[0].history[i].date,
        operational,
        problems,
        interruption,
        availability
      });
    }
    
    this.renderCharts();
    this.cdr.detectChanges();
  }

  renderCharts() {
    // Validar que hay datos
    if (!this.trendData || this.trendData.length === 0) {
      console.warn('No hay datos de tendencias para renderizar', this.trendData);
      return;
    }

    console.log('Renderizando gráficas con datos:', this.trendData);
    
    const labels = this.trendData.map(d => d.date);
    
    // Esperar a que el canvas esté en el DOM
    setTimeout(() => {
      if (this.areaChart) this.areaChart.destroy();
      if (this.availabilityChart) this.availabilityChart.destroy();
    
    // GRÁFICO DE ÁREA APILADA - Distribución de Estados
    this.areaChart = new Chart('statusAreaChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Operacionales',
            data: this.trendData.map(d => d.operational),
            fill: true,
            backgroundColor: 'rgba(76, 175, 80, 0.6)',
            borderColor: 'rgba(56, 142, 60, 1)',
            borderWidth: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.3
          },
          {
            label: 'Con Problemas',
            data: this.trendData.map(d => d.problems),
            fill: true,
            backgroundColor: 'rgba(255, 193, 7, 0.6)',
            borderColor: 'rgba(255, 152, 0, 1)',
            borderWidth: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.3
          },
          {
            label: 'Interrupciones',
            data: this.trendData.map(d => d.interruption),
            fill: true,
            backgroundColor: 'rgba(244, 67, 54, 0.6)',
            borderColor: 'rgba(211, 47, 47, 1)',
            borderWidth: 0,
            pointRadius: 0,
            pointHoverRadius: 0,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: { 
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 13, weight: 'bold' },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
            titleMarginBottom: 8
          }
        },
        scales: {
          y: { 
            stacked: true,
            beginAtZero: true,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
              drawTicks: false
            },
            ticks: {
              font: { size: 12 },
              callback: (v) => v + '%'
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { size: 11 },
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    });

    // GRÁFICO DE LÍNEA - Disponibilidad General
    this.availabilityChart = new Chart('availabilityChart', {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Disponibilidad %',
            data: this.trendData.map(d => d.availability),
            fill: true,
            backgroundColor: 'rgba(33, 150, 243, 0.1)',
            borderColor: 'rgba(21, 101, 192, 1)',
            borderWidth: 3,
            pointRadius: 4,
            pointBackgroundColor: 'rgba(21, 101, 192, 1)',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointHoverRadius: 6,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 13, weight: 'bold' },
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.8)',
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 12 },
            padding: 12,
            cornerRadius: 8,
            titleMarginBottom: 8,
            callbacks: {
              label: (context) => {
                const value = context.parsed.y;
                return `Disponibilidad: ${value !== null && value !== undefined ? value.toFixed(2) : '0'}%`;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
              drawTicks: false
            },
            ticks: {
              font: { size: 12 },
              callback: (v) => v + '%'
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              font: { size: 11 },
              maxRotation: 45,
              minRotation: 45
            }
          }
        }
      }
    });
    }, 100); // Cierre del setTimeout
  }

  // ========================================
  // CALENDARIO
  // ========================================
  setActiveTab(tab: string) {
    this.activeTab = tab;
    if (tab === 'calendario') {
      this.generateCalendar();
      this.loadRecentIncidents();
    }
    if (tab === 'mantenimiento') {
      // Cargar datos de mantenimiento si es necesario
    }
    if (tab === 'tendencias') {
      // Usar setTimeout con mayor delay para asegurar que el DOM está listo
      setTimeout(() => {
        this.generateTrends();
        this.cdr.detectChanges();
      }, 300);
    }
  }

  getMonthName(m: number): string {
    return [
      'Enero','Febrero','Marzo','Abril','Mayo','Junio',
      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
    ][m];
  }

  previousMonth() {
    this.currentMonth === 0 ? (this.currentMonth = 11, this.currentYear--) : this.currentMonth--;
    this.generateCalendar();
  }

  nextMonth() {
    this.currentMonth === 11 ? (this.currentMonth = 0, this.currentYear++) : this.currentMonth++;
    this.generateCalendar();
  }

  generateCalendar() {
    const first = new Date(this.currentYear, this.currentMonth, 1);
    const last = new Date(this.currentYear, this.currentMonth + 1, 0);
    this.calendarDays = [];

    for (let i = 0; i < first.getDay(); i++) this.calendarDays.push({ date: null });

    for (let d = 1; d <= last.getDate(); d++) {
      const incident = this.getIncidentForDay(d);
      this.calendarDays.push({
        date: d,
        isToday: d === new Date().getDate(),
        hasIncident: !!incident,
        incident
      });
    }
  }

  getIncidentForDay(day: number): any {
    const matches = this.incidents.filter(i => {
      const d = new Date(i.fechaInicio);
      return d.getDate() === day &&
             d.getMonth() === this.currentMonth &&
             d.getFullYear() === this.currentYear;
    });

    if (!matches.length) return null;

    return {
      status: matches.some(i => i.estado === 'Abierto' || i.severidad === 'Alta')
        ? 'down'
        : 'warning'
    };
  }
}