import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class SettingsComponent implements OnInit {
  model: any = {
    intervalHighS: 60,
    intervalMediumS: 300,
    intervalLowS: 600,
    jitterMaxS: 12,
    autoIncidentCreation: true,
  };

  saving = false;
  message = '';
  showDeletedServices = false;
  deletedServices: any[] = [];
  restoring = false;
  deleting = false;
  
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
  
  @Output() onSaved: EventEmitter<any> = new EventEmitter();
  @Output() onOpenDeleted: EventEmitter<any> = new EventEmitter();
  @Output() onCreateService: EventEmitter<any> = new EventEmitter();
  @Output() onEditService: EventEmitter<any> = new EventEmitter();
  @Output() onDeleteService: EventEmitter<any> = new EventEmitter();

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.getSettings().subscribe(s => {
      if (s) {
        this.model.intervalHighS = s.intervalHighS ?? this.model.intervalHighS;
        this.model.intervalMediumS = s.intervalMediumS ?? this.model.intervalMediumS;
        this.model.intervalLowS = s.intervalLowS ?? this.model.intervalLowS;
        this.model.jitterMaxS = s.jitterMaxS ?? this.model.jitterMaxS;
        this.model.autoIncidentCreation = s.autoIncidentCreation !== undefined ? s.autoIncidentCreation : this.model.autoIncidentCreation;
      }
    });
  }

  save() {
    this.saving = true;
    this.api.updateSettings(this.model).subscribe({
      next: (res) => { 
        this.saving = false; 
        this.message = 'Guardado'; 
        // actualizar modelo con los valores devueltos por el servidor
        if (res) {
          // reasignar propiedades conocidas para mantener bindings
          this.model.healthCheckOperandoS = res.healthCheckOperandoS ?? this.model.healthCheckOperandoS;
          this.model.healthCheckDegradadoS = res.healthCheckDegradadoS ?? this.model.healthCheckDegradadoS;
          this.model.intervalHighS = res.intervalHighS ?? this.model.intervalHighS;
          this.model.intervalMediumS = res.intervalMediumS ?? this.model.intervalMediumS;
          this.model.intervalLowS = res.intervalLowS ?? this.model.intervalLowS;
          this.model.jitterMaxS = res.jitterMaxS ?? this.model.jitterMaxS;
          this.model.timeoutMs = res.timeoutMs ?? this.model.timeoutMs;
          this.model.autoIncidentCreation = res.autoIncidentCreation !== undefined ? res.autoIncidentCreation : this.model.autoIncidentCreation;
        }
        // mostrar alerta personalizada al usuario
        this.showAlert('✅ Ajustes guardados. Se aplicaron los cambios y los schedulers se actualizaron.', 'success');
        // emitir evento para que la UI se actualice también
        this.onSaved.emit(this.model);
        setTimeout(() => this.message = '', 3000); 
      },
      error: (e) => { this.saving = false; this.message = 'Error'; console.error(e); }
    });
  }

  toggleDeletedServices() {
    this.showDeletedServices = !this.showDeletedServices;
    // Siempre recargar cuando se abre para asegurar datos actualizados
    if (this.showDeletedServices) {
      this.loadDeletedServices();
    }
  }

  loadDeletedServices() {
    this.api.getDeletedServices().subscribe(
      data => {
        this.deletedServices = data || [];
        // Forzar detección de cambios para reflejar inmediatamente
        try { this.onSaved.emit(); } catch(e) {}
      },
      error => {
        console.error('Error loading deleted services:', error);
        this.deletedServices = [];
      }
    );
  }

  restoreService(id: string) {
    const service = this.deletedServices.find(s => s._id === id);
    const serviceName = service?.nombre || 'este servicio';
    
    this.showConfirm('♻️ Restaurar Servicio', `¿Restaurar "${serviceName}"?`, () => {
      this.executeRestore(id);
    });
  }
  
  executeRestore(id: string) {
    this.restoring = true;
    
    // Eliminar optimísticamente de la lista
    const index = this.deletedServices.findIndex(s => s._id === id);
    if (index >= 0) {
      this.deletedServices.splice(index, 1);
    }
    
    this.api.restoreService(id).subscribe({
      next: () => {
        this.restoring = false;
        this.showAlert('Servicio restaurado correctamente', 'success');
        // Recargar para asegurar sincronización
        this.loadDeletedServices();
      },
      error: (err) => {
        this.restoring = false;
        console.error('Error restoring service:', err);
        this.showAlert('Error al restaurar el servicio', 'error');
        // Recargar en caso de error para restaurar el estado correcto
        this.loadDeletedServices();
      }
    });
  }

  permanentlyDeleteService(id: string) {
    const service = this.deletedServices.find(s => s._id === id);
    const serviceName = service?.nombre || 'este servicio';
    
    this.showConfirm('🗑️ Eliminar Permanentemente', `¿Eliminar permanentemente "${serviceName}"?\n\nEsta acción no se puede deshacer.`, () => {
      this.executePermanentDelete(id, serviceName);
    });
  }
  
  executePermanentDelete(id: string, serviceName: string) {
    this.deleting = true;
    
    // Eliminar optimísticamente de la lista
    const index = this.deletedServices.findIndex(s => s._id === id);
    if (index >= 0) {
      this.deletedServices.splice(index, 1);
    }
    
    this.api.deleteServiceHard(id).subscribe({
      next: () => {
        this.deleting = false;
        this.showAlert(`"${serviceName}" eliminado permanentemente`, 'success');
        // Recargar para asegurar sincronización
        this.loadDeletedServices();
      },
      error: (err) => {
        this.deleting = false;
        console.error('Error deleting service:', err);
        this.showAlert('Error al eliminar el servicio permanentemente', 'error');
        // Recargar en caso de error para restaurar el estado correcto
        this.loadDeletedServices();
      }
    });
  }

  deleteAllServices() {
    const count = this.deletedServices.length;
    
    this.showConfirm(
      '⚠️ Eliminar Todos Permanentemente', 
      `¿Estás seguro de eliminar PERMANENTEMENTE ${count} servicio(s) de la papelera?\n\nEsta acción NO se puede deshacer.`,
      () => {
        this.executeDeleteAll(count);
      }
    );
  }
  
  executeDeleteAll(count: number) {
    this.deleting = true;
    
    // Limpiar lista inmediatamente para feedback visual
    this.deletedServices = [];
    
    this.api.deleteAllDeletedServices().subscribe({
      next: (result: any) => {
        this.deleting = false;
        this.showAlert(`${result.deleted || count} servicios eliminados permanentemente`, 'success');
        // Recargar para asegurar sincronización
        this.loadDeletedServices();
      },
      error: (err) => {
        this.deleting = false;
        console.error('Error deleting all deleted services:', err);
        this.showAlert('Error al eliminar los servicios. Intenta de nuevo.', 'error');
        // Recargar en caso de error
        this.loadDeletedServices();
      }
    });
  }

  deleteAllDeletedServices() {
    this.deleteAllServices();
  }

  openDeletedServices() {
    try { this.onOpenDeleted.emit(); } catch(e) {}
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
    this.cdr.detectChanges();
  }
  
  closeAlert() {
    this.showCustomAlert = false;
  }
  
  showConfirm(title: string, message: string, callback: () => void) {
    this.customConfirmTitle = title;
    this.customConfirmMessage = message;
    this.customConfirmCallback = callback;
    this.showCustomConfirm = true;
    this.cdr.detectChanges();
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
  }
}
