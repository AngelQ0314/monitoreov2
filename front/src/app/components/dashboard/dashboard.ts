import { Component, OnInit, ChangeDetectorRef, AfterViewInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dashboard implements OnInit, AfterViewInit, OnDestroy {
  // ========================================
  // PROPIEDADES DE COMPONENTE
  // ========================================
  showSettings = false;
  showCreateService = false;
  showEditServiceModal = false;
  showDeleteServiceModal = false;
  selectedServiceToEdit: string = '';
  selectedServiceToDelete: string = '';
  activeTab: string = 'actual';
  
  // Intervalo para actualización automática
  private autoRefreshInterval: any = null;
  private maintenanceAlarmInterval: any = null;
  private checkedMaintenances = new Set<string>();
  maintenances: any[] = [];
  showSuccessNotification = false;
  successMessage = '';
  successNotificationTimeout: any = null;
  
  // Sistema de notificaciones
  showNotifications = false;
  activeNotifications: any[] = [];
  private previousServiceStates: Map<string, string> = new Map();
  private notificationIdCounter = 0;
  notificationsEnabled = true; // Control para activar/desactivar notificaciones
  
  // Sistema de alertas personalizadas
  showCustomAlert = false;
  customAlertMessage = '';
  customAlertType: 'info' | 'warning' | 'error' | 'success' = 'info';
  customAlertIcon = '';
  
  // Sistema de confirmación personalizada
  showCustomConfirm = false;
  customConfirmMessage = '';
  customConfirmTitle = '';
  customConfirmCallback: (() => void) | null = null;
  
  // ========================================
  // CARRUSEL DE SERVICIOS
  // ========================================
  carouselScrollPosition = 0;
  carouselItemsPerPage = 4;
  private userInteractingWithCarousel = false;
  private interactionTimeout: any = null;
  
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
  filtroChecksLimite: number = 100; // Límite de registros a cargar

  // ========================================
  // FILTROS HISTORIAL
  // ========================================
  filtroHistorialDesde: string = '';
  filtroHistorialHasta: string = '';
  filtroHistorialEstado: string = '';
  filtroHistorialImportancia: string = '';
  filtroHistorialCadena: string = '';
  filtroHistorialRestaurante: string = '';

  // ========================================
  // VISTA DEL HISTORIAL
  // ========================================
  historialViewMode: 'checks' | 'calendar' = 'checks';
  
  // Cache para optimizar rendimiento
  private _historyByServiceCache: any[] | null = null;
  private _lastHealthChecksLength: number = 0;
  private _lastFiltersHash: string = '';
  
  // Cache para calendario
  private _servicesForCalendarCache: any[] | null = null;
  private _lastCalendarServicesLength: number = 0;
  private _lastCalendarHealthChecksLength: number = 0;
  
  // Filtros activos aplicados (para refresh automático)
  private _appliedFilters: any = null;
  
  // Guardar posiciones de scroll de carruseles
  private _carouselScrollPositions: Map<number, number> = new Map();

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
  // PAGINACIÓN HISTORIAL
  // ========================================
  historyCurrentPage: number = 1;
  historyPerPage: number = 20;

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

  // Getter para datos del historial en formato para la vista
  get servicesHistoryData(): any[] {
    return this.servicesHistory
      .map(service => {
        // Calcular prioridad basada en estados problemáticos
        const interruptions = service.history.filter(d => d.status === 'interruption').length;
        const problems = service.history.filter(d => d.status === 'problems').length;
        const priority = interruptions * 1000 + problems * 10;

        return {
          nombre: service.name,
          serviceId: service.serviceId,
          priority,
          days: service.history.map(day => ({
            fecha: day.date,
            estado: day.status === 'operational' ? 'operando' :
                    day.status === 'problems' ? 'problemas' : 
                    day.status === 'interruption' ? 'interrupcion' : 'sin-datos',
            estadoLabel: day.statusLabel
          }))
        };
      })
      // Ordenar: primero los que tienen más interrupciones, luego más problemas
      .sort((a, b) => b.priority - a.priority);
  }

  get historyStartDate(): string {
    return this.getHistoryStartDate();
  }

  get historyEndDate(): string {
    return this.getHistoryEndDate();
  }

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
    this.loadMaintenances();
    
    // Iniciar actualización automática cada 10 segundos
    this.startAutoRefresh();
    
    // Iniciar verificación de alarmas de mantenimiento
    this.startMaintenanceAlarmChecker();
  }

  ngAfterViewInit() {
    this.subscribeToSettingsEvents();
    this.setupCarouselScrollListeners();
  }

  ngOnDestroy() {
    // Limpiar el intervalo al destruir el componente
    this.stopAutoRefresh();
    this.stopMaintenanceAlarmChecker();
  }
  
  // ========================================
  // CARRUSEL - CONFIGURACIÓN DE LISTENERS
  // ========================================
  setupCarouselScrollListeners() {
    // Esperar a que el DOM se renderice
    setTimeout(() => {
      const containers = document.querySelectorAll('[class*="carousel-container-"]');
      containers.forEach((container) => {
        container.addEventListener('scroll', () => {
          this.cdr.detectChanges();
        });
      });
    }, 500);
  }

  // ========================================
  // AUTO-REFRESH
  // ========================================
  startAutoRefresh() {
    // Actualizar Health Checks y mantenimientos cada 10 segundos
    this.autoRefreshInterval = setInterval(() => {
      this.refreshHealthChecks();
      this.loadMaintenances(); // Recargar mantenimientos para detectar nuevos
    }, 10000);
  }

  stopAutoRefresh() {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }

  // ========================================
  // VERIFICACIÓN DE ALARMAS DE MANTENIMIENTO
  // ========================================
  loadMaintenances() {
    this.apiService.getMaintenance().subscribe({
      next: (data: any[]) => {
        this.maintenances = (data || []).map((m: any) => ({
          ...m,
          serviceName: this.getServiceNameById(m.serviceId) || m.serviceId
        }));
        console.log('✅ Mantenimientos cargados en Dashboard:', this.maintenances.length);
        this.maintenances.forEach((m: any) => {
          if (m.fechaFin) {
            console.log(`   - "${m.titulo}" | Fin: ${m.fechaFin} | Estado: ${m.estado}`);
          }
        });
      },
      error: (err) => console.error('Error cargando mantenimientos:', err)
    });
  }

  startMaintenanceAlarmChecker() {
    // Verificar inmediatamente al iniciar
    setTimeout(() => {
      this.checkMaintenanceAlarms();
    }, 2000); // Esperar 2 segundos para que los datos se carguen
    
    // Verificar cada 5 segundos si algún mantenimiento ha terminado
    this.maintenanceAlarmInterval = setInterval(() => {
      this.checkMaintenanceAlarms();
    }, 5000);
  }

  stopMaintenanceAlarmChecker() {
    if (this.maintenanceAlarmInterval) {
      clearInterval(this.maintenanceAlarmInterval);
      this.maintenanceAlarmInterval = null;
    }
  }

  checkMaintenanceAlarms() {
    const now = new Date();
    console.log('🔔 Verificando alarmas de mantenimiento...', now.toLocaleString());
    console.log('📋 Mantenimientos cargados:', this.maintenances.length);
    
    this.maintenances.forEach((m: any) => {
      // Solo verificar mantenimientos que tengan fecha de fin y no estén finalizados
      if (m.fechaFin && m.estado !== 'Finalizado' && !this.checkedMaintenances.has(m._id)) {
        const endDate = new Date(m.fechaFin);
        
        console.log(`  📌 Mantenimiento "${m.titulo}": Fin programado ${endDate.toLocaleString()}`);
        console.log(`      ¿Ha terminado? now >= endDate: ${now >= endDate} (now: ${now.getTime()}, end: ${endDate.getTime()})`);
        
        // Si la fecha de fin ha pasado, mostrar notificación
        if (now >= endDate) {
          console.log(`  🚨 ¡DISPARANDO ALARMA para "${m.titulo}"!`);
          this.triggerMaintenanceFinishedNotification(m);
          this.checkedMaintenances.add(m._id);
        }
      }
    });
  }

  triggerMaintenanceFinishedNotification(maintenance: any) {
    // Agregar notificación con botón de acción
    this.addNotification(
      '⏰ Mantenimiento Finalizado',
      `El mantenimiento "${maintenance.titulo}" del servicio "${maintenance.serviceName || this.getServiceNameById(maintenance.serviceId)}" ha terminado.`,
      'warning',
      '⏰',
      [
        {
          label: '✓ Finalizar',
          callback: () => this.finishMaintenanceFromNotification(maintenance._id)
        }
      ],
      maintenance._id
    );
    
    // Abrir automáticamente el panel de notificaciones
    this.showNotifications = true;
    
    // Reproducir sonido de alarma
    this.playAlarmSound();
    
    this.cdr.detectChanges();
  }

  playAlarmSound() {
    try {
      const audioContext = new (window as any).AudioContext();
      const now = audioContext.currentTime;
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      
      oscillator.start(now);
      oscillator.stop(now + 0.5);
    } catch (e) {
      console.log('No se pudo reproducir sonido de alarma', e);
    }
  }

  refreshHealthChecks() {
    // Actualizar los datos sin re-renderizar todo
    this.apiService.getHealthChecks(this.filtroChecksLimite, this._appliedFilters).subscribe({
      next: (healthChecks) => {
        this.healthChecks = healthChecks || [];
        this.invalidateHistoryCache();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error actualizando Health Checks:', err);
      }
    });
  }
  
  // TrackBy para evitar re-renderizado completo del carrusel
  trackByHealthCheckId(index: number, check: any): any {
    return check._id || check.id || index;
  }
  
  // TrackBy para grupos de servicios en el historial
  trackByServiceGroup(index: number, group: any): string {
    return group.serviceId;
  }
  
  // TrackBy para servicios en el calendario
  trackByServiceName(index: number, service: any): string {
    return service.nombre;
  }
  
  // TrackBy para días en el calendario
  trackByDayDate(index: number, day: any): string {
    return day.date;
  }
  
  // Guardar posiciones de scroll de todos los carruseles
  private saveCarouselScrollPositions(): void {
    const containers = document.querySelectorAll('[class*="carousel-container-"]');
    containers.forEach((container: any) => {
      const classList = Array.from(container.classList) as string[];
      const carouselClass = classList.find((c: string) => c.startsWith('carousel-container-'));
      if (carouselClass && typeof carouselClass === 'string') {
        const index = parseInt(carouselClass.replace('carousel-container-', ''));
        this._carouselScrollPositions.set(index, container.scrollLeft);
      }
    });
  }
  
  // Restaurar posiciones de scroll guardadas
  private restoreCarouselScrollPositions(): void {
    this._carouselScrollPositions.forEach((scrollLeft, index) => {
      const container = document.querySelector(`.carousel-container-${index}`) as HTMLElement;
      if (container) {
        container.scrollLeft = scrollLeft;
      }
    });
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
      this.apiService.getHealthChecks(this.filtroChecksLimite).toPromise()
    ]).then(([services, incidents, healthChecks]) => {
      this.services = services || [];
      this.incidents = incidents || [];
      this.healthChecks = healthChecks || [];
      
      // Verificar cambios en el estado de servicios
      this.checkServiceChanges();
      
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

  toggleEditServiceModal() {
    this.showEditServiceModal = !this.showEditServiceModal;
    if (!this.showEditServiceModal) {
      this.selectedServiceToEdit = '';
    }
  }

  toggleDeleteServiceModal() {
    this.showDeleteServiceModal = !this.showDeleteServiceModal;
    if (!this.showDeleteServiceModal) {
      this.selectedServiceToDelete = '';
    }
  }

  openEditFromSettings() {
    this.showSettings = false;
    this.showEditServiceModal = true;
    this.selectedServiceToEdit = '';
    this.editingService = null;
    this.editingServiceId = null;
  }

  openDeleteFromSettings() {
    this.showSettings = false;
    this.showDeleteServiceModal = true;
    this.selectedServiceToDelete = '';
  }

  deleteServiceFromModal() {
    if (!this.selectedServiceToDelete) return;
    
    const service = this.services.find(s => s._id === this.selectedServiceToDelete);
    const serviceName = service?.nombre || 'Servicio';
    const serviceIdToDelete = this.selectedServiceToDelete;
    
    this.showConfirm(
      '¿Eliminar servicio?',
      `¿Estás seguro de que deseas eliminar "${serviceName}"? Esta acción se puede revertir desde "Ver servicios eliminados".`,
      () => {
        this.deleting = true;
        this.cdr.detectChanges();
        
        this.apiService.deleteService(serviceIdToDelete).subscribe({
          next: () => {
            this.deleting = false;
            this.showDeleteServiceModal = false;
            this.selectedServiceToDelete = '';
            
            this.successMessage = `🗑️ ${serviceName} eliminado correctamente`;
            this.showSuccessNotification = true;
            
            if (this.successNotificationTimeout) {
              clearTimeout(this.successNotificationTimeout);
            }
            this.successNotificationTimeout = setTimeout(() => {
              this.showSuccessNotification = false;
              this.cdr.detectChanges();
            }, 4000);
            
            // Recargar datos y forzar detección de cambios
            this.loadData();
            setTimeout(() => this.cdr.detectChanges(), 100);
          },
          error: (err) => {
            this.deleting = false;
            this.cdr.detectChanges();
            this.showAlert('Error al eliminar: ' + (err.message || 'Error desconocido'), 'error');
          }
        });
      }
    );
  }
  onServiceSelectChange() {
    if (!this.selectedServiceToEdit) {
      this.editingService = null;
      this.editingServiceId = null;
      return;
    }
    const service = this.services.find(s => s._id === this.selectedServiceToEdit);
    if (service) {
      this.startEdit(service);
    }
  }

  selectAndEditService() {
    if (!this.selectedServiceToEdit) return;
    const service = this.services.find(s => s._id === this.selectedServiceToEdit);
    if (service) {
      this.showEditServiceModal = false;
      this.selectedServiceToEdit = '';
      this.startEdit(service);
    }
  }

  saveEditFromModal() {
    if (!this.editingServiceId || this.savingEdit) return;
    this.savingEdit = true;
    const serviceName = this.editingService?.nombre || 'Servicio';
    const body = { ...this.editingService };
    
    this.apiService.updateService(this.editingServiceId, body).subscribe({
      next: () => {
        this.savingEdit = false;
        this.showEditServiceModal = false;
        this.editingServiceId = null;
        this.editingService = null;
        this.selectedServiceToEdit = '';
        
        // Mostrar notificación de éxito
        this.successMessage = `✅ ${serviceName} actualizado correctamente`;
        this.showSuccessNotification = true;
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        // Recargar datos y forzar detección de cambios
        this.loadData();
        setTimeout(() => this.cdr.detectChanges(), 100);
      },
      error: (err) => {
        this.savingEdit = false;
        this.cdr.detectChanges();
        this.showAlert('Error al guardar: ' + (err.message || 'Error desconocido'), 'error');
      }
    });
  }

  toggleSettings() {
    this.showSettings = !this.showSettings;
    if (this.showSettings) {
      setTimeout(() => this.subscribeSettingsSavedOnce(), 100);
    }
  }

  // ========================================
  // SISTEMA DE NOTIFICACIONES
  // ========================================
  toggleNotifications() {
    this.showNotifications = !this.showNotifications;
  }

  addNotification(title: string, message: string, severity: 'critical' | 'warning' | 'info', icon: string, actions?: any[], maintenanceId?: string) {
    const notification = {
      id: ++this.notificationIdCounter,
      title,
      message,
      severity,
      icon,
      timestamp: new Date(),
      actions: actions || [],
      maintenanceId: maintenanceId
    };
    
    // Agregar al inicio de la lista
    this.activeNotifications.unshift(notification);
    
    // Limitar a 50 notificaciones máximo
    if (this.activeNotifications.length > 50) {
      this.activeNotifications = this.activeNotifications.slice(0, 50);
    }
  }

  handleMaintenanceFinished(event: any) {
    // Agregar notificación con botón de acción
    this.addNotification(
      '⏰ Mantenimiento Finalizado',
      `El mantenimiento "${event.titulo}" del servicio "${event.serviceName}" ha terminado.`,
      'warning',
      '⏰',
      [
        {
          label: '✓ Finalizar',
          callback: () => this.finishMaintenanceFromNotification(event.id)
        }
      ],
      event.id // Pasar el ID del mantenimiento
    );
    
    // Abrir automáticamente el panel de notificaciones
    this.showNotifications = true;
  }

  finishMaintenanceFromNotification(maintenanceId: string) {
    this.apiService.updateMaintenance(maintenanceId, { 
      estado: 'Finalizado', 
      fechaFin: new Date().toISOString() 
    }).subscribe({
      next: () => {
        // Remover la notificación relacionada con este mantenimiento
        this.activeNotifications = this.activeNotifications.filter(
          n => n.maintenanceId !== maintenanceId
        );
        
        // Mostrar mensaje de éxito
        this.successMessage = '✅ Mantenimiento finalizado exitosamente';
        this.showSuccessNotification = true;
        
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        // Recargar datos
        this.loadData();
      },
      error: (err) => {
        console.error('Error finalizando mantenimiento', err);
        this.showAlert('Error al finalizar el mantenimiento', 'error');
      }
    });
  }

  dismissNotification(id: number) {
    this.activeNotifications = this.activeNotifications.filter(n => n.id !== id);
  }

  clearAllNotifications() {
    this.showCustomConfirm = true;
    this.customConfirmTitle = '🗑️ Limpiar Notificaciones';
    this.customConfirmMessage = '¿Estás seguro de que deseas limpiar todas las notificaciones?';
    this.customConfirmCallback = () => {
      this.activeNotifications = [];
    };
  }
  
  // ========================================
  // SISTEMA DE ALERTAS PERSONALIZADAS
  // ========================================
  showAlert(message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') {
    this.customAlertMessage = message;
    this.customAlertType = type;
    
    // Asignar icono según el tipo
    const icons = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      success: '✅'
    };
    this.customAlertIcon = icons[type];
    
    this.showCustomAlert = true;
  }
  
  closeAlert() {
    this.showCustomAlert = false;
  }
  
  showConfirm(title: string, message: string, callback: () => void) {
    this.customConfirmTitle = title;
    this.customConfirmMessage = message;
    this.customConfirmCallback = callback;
    this.showCustomConfirm = true;
  }
  
  confirmAction() {
    if (this.customConfirmCallback) {
      this.customConfirmCallback();
    }
    this.closeConfirm();
  }
  
  closeConfirm() {
    this.showCustomConfirm = false;
    this.customConfirmCallback = null;
    this.cdr.detectChanges();
  }

  checkServiceChanges() {
    // Si las notificaciones están desactivadas, solo actualizar estados sin crear notificaciones
    if (!this.notificationsEnabled) {
      this.services.forEach((service: any) => {
        this.previousServiceStates.set(service._id, service.estado);
      });
      return;
    }
    
    this.services.forEach((service: any) => {
      const previousState = this.previousServiceStates.get(service._id);
      const currentState = service.estado;
      const serviceName = service.nombre;
      
      // Si es la primera vez que vemos este servicio (carga inicial)
      if (!previousState) {
        // Notificar solo si está en estado problemático
        if (currentState === 'Interrumpido') {
          this.addNotification(
            '🚨 Servicio Interrumpido',
            `${serviceName} está interrumpido`,
            'critical',
            '❌'
          );
        }
        else if (currentState === 'Impactado') {
          this.addNotification(
            '⚠️ Servicio Impactado',
            `${serviceName} está experimentando problemas`,
            'warning',
            '⚠️'
          );
        }
        else if (currentState === 'Degradado') {
          this.addNotification(
            '⚡ Servicio Degradado',
            `${serviceName} tiene rendimiento reducido`,
            'warning',
            '⚡'
          );
        }
      }
      // Si hay un cambio de estado
      else if (previousState !== currentState) {
        // Servicio interrumpido
        if (currentState === 'Interrumpido') {
          this.addNotification(
            '🚨 Servicio Interrumpido',
            `${serviceName} ha dejado de funcionar`,
            'critical',
            '❌'
          );
        }
        // Servicio impactado
        else if (currentState === 'Impactado') {
          this.addNotification(
            '⚠️ Servicio Impactado',
            `${serviceName} está experimentando problemas`,
            'warning',
            '⚠️'
          );
        }
        // Servicio degradado
        else if (currentState === 'Degradado') {
          this.addNotification(
            '⚡ Servicio Degradado',
            `${serviceName} tiene rendimiento reducido`,
            'warning',
            '⚡'
          );
        }
        // Servicio recuperado
        else if (currentState === 'Operando normalmente' && 
                 (previousState === 'Interrumpido' || previousState === 'Impactado' || previousState === 'Degradado')) {
          this.addNotification(
            '✅ Servicio Recuperado',
            `${serviceName} ha vuelto a la normalidad`,
            'info',
            '✅'
          );
        }
      }
      
      // Actualizar estado anterior
      this.previousServiceStates.set(service._id, currentState);
    });
  }

  toggleNotificationsEnabled() {
    this.notificationsEnabled = !this.notificationsEnabled;
    
    if (!this.notificationsEnabled) {
      // Opcional: limpiar notificaciones existentes cuando se desactivan
      // this.activeNotifications = [];
    }
  }

  createService() {
    if (this.creating) return;
    
    // Validar campos requeridos (deben coincidir con validaciones del backend)
    if (!this.newService.nombre?.trim()) {
      this.showAlert('❌ El nombre del servicio es requerido', 'error');
      return;
    }
    if (!this.newService.endpoint?.url?.trim()) {
      this.showAlert('❌ La URL del endpoint es requerida', 'error');
      return;
    }
    if (!this.newService.clasificacion?.cadena?.trim()) {
      this.showAlert('❌ La Cadena es un campo requerido', 'error');
      return;
    }
    if (!this.newService.clasificacion?.restaurante?.trim()) {
      this.showAlert('❌ El Restaurante es un campo requerido', 'error');
      return;
    }
    
    // Validar URL
    try {
      const url = new URL(this.newService.endpoint.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        this.showAlert('❌ La URL debe usar protocolo HTTP o HTTPS', 'error');
        return;
      }
    } catch {
      this.showAlert('❌ La URL proporcionada no es válida', 'error');
      return;
    }
    
    const serviceName = this.newService.nombre;
    const serviceData = { ...this.newService }; // Copia para enviar
    
    // Cerrar modal y mostrar notificación INMEDIATAMENTE (optimistic UI)
    this.creating = true;
    this.showCreateService = false;
    this.successMessage = `✅ Creando servicio "${serviceName}"...`;
    this.showSuccessNotification = true;
    
    // Limpiar formulario inmediatamente
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
    this.cdr.detectChanges();
    
    this.apiService.createService(serviceData).subscribe({
      next: (res) => {
        this.creating = false;
        
        // Actualizar notificación a éxito
        this.successMessage = `✅ Servicio "${serviceName}" creado exitosamente`;
        
        // Agregar el nuevo servicio al array
        this.services.unshift(res);
        this.calculateResumen();
        this.invalidateHistoryCache();
        this.cdr.detectChanges();
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
      },
      error: (err) => {
        this.creating = false;
        this.showSuccessNotification = false;
        console.error('Error creando servicio', err);
        
        // Extraer mensaje de error específico del backend
        let errorMessage = '❌ Error al crear el servicio';
        if (err.error && err.error.message) {
          errorMessage = `❌ ${err.error.message}`;
        } else if (err.message) {
          errorMessage = `❌ ${err.message}`;
        } else if (err.status === 0) {
          errorMessage = '❌ No se puede conectar al servidor';
        } else if (err.status === 500) {
          errorMessage = '❌ Error interno del servidor';
        }
        
        this.cdr.detectChanges();
        this.showAlert(errorMessage, 'error');
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
        this.showAlert('Error al actualizar el servicio. Intenta de nuevo.', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  deleteService(id: string, nombreServicio: string = '') {
    this.showConfirm('🗑️ Eliminar Servicio', `¿Estás seguro de que deseas eliminar este servicio?`, () => {
      this.executeDeleteService(id);
    });
  }
  
  executeDeleteService(id: string) {
    if (this.deleting) return;
    this.deleting = true;
    
    // Eliminar inmediatamente de la lista para feedback visual
    const indexToRemove = this.services.findIndex((s: any) => s._id === id);
    const removedService = indexToRemove >= 0 ? this.services[indexToRemove] : null;
    const serviceName = removedService?.nombre || 'Servicio';
    
    if (indexToRemove >= 0) {
      this.services.splice(indexToRemove, 1);
    }
    
    this.apiService.deleteService(id).subscribe({
      next: () => {
        this.deleting = false;
        
        // Mostrar notificación de éxito
        this.successMessage = `✅ "${serviceName}" eliminado exitosamente`;
        this.showSuccessNotification = true;
        
        // Auto-ocultar la notificación después de 4 segundos
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        // Recargar datos desde el servidor inmediatamente
        this.loadData();
      },
      error: (err) => {
        this.deleting = false;
        console.error('Error eliminando servicio', err);
        
        // Restaurar en la lista si falla
        if (removedService && indexToRemove >= 0) {
          this.services.splice(indexToRemove, 0, removedService);
        }
        this.showAlert('Error al eliminar el servicio. Intenta de nuevo.', 'error');
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
      this.showAlert('Selecciona servicio y escribe un título', 'warning');
      return;
    }
    const payload = { ...this.newIncident };
    const serviceName = this.getServiceNameById(this.newIncident.serviceId);
    
    // Crear objeto temporal para mostrar inmediatamente
    const tempIncident = {
      _id: 'temp-' + Date.now(),
      ...payload,
      fechaInicio: new Date().toISOString(),
      actualizaciones: [],
      fechaResolucion: null
    };
    
    // Agregar inmediatamente a la lista
    this.incidents.unshift(tempIncident);
    this.cdr.detectChanges();
    
    this.apiService.createIncident(payload).subscribe({
      next: (res) => {
        // Reemplazar el temporal con el real
        const tempIndex = this.incidents.findIndex(i => i._id === tempIncident._id);
        if (tempIndex >= 0) {
          this.incidents[tempIndex] = res;
        }
        
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
        
        // Recargar datos para sincronizar con el servidor
        this.loadData();
      },
      error: (err) => {
        // Remover el incidente temporal si falla
        const tempIndex = this.incidents.findIndex(i => i._id === tempIncident._id);
        if (tempIndex >= 0) {
          this.incidents.splice(tempIndex, 1);
        }
        this.cdr.detectChanges();
        
        console.error('Error creando incidente', err);
        
        // Extraer mensaje de error específico del backend
        let errorMessage = 'Error al crear el incidente';
        if (err.error && err.error.message) {
          errorMessage = err.error.message;
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        this.showAlert(errorMessage, 'error');
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
      this.showAlert('Selecciona un incidente para eliminar', 'warning');
      return;
    }
    
    const removedIncident = this.incidents.find((i: any) => i._id === this.selectedIncidentToDelete);
    const incidentName = removedIncident?.titulo || 'este incidente';
    
    this.showConfirm('🗑️ Eliminar Incidente', `¿Estás seguro de que deseas eliminar "${incidentName}"?`, () => {
      this.executeDeleteIncident();
    });
  }
  
  executeDeleteIncident() {
    this.deletingIncident = true;
    
    // Encontrar y remover inmediatamente de la lista
    const indexToRemove = this.incidents.findIndex((i: any) => i._id === this.selectedIncidentToDelete);
    const removedIncident = indexToRemove >= 0 ? this.incidents[indexToRemove] : null;
    const incidentName = removedIncident?.titulo || 'Incidente';
    const incidentIdToDelete = this.selectedIncidentToDelete;
    
    if (indexToRemove >= 0) {
      this.incidents.splice(indexToRemove, 1);
    }
    
    // Cerrar modal inmediatamente
    this.showDeleteIncident = false;
    this.deletingIncident = false;
    this.selectedIncidentToDelete = '';
    this.cdr.detectChanges();
    
    // Mostrar notificación de éxito de inmediato
    this.successMessage = `✅ "${incidentName}" eliminado exitosamente`;
    this.showSuccessNotification = true;
    
    // Auto-ocultar la notificación después de 4 segundos
    if (this.successNotificationTimeout) {
      clearTimeout(this.successNotificationTimeout);
    }
    this.successNotificationTimeout = setTimeout(() => {
      this.showSuccessNotification = false;
      this.cdr.detectChanges();
    }, 4000);
    
    this.apiService.deleteIncident(incidentIdToDelete).subscribe({
      next: (res) => {
        // Sincronizar con el servidor
        this.loadData();
      },
      error: (err) => {
        console.error('Error eliminando incidente', err);
        
        // Restaurar en la lista si falla
        if (removedIncident && indexToRemove >= 0) {
          this.incidents.splice(indexToRemove, 0, removedIncident);
        }
        
        // Actualizar mensaje de error
        this.successMessage = '❌ Error al eliminar el incidente';
        this.showSuccessNotification = true;
        
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        this.cdr.detectChanges();
      }
    });
  }

  resolveIncident(id: string) {
    this.showConfirm('✅ Resolver Incidente', '¿Marcar este incidente como resuelto?', () => {
      this.executeResolveIncident(id);
    });
  }
  
  executeResolveIncident(id: string) {
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
        this.showAlert('Error al resolver el incidente. Intenta de nuevo.', 'error');
      }
    });
  }

  deleteIncident(id: string) {
    this.showConfirm('🗑️ Eliminar Incidente', '¿Estás seguro de que deseas eliminar este incidente?', () => {
      this.executeDirectDeleteIncident(id);
    });
  }
  
  executeDirectDeleteIncident(id: string) {
    this.apiService.deleteIncident(id).subscribe({
      next: () => this.loadData(),
      error: (err) => {
        console.error('Error eliminando incidente', err);
        this.showAlert('No se pudo eliminar el incidente', 'error');
      }
    });
  }

  confirmDeleteAllIncidents() {
    if (this.incidents.length === 0) {
      this.showAlert('No hay incidentes para eliminar', 'info');
      return;
    }

    const confirmMessage = `Se eliminarán ${this.incidents.length} incidente${this.incidents.length === 1 ? '' : 's'} de forma permanente.\n\nEsta acción no se puede deshacer.`;
    
    this.showConfirm('🗑️ Eliminación Total', confirmMessage, () => {
      this.deleteAllIncidents();
    });
  }

  deleteAllIncidents() {
    const totalIncidents = this.incidents.length;
    const incidentsCopy = [...this.incidents];
    
    // Limpiar la lista inmediatamente
    this.incidents = [];
    this.cdr.detectChanges();
    
    // Mostrar notificación de éxito de inmediato
    this.successMessage = `✅ Se eliminaron ${totalIncidents} incidente${totalIncidents === 1 ? '' : 's'} exitosamente`;
    this.showSuccessNotification = true;
    
    // Auto-ocultar la notificación después de 4 segundos
    if (this.successNotificationTimeout) {
      clearTimeout(this.successNotificationTimeout);
    }
    this.successNotificationTimeout = setTimeout(() => {
      this.showSuccessNotification = false;
      this.cdr.detectChanges();
    }, 4000);
    
    this.apiService.deleteAllIncidents().subscribe({
      next: (result: any) => {
        // Sincronizar con el servidor
        this.loadData();
      },
      error: (err) => {
        console.error('Error eliminando todos los incidentes', err);
        
        // Restaurar incidentes si falla
        this.incidents = incidentsCopy;
        
        // Actualizar mensaje de error
        this.successMessage = '❌ Error al eliminar los incidentes';
        this.showSuccessNotification = true;
        
        if (this.successNotificationTimeout) {
          clearTimeout(this.successNotificationTimeout);
        }
        this.successNotificationTimeout = setTimeout(() => {
          this.showSuccessNotification = false;
          this.cdr.detectChanges();
        }, 4000);
        
        this.cdr.detectChanges();
      }
    });
  }

  onMaintenanceSaved() {
    // Cuando se guarda un mantenimiento, recargar datos y recalcular estadísticas del calendario
    this.loadData();
    this.loadMaintenances(); // Recargar mantenimientos para las alarmas
    
    // Verificar alarmas después de recargar (con un pequeño delay para que los datos se actualicen)
    setTimeout(() => {
      this.checkMaintenanceAlarms();
    }, 500);
    
    // Dar un pequeño delay para que el componente hijo actualice sus datos
    setTimeout(() => {
      this.calculateMonthlyStatistics();
      this.cdr.detectChanges();
    }, 200);
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

  // ========================================
  // CARRUSEL (usado en historial)
  // ========================================
  
  scrollCarousel(groupIndex: number, direction: 'left' | 'right') {
    const container = document.querySelector(`.carousel-container-${groupIndex}`) as HTMLElement;
    if (!container) return;
    
    // Marcar que el usuario está interactuando
    this.userInteractingWithCarousel = true;
    
    // Limpiar timeout anterior
    if (this.interactionTimeout) {
      clearTimeout(this.interactionTimeout);
    }
    
    const cardWidth = 300; // Ancho de cada tarjeta + gap para historial
    const scrollAmount = cardWidth * this.carouselItemsPerPage;
    
    if (direction === 'left') {
      container.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
      container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    
    // Forzar detección de cambios después del scroll
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 300);
    
    // Resetear el flag después de 3 segundos de inactividad
    this.interactionTimeout = setTimeout(() => {
      this.userInteractingWithCarousel = false;
    }, 3000);
  }
  
  canScrollLeft(groupIndex: number): boolean {
    const container = document.querySelector(`.carousel-container-${groupIndex}`) as HTMLElement;
    if (!container) return false;
    // Siempre permitir scroll si hay contenido suficiente
    return container.scrollLeft > 5;
  }
  
  canScrollRight(groupIndex: number): boolean {
    const container = document.querySelector(`.carousel-container-${groupIndex}`) as HTMLElement;
    if (!container) return false;
    // Permitir scroll derecho si hay más contenido
    const maxScroll = container.scrollWidth - container.clientWidth;
    return container.scrollLeft < (maxScroll - 5);
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

  // ========================================
  // HISTORIAL - HEALTH CHECKS ORDENADOS POR PRIORIDAD
  // ========================================
  
  // Obtiene los health checks filtrados y ordenados por prioridad (Interrumpido > Impactado > Degradado > Operando)
  get historyHealthChecksSorted(): any[] {
    let list = this.healthChecks || [];
    
    // Filtrar solo servicios activos
    const activeServiceIds = new Set((this.services || []).filter(s => s.activo !== false).map(s => s._id));
    list = list.filter(h => activeServiceIds.has(h.serviceId));
    
    // Aplicar filtro de estado
    if (this.filtroHistorialEstado) {
      const f = this.filtroHistorialEstado.toLowerCase();
      list = list.filter(h => (h.estado || '').toLowerCase().indexOf(f) !== -1);
    }

    // Aplicar filtro de importancia
    if (this.filtroHistorialImportancia) {
      const fImp = this.filtroHistorialImportancia.toLowerCase();
      list = list.filter(h => ((h.importancia || '').toLowerCase() === fImp));
    }

    // Aplicar filtro de cadena
    if (this.filtroHistorialCadena) {
      const fCad = this.filtroHistorialCadena.toLowerCase();
      list = list.filter(h => (h.cadena || '').toLowerCase().includes(fCad));
    }

    // Aplicar filtro de restaurante
    if (this.filtroHistorialRestaurante) {
      const fRest = this.filtroHistorialRestaurante.toLowerCase();
      list = list.filter(h => (h.restaurante || '').toLowerCase().includes(fRest));
    }

    // Filtrar por rango de fechas
    if (this.filtroHistorialDesde || this.filtroHistorialHasta) {
      list = list.filter(h => {
        const fechaRevision = h.fecha || h.fechaRevision || h.fechaCreacion || h.createdAt;
        if (!fechaRevision) return false;
        
        const fechaCheck = new Date(fechaRevision);
        
        if (this.filtroHistorialDesde) {
          const desde = new Date(this.filtroHistorialDesde + 'T00:00:00');
          if (fechaCheck < desde) return false;
        }
        
        if (this.filtroHistorialHasta) {
          const hasta = new Date(this.filtroHistorialHasta + 'T23:59:59');
          if (fechaCheck > hasta) return false;
        }
        
        return true;
      });
    }

    // Ordenar por prioridad de estado
    const priorityOrder: { [key: string]: number } = {
      'Interrumpido': 1,
      'Impactado': 2,
      'Degradado': 3,
      'Operando normalmente': 4
    };
    
    list = list.sort((a, b) => {
      const priorityA = priorityOrder[a.estado] || 5;
      const priorityB = priorityOrder[b.estado] || 5;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      // Si tienen la misma prioridad, ordenar por fecha más reciente
      const dateA = new Date(a.fechaRevision || a.fecha || 0).getTime();
      const dateB = new Date(b.fechaRevision || b.fecha || 0).getTime();
      return dateB - dateA;
    });
    
    return list;
  }

  // Método para limpiar filtros del historial
  limpiarFiltrosHistorial(): void {
    this.filtroHistorialDesde = '';
    this.filtroHistorialHasta = '';
    this.filtroHistorialEstado = '';
    this.filtroHistorialImportancia = '';
    this.filtroHistorialCadena = '';
    this.filtroHistorialRestaurante = '';
    this._appliedFilters = null; // Limpiar filtros guardados
    this.invalidateHistoryCache();
    this.cdr.detectChanges();
  }
  
  // Invalida el cache cuando cambian los datos o filtros
  private invalidateHistoryCache(): void {
    this._historyByServiceCache = null;
    this._lastHealthChecksLength = 0;
    this._lastFiltersHash = '';
    // También invalidar cache del calendario ya que depende de los mismos datos
    this.invalidateCalendarCache();
  }

  // Método para aplicar filtros del historial
  aplicarFiltrosHistorial(): void {
    this.historyCurrentPage = 1;
    this.invalidateHistoryCache();
    
    // Calcular límite necesario basado en filtros de fecha
    let limiteNecesario = 100; // Límite por defecto
    
    if (this.filtroHistorialDesde || this.filtroHistorialHasta) {
      // Si hay filtro de fechas, calcular cuántos registros necesitamos
      const ahora = new Date();
      let fechaDesde = this.filtroHistorialDesde ? new Date(this.filtroHistorialDesde) : new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
      let fechaHasta = this.filtroHistorialHasta ? new Date(this.filtroHistorialHasta) : ahora;
      
      // Calcular días entre fechas
      const diasRango = Math.ceil((fechaHasta.getTime() - fechaDesde.getTime()) / (24 * 60 * 60 * 1000));
      
      // Estimar registros necesarios: ~100 checks por día (ajustable según tu caso)
      // Si el rango es muy grande, limitar a 10000 para no sobrecargar
      limiteNecesario = Math.min(Math.max(diasRango * 100, 500), 10000);
    }
    
    // Preparar filtros para enviar al backend
    const filters: any = {};
    if (this.filtroHistorialDesde) filters.desde = this.filtroHistorialDesde;
    if (this.filtroHistorialHasta) filters.hasta = this.filtroHistorialHasta;
    if (this.filtroHistorialEstado && this.filtroHistorialEstado !== 'Todos') filters.estado = this.filtroHistorialEstado;
    if (this.filtroHistorialImportancia && this.filtroHistorialImportancia !== 'Todas') filters.importancia = this.filtroHistorialImportancia;
    if (this.filtroHistorialCadena) filters.cadena = this.filtroHistorialCadena;
    if (this.filtroHistorialRestaurante) filters.restaurante = this.filtroHistorialRestaurante;
    
    // Guardar filtros para uso en refresh automático
    this._appliedFilters = Object.keys(filters).length > 0 ? filters : null;
    
    // Si necesitamos más datos de los que tenemos cargados, recargar
    if (limiteNecesario > this.filtroChecksLimite || Object.keys(filters).length > 0) {
      this.filtroChecksLimite = Math.max(limiteNecesario, this.filtroChecksLimite);
      this.apiService.getHealthChecks(this.filtroChecksLimite, filters).subscribe({
        next: (healthChecks) => {
          this.healthChecks = healthChecks || [];
          this.invalidateHistoryCache();
          this.cdr.detectChanges();
          // Forzar actualización de botones de carrusel después de renderizar
          setTimeout(() => {
            this.cdr.detectChanges();
          }, 100);
        },
        error: (err) => {
          console.error('Error cargando Health Checks:', err);
        }
      });
    } else {
      this.invalidateHistoryCache();
      this.cdr.detectChanges();
      // Forzar actualización de botones de carrusel
      setTimeout(() => {
        this.cdr.detectChanges();
      }, 100);
    }
  }

  get historyHealthChecks(): any[] {
    const list = this.historyHealthChecksSorted;
    const start = (this.historyCurrentPage - 1) * this.historyPerPage;
    const end = start + this.historyPerPage;
    return list.slice(start, end);
  }

  get totalHistoryPages(): number {
    return Math.ceil(this.historyHealthChecksSorted.length / this.historyPerPage) || 1;
  }

  // Agrupa los health checks por estado para mostrar con títulos
  get historyByStatus(): { interrumpido: any[], impactado: any[], degradado: any[], operando: any[] } {
    const list = this.historyHealthChecksSorted;
    return {
      interrumpido: list.filter(h => h.estado === 'Interrumpido'),
      impactado: list.filter(h => h.estado === 'Impactado'),
      degradado: list.filter(h => h.estado === 'Degradado'),
      operando: list.filter(h => h.estado === 'Operando normalmente')
    };
  }

  // Agrupa los health checks por servicio para el carrusel del historial
  get historyByService(): Array<{ 
    serviceId: string, 
    serviceName: string, 
    checks: any[],
    latestStatus: string,
    statusIcon: string
  }> {
    // Calcular hash de filtros para detectar cambios
    const filtersHash = `${this.filtroHistorialEstado}_${this.filtroHistorialImportancia}_${this.filtroHistorialCadena}_${this.filtroHistorialRestaurante}_${this.filtroHistorialDesde}_${this.filtroHistorialHasta}`;
    
    // Verificar si podemos usar el cache
    if (this._historyByServiceCache && 
        this._lastHealthChecksLength === (this.healthChecks?.length || 0) &&
        this._lastFiltersHash === filtersHash) {
      return this._historyByServiceCache;
    }
    
    // Obtener todos los health checks - el backend ya los filtró
    let list = this.healthChecks || [];
    
    // Solo filtrar servicios activos (esto no lo hace el backend)
    const activeServiceIds = new Set((this.services || []).filter(s => s.activo !== false).map(s => s._id));
    list = list.filter(h => activeServiceIds.has(h.serviceId));
    
    // NO aplicar filtros aquí - el backend ya los aplicó cuando se cargaron los datos
    // Los filtros de estado, importancia, cadena, restaurante y fechas ya fueron aplicados en el servidor
    
    const groupedMap = new Map<string, any[]>();
    
    // Agrupar por serviceId
    list.forEach(check => {
      const serviceId = check.serviceId;
      if (!groupedMap.has(serviceId)) {
        groupedMap.set(serviceId, []);
      }
      groupedMap.get(serviceId)!.push(check);
    });
    
    // Convertir a array y agregar información del servicio
    const result = Array.from(groupedMap.entries()).map(([serviceId, checks]) => {
      const serviceName = this.getServiceNameById(serviceId);
      
      // Ordenar checks por fecha (más recientes primero)
      checks.sort((a, b) => {
        const dateA = new Date(a.fechaRevision || a.fecha || 0).getTime();
        const dateB = new Date(b.fechaRevision || b.fecha || 0).getTime();
        return dateB - dateA;
      });
      
      // Limitar a máximo 50 checks por servicio para mejorar rendimiento
      const limitedChecks = checks.slice(0, 50);
      
      const latestCheck = checks[0];
      const latestStatus = latestCheck?.estado || 'Desconocido';
      
      // Determinar icono según el estado más reciente
      let statusIcon = '⚪';
      if (latestStatus === 'Interrumpido') statusIcon = '🔴';
      else if (latestStatus === 'Impactado') statusIcon = '🟠';
      else if (latestStatus === 'Degradado') statusIcon = '🟡';
      else if (latestStatus === 'Operando normalmente') statusIcon = '🟢';
      
      return {
        serviceId,
        serviceName,
        checks: limitedChecks,
        latestStatus,
        statusIcon
      };
    });
    
    // Ordenar por prioridad de estado (peores primero)
    const priorityOrder: { [key: string]: number } = {
      'Interrumpido': 1,
      'Impactado': 2,
      'Degradado': 3,
      'Operando normalmente': 4
    };
    
    const sorted = result.sort((a, b) => {
      const priorityA = priorityOrder[a.latestStatus] || 5;
      const priorityB = priorityOrder[b.latestStatus] || 5;
      return priorityA - priorityB;
    });
    
    // Guardar en cache
    this._historyByServiceCache = sorted;
    this._lastHealthChecksLength = this.healthChecks?.length || 0;
    this._lastFiltersHash = filtersHash;
    
    return sorted;
  }

  // ========================================
  // VISTA DE CALENDARIO POR DÍAS
  // ========================================
  get servicesForCalendar(): any[] {
    // Verificar si podemos usar el cache
    const currentServicesLength = (this.services || []).filter(s => s.activo !== false).length;
    const currentHealthChecksLength = this.healthChecks?.length || 0;
    
    if (this._servicesForCalendarCache && 
        this._lastCalendarServicesLength === currentServicesLength &&
        this._lastCalendarHealthChecksLength === currentHealthChecksLength) {
      return this._servicesForCalendarCache;
    }
    
    const days = 30; // Últimos 30 días
    
    // Pre-procesar health checks por serviceId y fecha para evitar búsquedas O(n) repetidas
    const checksMap = new Map<string, Map<string, any[]>>();
    (this.healthChecks || []).forEach(check => {
      const serviceId = check.serviceId;
      const checkDate = new Date(check.fechaRevision || check.fecha);
      const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      
      if (!checksMap.has(serviceId)) {
        checksMap.set(serviceId, new Map());
      }
      const serviceDates = checksMap.get(serviceId)!;
      if (!serviceDates.has(dateStr)) {
        serviceDates.set(dateStr, []);
      }
      serviceDates.get(dateStr)!.push(check);
    });

    const result = (this.services || [])
      .filter(s => s.activo !== false)
      .map(service => {
        const dayStatuses = [];
        const serviceChecks = checksMap.get(service._id);
        
        // Recorrer de hoy hacia atrás (izquierda = hoy, derecha = hace 30 días)
        for (let i = 0; i < days; i++) {
          const currentDate = new Date();
          currentDate.setDate(currentDate.getDate() - i);
          const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
          
          // Buscar checks pre-indexados
          const checksForDay = serviceChecks?.get(dateStr) || [];
          
          // Determinar el peor estado del día
          let dayStatus = null;
          if (checksForDay.length > 0) {
            if (checksForDay.some(c => c.estado === 'Interrumpido')) {
              dayStatus = 'Interrumpido';
            } else if (checksForDay.some(c => c.estado === 'Impactado')) {
              dayStatus = 'Impactado';
            } else if (checksForDay.some(c => c.estado === 'Degradado')) {
              dayStatus = 'Degradado';
            } else {
              dayStatus = 'Operando normalmente';
            }
          }
          
          dayStatuses.push({
            date: dateStr,
            status: dayStatus
          });
        }
        
        return {
          nombre: service.nombre,
          days: dayStatuses
        };
      });
    
    // Guardar en cache
    this._servicesForCalendarCache = result;
    this._lastCalendarServicesLength = currentServicesLength;
    this._lastCalendarHealthChecksLength = currentHealthChecksLength;
    
    return result;
  }
  
  // Invalida el cache del calendario cuando cambian los datos
  private invalidateCalendarCache(): void {
    this._servicesForCalendarCache = null;
    this._lastCalendarServicesLength = 0;
    this._lastCalendarHealthChecksLength = 0;
  }

  getCalendarStartDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return date;
  }

  getCalendarEndDate(): Date {
    return new Date();
  }

  switchHistorialView(mode: 'checks' | 'calendar'): void {
    this.historialViewMode = mode;
    
    // Si cambia a vista de calendario, cargar más datos
    if (mode === 'calendar' && this.filtroChecksLimite < 5000) {
      this.filtroChecksLimite = 5000;
      this.apiService.getHealthChecks(this.filtroChecksLimite).subscribe({
        next: (healthChecks) => {
          this.healthChecks = healthChecks || [];
          this.invalidateHistoryCache();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error cargando Health Checks para calendario:', err);
        }
      });
    } else if (mode === 'checks' && this.filtroChecksLimite > 100) {
      // Si vuelve a vista normal, restaurar límite original
      this.filtroChecksLimite = 100;
      this.apiService.getHealthChecks(this.filtroChecksLimite).subscribe({
        next: (healthChecks) => {
          this.healthChecks = healthChecks || [];
          this.invalidateHistoryCache();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error cargando Health Checks:', err);
        }
      });
    } else {
      this.cdr.detectChanges();
    }
  }

  prevHistoryPage(): void {
    if (this.historyCurrentPage > 1) {
      this.historyCurrentPage--;
      this.cdr.detectChanges();
    }
  }

  nextHistoryPage(): void {
    if (this.historyCurrentPage < this.totalHistoryPages) {
      this.historyCurrentPage++;
      this.cdr.detectChanges();
    }
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

  getVisiblePages(): (number | string)[] {
    const total = this.totalHealthPages;
    const current = this.currentPage;
    const pages: (number | string)[] = [];
    
    if (total <= 20) {
      // Si hay 20 o menos páginas, mostrar todas
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Siempre mostrar las primeras páginas hasta la 20 si estamos cerca del inicio
      if (current <= 10) {
        for (let i = 1; i <= 20; i++) {
          pages.push(i);
        }
        pages.push('...', total);
      } else if (current >= total - 9) {
        // Si estamos cerca del final
        pages.push(1, '...');
        for (let i = total - 19; i <= total; i++) {
          pages.push(i);
        }
      } else {
        // Si estamos en el medio
        pages.push(1, '...');
        for (let i = current - 3; i <= current + 3; i++) {
          pages.push(i);
        }
        pages.push('...', total);
      }
    }
    
    return pages;
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