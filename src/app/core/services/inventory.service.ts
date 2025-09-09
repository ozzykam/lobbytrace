import { Injectable, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  Timestamp
} from '@angular/fire/firestore';
import { Observable, from, map, switchMap } from 'rxjs';
import { 
  InventoryItem, 
  InventoryCategory,
  INVENTORY_CATEGORIES,
  MeasurementUnit,
  MEASUREMENT_UNITS,
  CreateInventoryItemRequest,
  UpdateInventoryItemRequest,
  CsvInventoryRow,
  InventorySettings
} from '../../shared/models/product.models';
import { AuthService } from './auth.service';

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  notes?: string;
  createdAt: Date;
  createdBy: string;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private inventoryCollection = collection(this.firestore, 'inventory_items');
  private stockMovementsCollection = collection(this.firestore, 'stock_movements');

  constructor() {}

  // INVENTORY ITEM CRUD OPERATIONS

  // Get all inventory items
  getInventoryItems(category?: InventoryCategory): Observable<InventoryItem[]> {
    return from(this.getInventoryItemsAsync(category));
  }

  private async getInventoryItemsAsync(category?: InventoryCategory): Promise<InventoryItem[]> {
    try {
      let q = query(this.inventoryCollection, orderBy('name'));
      
      if (category) {
        q = query(this.inventoryCollection, where('category', '==', category), orderBy('name'));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => this.convertFirestoreInventoryItem(doc.id, doc.data()));
    } catch (error) {
      console.error('Error getting inventory items:', error);
      throw error;
    }
  }

  // Get inventory item by ID
  getInventoryItem(id: string): Observable<InventoryItem | null> {
    return from(this.getInventoryItemAsync(id));
  }

  private async getInventoryItemAsync(id: string): Promise<InventoryItem | null> {
    try {
      const docRef = doc(this.inventoryCollection, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return this.convertFirestoreInventoryItem(docSnap.id, docSnap.data());
      }
      return null;
    } catch (error) {
      console.error('Error getting inventory item:', error);
      throw error;
    }
  }

  // Create new inventory item
  createInventoryItem(itemData: CreateInventoryItemRequest): Observable<string> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.createInventoryItemAsync(itemData, user.uid));
      })
    );
  }

  private async createInventoryItemAsync(itemData: CreateInventoryItemRequest, userId: string): Promise<string> {
    try {
      const now = new Date();
      const item: Omit<InventoryItem, 'id'> = {
        ...itemData,
        lastRestocked: now,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      };

      const docRef = await addDoc(this.inventoryCollection, this.convertToFirestore(item));

      // Record initial stock movement
      await this.recordStockMovement({
        inventoryItemId: docRef.id,
        inventoryItemName: itemData.name,
        type: 'IN',
        quantity: itemData.currentPhysicalStock,
        previousStock: 0,
        newStock: itemData.currentPhysicalStock,
        reason: 'Initial stock',
        notes: 'Item created with initial stock'
      }, userId);

      return docRef.id;
    } catch (error) {
      console.error('Error creating inventory item:', error);
      throw error;
    }
  }

  // Update inventory item
  updateInventoryItem(updateData: UpdateInventoryItemRequest): Observable<void> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.updateInventoryItemAsync(updateData));
      })
    );
  }

  private async updateInventoryItemAsync(updateData: UpdateInventoryItemRequest): Promise<void> {
    try {
      const { id, ...data } = updateData;
      const docRef = doc(this.inventoryCollection, id);
      
      const updatePayload = {
        ...data,
        updatedAt: new Date()
      };

      await updateDoc(docRef, this.convertToFirestore(updatePayload));
    } catch (error) {
      console.error('Error updating inventory item:', error);
      throw error;
    }
  }

  // Delete inventory item
  deleteInventoryItem(id: string): Observable<void> {
    return from(this.deleteInventoryItemAsync(id));
  }

  private async deleteInventoryItemAsync(id: string): Promise<void> {
    try {
      const docRef = doc(this.inventoryCollection, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      throw error;
    }
  }

  // STOCK MANAGEMENT

  // Update physical stock level
  updatePhysicalStock(
    itemId: string, 
    newQuantity: number, 
    type: 'IN' | 'OUT' | 'ADJUSTMENT',
    reason: string,
    notes?: string
  ): Observable<void> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.updatePhysicalStockAsync(itemId, newQuantity, type, reason, notes, user.uid));
      })
    );
  }

  private async updatePhysicalStockAsync(
    itemId: string, 
    newQuantity: number, 
    type: 'IN' | 'OUT' | 'ADJUSTMENT',
    reason: string,
    notes: string | undefined,
    userId: string
  ): Promise<void> {
    try {
      // Get current item
      const item = await this.getInventoryItemAsync(itemId);
      if (!item) {
        throw new Error('Inventory item not found');
      }

      const previousStock = item.currentPhysicalStock;
      let finalQuantity: number;

      // Calculate new stock based on type
      switch (type) {
        case 'IN':
          finalQuantity = previousStock + newQuantity;
          break;
        case 'OUT':
          finalQuantity = Math.max(0, previousStock - newQuantity);
          break;
        case 'ADJUSTMENT':
          finalQuantity = newQuantity;
          break;
        default:
          throw new Error('Invalid stock movement type');
      }

      // Update the inventory item
      const docRef = doc(this.inventoryCollection, itemId);
      await updateDoc(docRef, {
        currentPhysicalStock: finalQuantity,
        lastRestocked: type === 'IN' ? new Date() : item.lastRestocked,
        updatedAt: new Date()
      });

      // Record the stock movement
      await this.recordStockMovement({
        inventoryItemId: itemId,
        inventoryItemName: item.name,
        type,
        quantity: Math.abs(finalQuantity - previousStock),
        previousStock,
        newStock: finalQuantity,
        reason,
        notes
      }, userId);

    } catch (error) {
      console.error('Error updating physical stock:', error);
      throw error;
    }
  }

  // Record stock movement
  private async recordStockMovement(
    movement: Omit<StockMovement, 'id' | 'createdAt' | 'createdBy'>,
    userId: string
  ): Promise<void> {
    try {
      const stockMovement: Omit<StockMovement, 'id'> = {
        ...movement,
        createdAt: new Date(),
        createdBy: userId
      };

      await addDoc(this.stockMovementsCollection, this.convertToFirestore(stockMovement));
    } catch (error) {
      console.error('Error recording stock movement:', error);
      throw error;
    }
  }

  // Get stock movements for an item
  getStockMovements(itemId: string): Observable<StockMovement[]> {
    return from(this.getStockMovementsAsync(itemId));
  }

  private async getStockMovementsAsync(itemId: string): Promise<StockMovement[]> {
    try {
      const q = query(
        this.stockMovementsCollection,
        where('inventoryItemId', '==', itemId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => this.convertFirestoreStockMovement(doc.id, doc.data()));
    } catch (error) {
      console.error('Error getting stock movements:', error);
      throw error;
    }
  }

  // UTILITY METHODS

  // Get low stock items
  getLowStockItems(): Observable<InventoryItem[]> {
    return this.getInventoryItems().pipe(
      map(items => items.filter(item => item.currentPhysicalStock <= item.minPhysicalStockLevel))
    );
  }

  // Get inventory categories
  getInventoryCategories(): InventoryCategory[] {
    return [...INVENTORY_CATEGORIES];
  }

  // Get measurement units
  getMeasurementUnits(): MeasurementUnit[] {
    return [...MEASUREMENT_UNITS];
  }

  // Search inventory items
  searchInventoryItems(searchTerm: string): Observable<InventoryItem[]> {
    return this.getInventoryItems().pipe(
      map(items => 
        items.filter(item => 
          item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
          item.category.toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    );
  }

  // Calculate total inventory value
  calculateTotalInventoryValue(): Observable<number> {
    return this.getInventoryItems().pipe(
      map(items => 
        items.reduce((total, item) => total + (item.currentPhysicalStock * item.costPerPhysicalUnit), 0)
      )
    );
  }

  // Calculate recipe units available for consumption
  calculateRecipeUnitsAvailable(item: InventoryItem): number {
    return item.currentPhysicalStock * item.unitsPerPhysicalItem;
  }

  // Get current stock level percentage
  getCurrentStockLevelPercentage(item: InventoryItem): number {
    if (!item.minPhysicalStockLevel) return 100;
    return (item.currentPhysicalStock / item.minPhysicalStockLevel) * 100;
  }

  // DATA CONVERSION HELPERS

  private convertFirestoreInventoryItem(id: string, data: any): InventoryItem {
    return {
      id,
      name: data.name,
      description: data.description,
      category: data.category,
      supplier: data.supplier,
      
      // Physical unit tracking
      physicalUnit: data.physicalUnit,
      currentPhysicalStock: data.currentPhysicalStock || 0,
      minPhysicalStockLevel: data.minPhysicalStockLevel || 0,
      maxPhysicalStockLevel: data.maxPhysicalStockLevel,
      
      // Recipe unit tracking
      recipeUnit: data.recipeUnit,
      unitsPerPhysicalItem: data.unitsPerPhysicalItem || 1,
      
      // Cost tracking
      costPerPhysicalUnit: data.costPerPhysicalUnit || 0,
      costPerRecipeUnit: data.costPerRecipeUnit || 0,
      
      // Admin settings
      useCustomStockLevel: data.useCustomStockLevel || false,
      customStockLevelPercentage: data.customStockLevelPercentage,
      
      // Reference data
      vendorProductId: data.vendorProductId,
      packaging: data.packaging,
      brand: data.brand,
      
      // Metadata
      lastRestocked: this.convertTimestampToDate(data.lastRestocked),
      createdAt: this.convertTimestampToDate(data.createdAt),
      updatedAt: this.convertTimestampToDate(data.updatedAt),
      createdBy: data.createdBy
    };
  }

  private convertFirestoreStockMovement(id: string, data: any): StockMovement {
    return {
      id,
      inventoryItemId: data.inventoryItemId,
      inventoryItemName: data.inventoryItemName,
      type: data.type,
      quantity: data.quantity,
      previousStock: data.previousStock,
      newStock: data.newStock,
      reason: data.reason,
      notes: data.notes,
      createdAt: this.convertTimestampToDate(data.createdAt),
      createdBy: data.createdBy
    };
  }

  private convertToFirestore(data: any): any {
    const result = { ...data };
    
    // Set defaults for undefined optional fields
    if (result.customStockLevelPercentage === undefined) {
      result.customStockLevelPercentage = 0;
    }
    if (result.maxPhysicalStockLevel === undefined) {
      result.maxPhysicalStockLevel = 0;
    }
    if (result.createdBy === undefined) {
      result.createdBy = 'system';
    }
    
    // Convert Date objects to Firestore Timestamps
    if (result.createdAt instanceof Date) {
      result.createdAt = Timestamp.fromDate(result.createdAt);
    }
    if (result.updatedAt instanceof Date) {
      result.updatedAt = Timestamp.fromDate(result.updatedAt);
    }
    if (result.lastRestocked instanceof Date) {
      result.lastRestocked = Timestamp.fromDate(result.lastRestocked);
    }

    return result;
  }

  private convertTimestampToDate(timestamp: any): Date {
    if (!timestamp) return new Date();
    
    if (timestamp instanceof Date) {
      return timestamp;
    }
    
    if (timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }
    
    if (timestamp && typeof timestamp.seconds === 'number') {
      return new Date(timestamp.seconds * 1000);
    }
    
    try {
      return new Date(timestamp);
    } catch {
      return new Date();
    }
  }
}