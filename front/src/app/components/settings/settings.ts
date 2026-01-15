import { Component, OnInit, Output, EventEmitter } from '@angular/core';
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
  
  @Output() onSaved: EventEmitter<any> = new EventEmitter();
  @Output() onOpenDeleted: EventEmitter<any> = new EventEmitter();

  constructor(private api: ApiService) {}

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
        // mostrar alerta inmediata al usuario
        try { window.alert('Ajustes guardados. Se aplicaron los cambios y los schedulers se actualizaron.'); } catch(e) {}
        // emitir evento para que la UI se actualice también
        this.onSaved.emit(this.model);
        setTimeout(() => this.message = '', 3000); 
      },
      error: (e) => { this.saving = false; this.message = 'Error'; console.error(e); }
    });
  }

  toggleDeletedServices() {
    this.showDeletedServices = !this.showDeletedServices;
    if (this.showDeletedServices && this.deletedServices.length === 0) {
      this.loadDeletedServices();
    }
  }

  loadDeletedServices() {
    this.api.getDeletedServices().subscribe(
      data => {
        this.deletedServices = data || [];
      },
      error => {
        console.error('Error loading deleted services:', error);
        this.deletedServices = [];
      }
    );
  }

  restoreService(id: string) {
    if (!confirm('¿Restaurar este servicio?')) return;
    this.restoring = true;
    this.api.restoreService(id).subscribe({
      next: () => {
        this.restoring = false;
        this.loadDeletedServices();
      },
      error: (err) => {
        this.restoring = false;
        console.error('Error restoring service:', err);
      }
    });
  }

  permanentlyDeleteService(id: string) {
    if (!confirm('¿Eliminar permanentemente este servicio? Esta acción no se puede deshacer.')) return;
    this.deleting = true;
    this.api.deleteServiceHard(id).subscribe({
      next: () => {
        this.deleting = false;
        this.loadDeletedServices();
      },
      error: (err) => {
        this.deleting = false;
        console.error('Error deleting service:', err);
      }
    });
  }

  deleteAllServices() {
    const confirmMessage = '⚠️ ¿Estás seguro de eliminar PERMANENTEMENTE todos los servicios de la papelera?\n\nEsta acción NO se puede deshacer. Todos los servicios eliminados serán borrados definitivamente.\n\n¿Deseas continuar?';
    
    if (!confirm(confirmMessage)) return;
    
    // Segunda confirmación
    if (!confirm('¿Realmente deseas eliminar PERMANENTEMENTE todos estos servicios? Esta es tu última oportunidad para cancelar.')) return;
    
    this.deleting = true;
    this.api.deleteAllDeletedServices().subscribe({
      next: (result: any) => {
        this.deleting = false;
        alert(`✅ ${result.deleted || 0} servicios han sido eliminados permanentemente`);
        this.loadDeletedServices();
      },
      error: (err) => {
        this.deleting = false;
        console.error('Error deleting all deleted services:', err);
        alert('❌ Error al eliminar los servicios. Intenta de nuevo.');
      }
    });
  }

  deleteAllDeletedServices() {
    this.deleteAllServices();
  }

  openDeletedServices() {
    try { this.onOpenDeleted.emit(); } catch(e) {}
  }
 
}
