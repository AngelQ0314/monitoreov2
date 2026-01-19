import { Component, OnInit, OnDestroy, EventEmitter, Output, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-maintenance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './maintenance.html',
  styleUrls: ['./maintenance.css']
})
export class MaintenanceComponent implements OnInit, OnDestroy {
  maintenances: any[] = [];
  services: any[] = [];
  creating = false;
  showAlarmModal = false;
  finishedMaintenance: any = null;
  alarmIntervalId: any = null;
  checkedMaintenances = new Set<string>(); // Para evitar duplicar alarmas
  deletingMaintenanceIds = new Set<string>(); // Para rastrear qué mantenimientos se están eliminando
  
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
  
  // Notificación de éxito
  showSuccessNotification = false;
  successMessage = '';
  successNotificationTimeout: any = null;
  
  newMaintenance: any = {
    serviceId: '',
    titulo: '',
    descripcion: '',
    fechaInicio: '',
    fechaFin: '',
    modo: 'pause',
    multiplier: 3,
  };

  @Output() onSaved = new EventEmitter<void>();
  @Output() onMaintenanceFinished = new EventEmitter<any>();

  constructor(public cdr: ChangeDetectorRef, private api: ApiService) {}

  ngOnInit() {
    this.loadServices();
    this.load(); // Cargar también mantenimientos en paralelo
    this.startAlarmChecker(); // Iniciar verificación de alarmas
  }

  ngOnDestroy() {
    // Limpiar el intervalo cuando se destruye el componente
    if (this.alarmIntervalId) {
      clearInterval(this.alarmIntervalId);
    }
  }

  startAlarmChecker() {
    // Verificar cada 10 segundos si algún mantenimiento ha terminado
    this.alarmIntervalId = setInterval(() => {
      const now = new Date();
      
      this.maintenances.forEach((m: any) => {
        // Solo verificar mantenimientos que tengan fecha de fin
        if (m.fechaFin && m.estado !== 'Finalizado' && !this.checkedMaintenances.has(m._id)) {
          const endDate = new Date(m.fechaFin);
          
          // Si la fecha de fin ha pasado, mostrar alarma
          if (now >= endDate) {
            this.showMaintenanceFinishedAlarm(m);
            this.checkedMaintenances.add(m._id);
          }
        }
      });
    }, 10000); // Cada 10 segundos
  }

  loadServices() {
    this.api.getServices().subscribe((d: any) => {
      // Mostrar sólo servicios activos
      const all = d || [];
      this.services = all.filter((s: any) => s.activo !== false);
      if (this.services.length && !this.newMaintenance.serviceId) {
        this.newMaintenance.serviceId = this.services[0]._id;
      }
      // Forzar detección de cambios para que se actualice el dropdown
      this.cdr.detectChanges();
      // después de cargar servicios, cargar mantenimientos y mapear nombres
      this.load();
    });
  }

  load() {
    this.api.getMaintenance().subscribe((d: any) => {
      console.log('Mantenimientos recibidos:', d);
      // Mostrar solo mantenimientos activos (ocultar soft-deletes)
      const mains = (d || [])
        .filter((m: any) => m.activo !== false)
        .sort((a: any, b: any) => {
          const dateA = new Date(a.fechaInicio).getTime();
          const dateB = new Date(b.fechaInicio).getTime();
          return dateB - dateA; // Más recientes primero
        })
        .map((m: any) => ({
          ...m,
          serviceName: (this.services && this.services.length > 0) 
            ? (this.services.find((s: any) => s._id === m.serviceId)?.nombre || m.serviceId)
            : m.serviceId
        }));
      console.log('Mantenimientos mapeados:', mains);
      this.maintenances = mains;
      // Forzar detección de cambios
      this.cdr.detectChanges();
    });
  }

  create() {
    if (this.creating) return;
    
    // Validaciones
    if (!this.newMaintenance.serviceId) {
      this.showAlert('Selecciona un servicio para el mantenimiento', 'warning');
      return;
    }
    
    if (!this.newMaintenance.titulo) {
      this.showAlert('El título del mantenimiento es obligatorio', 'warning');
      return;
    }
    
    if (!this.newMaintenance.fechaInicio) {
      this.showAlert('La fecha de inicio es obligatoria', 'warning');
      return;
    }
    
    this.creating = true;
    const body = { ...this.newMaintenance };
    
    this.api.createMaintenance(body).subscribe({
      next: (response: any) => {
        this.creating = false;
        
        // Agregar el nuevo mantenimiento a la lista inmediatamente
        const newMaint = {
          ...response,
          serviceName: this.services.find((s: any) => s._id === response.serviceId)?.nombre || response.serviceId
        };
        this.maintenances = [newMaint, ...this.maintenances];
        
        // Limpiar el formulario
        this.newMaintenance = { 
          serviceId: this.services.length > 0 ? this.services[0]._id : '',
          titulo: '', 
          descripcion: '', 
          fechaInicio: '', 
          fechaFin: '', 
          modo: 'pause', 
          multiplier: 3 
        };
        
        // Emitir evento para que dashboard recargue datos
        this.onSaved.emit();
        
        // Scroll hacia la lista de mantenimientos
        setTimeout(() => {
          const list = document.querySelector('.maintenance-list');
          if (list) {
            list.scrollTop = 0;
          }
        }, 100);
      },
      error: (err) => {
        console.error('Error creando mantenimiento', err);
        this.creating = false;
        alert('❌ Error al crear el mantenimiento. Intenta de nuevo.');
      }
    });
  }

  finish(id: string) {
    this.api.updateMaintenance(id, { estado: 'Finalizado', fechaFin: new Date().toISOString() }).subscribe(() => this.load());
  }

  remove(id: string) {
    const maint = this.maintenances.find(m => m._id === id);
    const maintName = maint?.titulo || 'este mantenimiento';
    
    this.showConfirm('🗑️ Eliminar Mantenimiento', `¿Estás seguro de que deseas eliminar "${maintName}"?`, () => {
      this.executeRemove(id);
    });
  }
  
  executeRemove(id: string) {
    
    // Marcar como eliminando inmediatamente para feedback visual
    this.deletingMaintenanceIds.add(id);
    
    // Eliminar de la lista local de forma inmediata
    const indexToRemove = this.maintenances.findIndex((m: any) => m._id === id);
    const removedMaintenance = indexToRemove >= 0 ? this.maintenances[indexToRemove] : null;
    
    if (indexToRemove >= 0) {
      this.maintenances.splice(indexToRemove, 1);
    }
    
    // Llamar al API
    this.api.deleteMaintenance(id).subscribe({
      next: () => {
        this.deletingMaintenanceIds.delete(id);
        this.onSaved.emit(); // Notificar al dashboard que se actualizó
      },
      error: (err) => {
        console.error('Error eliminando mantenimiento', err);
        this.deletingMaintenanceIds.delete(id);
        
        // Restaurar en la lista si falla
        if (removedMaintenance && indexToRemove >= 0) {
          this.maintenances.splice(indexToRemove, 0, removedMaintenance);
        }
        this.showAlert('Error al eliminar el mantenimiento. Intenta de nuevo.', 'error');
      }
    });
  }

  showMaintenanceFinishedAlarm(maintenance: any) {
    // Emitir evento al dashboard para agregar notificación
    this.onMaintenanceFinished.emit({
      id: maintenance._id,
      titulo: maintenance.titulo,
      serviceName: maintenance.serviceName,
      fechaFin: maintenance.fechaFin
    });
    
    // Reproducir sonido de alarma
    this.playAlarmSound();
    
    // Solicitar notificación del navegador si está permitido
    this.requestBrowserNotification(maintenance);
  }

  closeAlarm() {
    this.showAlarmModal = false;
    this.finishedMaintenance = null;
  }

  playAlarmSound() {
    // Usar Web Audio API para generar un sonido de alarma
    try {
      const audioContext = new (window as any).AudioContext();
      const now = audioContext.currentTime;
      
      // Crear oscilador para el sonido de alarma
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Frecuencia de alarma (800 Hz)
      oscillator.frequency.value = 800;
      
      // Envelop de volumen
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      
      oscillator.start(now);
      oscillator.stop(now + 0.5);
      
      // Repetir la alarma 3 veces
      for (let i = 1; i < 3; i++) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, now + i);
        gain.gain.exponentialRampToValueAtTime(0.01, now + i + 0.5);
        osc.start(now + i);
        osc.stop(now + i + 0.5);
      }
    } catch (e) {
      console.log('No se pudo reproducir sonido de alarma', e);
    }
  }

  requestBrowserNotification(maintenance: any) {
    // Solicitar permiso para notificaciones si aún no lo tiene
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    
    // Mostrar notificación si está permitido
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⏰ Mantenimiento Finalizado', {
        body: `El mantenimiento "${maintenance.titulo}" ha terminado.`,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">⏰</text></svg>'
      });
    }
  }

  finishAll() {
    const activeMaintenances = this.maintenances.filter((m: any) => m.estado !== 'Finalizado');
    
    if (activeMaintenances.length === 0) {
      this.showAlert('No hay mantenimientos activos para finalizar', 'info');
      return;
    }

    const message = `¿Finalizar todos los mantenimientos activos?\n\n${activeMaintenances.length} mantenimiento${activeMaintenances.length === 1 ? '' : 's'} será${activeMaintenances.length === 1 ? 'á' : 'án'} marcado${activeMaintenances.length === 1 ? '' : 's'} como finalizado${activeMaintenances.length === 1 ? '' : 's'}.`;
    
    this.showConfirm('✅ Finalizar Todo', message, () => {
      this.executeFinishAll();
    });
  }
  
  executeFinishAll() {
    this.api.finishAllMaintenances().subscribe({
      next: (result: any) => {
        this.showSuccess(`✅ Se finalizaron ${result.finalizados} de ${result.total} mantenimientos`);
        this.load();
        this.onSaved.emit();
      },
      error: (err) => {
        console.error('Error finalizando todos los mantenimientos', err);
        this.showAlert('Error al finalizar todos los mantenimientos. Intenta de nuevo.', 'error');
      }
    });
  }

  removeAll() {
    if (this.maintenances.length === 0) {
      this.showAlert('No hay mantenimientos para eliminar', 'info');
      return;
    }

    const message = `Se eliminarán ${this.maintenances.length} mantenimiento${this.maintenances.length === 1 ? '' : 's'} de forma permanente.\n\nEsta acción no se puede deshacer.`;
    
    this.showConfirm('🗑️ Eliminar Todos los Mantenimientos', message, () => {
      this.executeRemoveAll();
    });
  }
  
  executeRemoveAll() {
    this.api.deleteAllMaintenances().subscribe({
      next: (result: any) => {
        this.showSuccess(`✅ Se eliminaron ${result.eliminados} de ${result.total} mantenimientos`);
        this.maintenances = [];
        this.onSaved.emit();
      },
      error: (err) => {
        console.error('Error eliminando todos los mantenimientos', err);
        this.showAlert('Error al eliminar todos los mantenimientos. Intenta de nuevo.', 'error');
      }
    });
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
  }
  
  showSuccess(message: string) {
    this.successMessage = message;
    this.showSuccessNotification = true;
    
    if (this.successNotificationTimeout) {
      clearTimeout(this.successNotificationTimeout);
    }
    this.successNotificationTimeout = setTimeout(() => {
      this.showSuccessNotification = false;
      this.cdr.detectChanges();
    }, 4000);
  }

  trackByServiceId(index: number, service: any): any {
    return service._id;
  }
}
