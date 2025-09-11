import { Injectable, inject } from '@angular/core';
import { 
  Firestore, 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  query,
  Timestamp
} from '@angular/fire/firestore';
import { Observable, from, switchMap, Subject } from 'rxjs';
import { 
  CsvInventoryRow,
  CreateInventoryItemRequest,
  InventoryCategory,
  InventorySettings
} from '../../shared/models/product.models';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';

export interface ImportProgress {
  total: number;
  completed: number;
  failed: number;
  current: string;
}

@Injectable({
  providedIn: 'root'
})
export class CsvInventoryImportService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private inventoryService = inject(InventoryService);

  private inventoryCollection = collection(this.firestore, 'inventory_items');
  private stockMovementsCollection = collection(this.firestore, 'stock_movements');

  // Progress tracking
  private progressSubject = new Subject<ImportProgress>();
  public progress$ = this.progressSubject.asObservable();

  constructor() {}

  // Import inventory items from CSV data
  importInventoryFromCsv(csvData: CsvInventoryRow[]): Observable<string[]> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.importInventoryFromCsvAsync(csvData, user.uid));
      })
    );
  }

  private async importInventoryFromCsvAsync(csvData: CsvInventoryRow[], userId: string): Promise<string[]> {
    const createdItemIds: string[] = [];
    const defaultSettings = await this.getInventorySettings();
    let completed = 0;
    let failed = 0;

    // Initial progress
    this.progressSubject.next({
      total: csvData.length,
      completed: 0,
      failed: 0,
      current: 'Starting import...'
    });

    // Process items sequentially to avoid Firebase context issues
    for (const row of csvData) {
      try {
        // Update progress with current item
        this.progressSubject.next({
          total: csvData.length,
          completed,
          failed,
          current: `Processing: ${row.CommonName || row.VendorProductDescriptionOrName}`
        });

        const inventoryItem = this.mapCsvRowToInventoryItem(row, defaultSettings.defaultStockLevelPercentage);
        
        // Create the item directly using Firestore to avoid auth context issues
        const now = new Date();
        const item = {
          ...inventoryItem,
          lastRestocked: now,
          createdAt: now,
          updatedAt: now,
          createdBy: userId
        };

        const docRef = await addDoc(this.inventoryCollection, this.convertToFirestore(item));
        createdItemIds.push(docRef.id);

        // Also record the initial stock movement
        const stockMovement = {
          inventoryItemId: docRef.id,
          inventoryItemName: inventoryItem.name,
          type: 'IN' as const,
          quantity: inventoryItem.currentPhysicalStock,
          previousStock: 0,
          newStock: inventoryItem.currentPhysicalStock,
          reason: 'Initial stock',
          notes: 'Item created via CSV import',
          createdAt: now,
          createdBy: userId
        };

        await addDoc(this.stockMovementsCollection, this.convertToFirestore(stockMovement));
        completed++;
        
      } catch (error) {
        console.error(`Error importing item ${row.CommonName}:`, error);
        failed++;
        // Continue with next item instead of failing entire import
      }

      // Update progress after each item
      this.progressSubject.next({
        total: csvData.length,
        completed,
        failed,
        current: completed + failed < csvData.length 
          ? `Processed: ${row.CommonName || row.VendorProductDescriptionOrName}`
          : 'Import completed'
      });
    }

    // Final progress update
    this.progressSubject.next({
      total: csvData.length,
      completed,
      failed,
      current: 'Import completed'
    });

    return createdItemIds;
  }

  // Parse CSV content from string
  parseCsvContent(csvContent: string): CsvInventoryRow[] {
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    // Get headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: CsvInventoryRow[] = [];

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === headers.length) {
        const row: any = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim().replace(/"/g, '') || '';
        });
        
        // Only add rows that have required fields
        if (row.CommonName || row.VendorProductDescriptionOrName) {
          rows.push(row as CsvInventoryRow);
        }
      }
    }

    return rows;
  }

  // Parse a single CSV line handling quoted values
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }

  // Map CSV row to CreateInventoryItemRequest
  private mapCsvRowToInventoryItem(row: CsvInventoryRow, defaultStockPercentage: number): CreateInventoryItemRequest {
    // Parse cost per case
    const costPerCase = parseFloat(row.CostPerCase.replace(/[^0-9.-]/g, '')) || 0;
    
    // Parse units and quantities
    const unitsPerCase = parseFloat(row.UnitsPerCase) || 1;
    const unitSizeValue = parseFloat(row.UnitSizeValue) || 1;
    
    // Calculate cost per physical unit (case) and recipe unit
    const costPerPhysicalUnit = costPerCase;
    const costPerRecipeUnit = costPerCase / (unitsPerCase * unitSizeValue);
    
    // Derive physical unit from packaging
    const physicalUnit = this.derivePhysicalUnitFromPackaging(row.Packaging);
    
    // Map category
    const category = this.mapCsvCategoryToInventoryCategory(row.ItemCategory);
    
    // Calculate stock levels based on units per case and default percentage
    const minPhysicalStockLevel = Math.ceil(unitsPerCase * defaultStockPercentage);

    return {
      name: row.CommonName || row.VendorProductDescriptionOrName,
      description: row.VendorProductDescriptionOrName,
      category,
      supplier: row.Vendor,
      
      // Physical unit tracking
      physicalUnit,
      currentPhysicalStock: 0, // Start with zero stock
      minPhysicalStockLevel,
      maxPhysicalStockLevel: unitsPerCase * 2, // Default to 2x units per case
      
      // Recipe unit tracking
      recipeUnit: row.UnitSizeUnit || row.BaseUnit || 'each',
      unitsPerPhysicalItem: unitSizeValue,
      
      // Cost tracking
      costPerPhysicalUnit,
      costPerRecipeUnit,
      
      // Admin settings - use global default
      useCustomStockLevel: false,
      customStockLevelPercentage: 0,
      
      // Reference data from CSV
      vendorProductId: row.InventoryID,
      packaging: row.Packaging,
      brand: row.Brand
    };
  }

  // Derive physical unit name from packaging information
  private derivePhysicalUnitFromPackaging(packaging: string): string {
    if (!packaging) return 'case';
    
    const packagingLower = packaging.toLowerCase();
    
    // Common packaging types - most specific first
    if (packagingLower.includes('carton')) return 'carton';
    if (packagingLower.includes('bottle')) return 'bottle';
    if (packagingLower.includes('can')) return 'can';
    if (packagingLower.includes('jar')) return 'jar';
    if (packagingLower.includes('bag')) return 'bag';
    if (packagingLower.includes('box')) return 'box';
    if (packagingLower.includes('pack')) return 'pack';
    if (packagingLower.includes('roll')) return 'roll';
    if (packagingLower.includes('sleeve')) return 'sleeve';
    if (packagingLower.includes('wrap')) return 'wrap';
    if (packagingLower.includes('gallon')) return 'gallon';
    if (packagingLower.includes('liter')) return 'liter';
    if (packagingLower.includes('pound') || packagingLower.includes('lb')) return 'pound';
    
    // Look for patterns like "12/32 OZ" or "8/6/2.3 OZ" which indicate cases
    if (/\d+\//.test(packaging)) {
      return 'case';
    }
    
    // If it contains "case" anywhere
    if (packagingLower.includes('case')) return 'case';
    
    // Default to case for vendor packaging
    return 'case';
  }

  // Map CSV category to InventoryCategory
  private mapCsvCategoryToInventoryCategory(csvCategory: string): InventoryCategory {
    if (!csvCategory) return 'Other';
    
    const categoryLower = csvCategory.toLowerCase();
    
    // Direct mappings
    const categoryMappings: Record<string, InventoryCategory> = {
      'coffee': 'Coffee Beans',
      'coffee beans': 'Coffee Beans',
      'ground coffee': 'Ground Coffee',
      'milk': 'Milk & Dairy',
      'dairy': 'Milk & Dairy',
      'cream': 'Milk & Dairy',
      'syrup': 'Syrups & Flavors',
      'syrups': 'Syrups & Flavors',
      'flavor': 'Syrups & Flavors',
      'flavoring': 'Syrups & Flavors',
      'cup': 'Cups & Containers',
      'cups': 'Cups & Containers',
      'container': 'Cups & Containers',
      'lid': 'Lids',
      'lids': 'Lids',
      'sleeve': 'Sleeves & Wraps',
      'wrap': 'Sleeves & Wraps',
      'stirrer': 'Stirrers & Utensils',
      'utensil': 'Stirrers & Utensils',
      'food': 'Food Ingredients',
      'ingredient': 'Food Ingredients',
      'bakery': 'Bakery Supplies',
      'cleaning': 'Cleaning Supplies',
      'cleaner': 'Cleaning Supplies'
    };

    // Check for exact matches first
    for (const [key, value] of Object.entries(categoryMappings)) {
      if (categoryLower.includes(key)) {
        return value;
      }
    }

    return 'Other';
  }

  // Get inventory settings (with default if not exists)
  async getInventorySettings(): Promise<InventorySettings> {
    try {
      const settingsCollection = collection(this.firestore, 'inventory_settings');
      const q = query(settingsCollection);
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();
        return {
          defaultStockLevelPercentage: data['defaultStockLevelPercentage'] || 0.5,
          updatedAt: this.convertTimestampToDate(data['updatedAt']),
          updatedBy: data['updatedBy']
        };
      }
      
      // Return default settings if none exist
      return {
        defaultStockLevelPercentage: 0.5, // 50% default
        updatedAt: new Date(),
        updatedBy: 'system'
      };
    } catch (error) {
      console.error('Error getting inventory settings:', error);
      // Return default on error
      return {
        defaultStockLevelPercentage: 0.5,
        updatedAt: new Date(),
        updatedBy: 'system'
      };
    }
  }

  // Update inventory settings (admin only)
  updateInventorySettings(settings: Partial<InventorySettings>): Observable<void> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        const userId = user?.uid || 'admin'; // Fallback to 'admin' if user not available
        // TODO: Add admin permission check here
        return from(this.updateInventorySettingsAsync(settings, userId));
      })
    );
  }

  private async updateInventorySettingsAsync(settings: Partial<InventorySettings>, userId: string): Promise<void> {
    try {
      const settingsCollection = collection(this.firestore, 'inventory_settings');
      const q = query(settingsCollection);
      const snapshot = await getDocs(q);
      
      const updateData = {
        ...settings,
        updatedAt: new Date(),
        updatedBy: userId
      };
      
      if (!snapshot.empty) {
        // Update existing settings
        const docRef = doc(settingsCollection, snapshot.docs[0].id);
        await updateDoc(docRef, this.convertToFirestore(updateData));
      } else {
        // Create new settings document
        const newSettings: InventorySettings = {
          defaultStockLevelPercentage: settings.defaultStockLevelPercentage || 0.5,
          updatedAt: new Date(),
          updatedBy: userId
        };
        await addDoc(settingsCollection, this.convertToFirestore(newSettings));
      }
    } catch (error) {
      console.error('Error updating inventory settings:', error);
      throw error;
    }
  }

  // Convert timestamp helper
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

  // Convert to Firestore format
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
}