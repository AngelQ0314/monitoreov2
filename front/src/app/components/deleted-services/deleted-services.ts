import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-deleted-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deleted-services.html',
  styleUrl: './deleted-services.css'
})
export class DeletedServicesComponent implements OnInit {
  deletedServices: any[] = [];
  loading = false;
  processingIds = new Set<string>();

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.api.getDeletedServices().subscribe(list => {
      this.deletedServices = list || [];
      this.loading = false;
      this.cdr.detectChanges();
    }, err => {
      console.error('Error cargando servicios eliminados', err);
      this.deletedServices = [];
      this.loading = false;
      this.cdr.detectChanges();
    });
  }

  restore(id: string) {
    if (!confirm('Restaurar este servicio?')) return;
    
    // Remover inmediatamente de la lista para feedback visual
    const indexToRemove = this.deletedServices.findIndex((s: any) => s._id === id);
    const removedService = indexToRemove >= 0 ? this.deletedServices[indexToRemove] : null;
    
    this.processingIds.add(id);
    
    if (indexToRemove >= 0) {
      this.deletedServices.splice(indexToRemove, 1);
      this.cdr.detectChanges();
    }
    
    this.api.restoreService(id).subscribe(() => {
      this.processingIds.delete(id);
      try { window.alert('✅ Servicio restaurado correctamente'); } catch(e) {}
      // Recargar datos desde el servidor después de 500ms
      setTimeout(() => {
        this.load();
      }, 500);
    }, err => { 
      this.processingIds.delete(id);
      console.error('Error restaurando', err);
      
      // Restaurar en la lista si falla
      if (removedService && indexToRemove >= 0) {
        this.deletedServices.splice(indexToRemove, 0, removedService);
      }
      alert('❌ Error al restaurar. Intenta de nuevo.');
      this.cdr.detectChanges();
    });
  }

  hardDelete(id: string) {
    if (!confirm('Eliminar definitivamente? Esta acción no se puede deshacer.')) return;
    
    // Remover inmediatamente de la lista para feedback visual
    const indexToRemove = this.deletedServices.findIndex((s: any) => s._id === id);
    const removedService = indexToRemove >= 0 ? this.deletedServices[indexToRemove] : null;
    
    this.processingIds.add(id);
    
    if (indexToRemove >= 0) {
      this.deletedServices.splice(indexToRemove, 1);
      this.cdr.detectChanges();
    }
    
    this.api.deleteServiceHard(id).subscribe(() => {
      this.processingIds.delete(id);
      try { window.alert('✅ Servicio eliminado definitivamente'); } catch(e) {}
      // Recargar datos desde el servidor después de 500ms
      setTimeout(() => {
        this.load();
      }, 500);
    }, err => { 
      this.processingIds.delete(id);
      console.error('Error borrando definitivamente', err);
      
      // Restaurar en la lista si falla
      if (removedService && indexToRemove >= 0) {
        this.deletedServices.splice(indexToRemove, 0, removedService);
      }
      alert('❌ Error al eliminar. Intenta de nuevo.');
      this.cdr.detectChanges();
    });
  }
}

