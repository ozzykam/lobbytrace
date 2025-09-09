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
  limit,
  Timestamp
} from '@angular/fire/firestore';
import { Observable, from, map, switchMap, of } from 'rxjs';
import { 
  Product, 
  InventoryItem, 
  CreateProductRequest, 
  UpdateProductRequest,
  CsvProductRow,
  ProductCategory,
  PRODUCT_CATEGORIES
} from '../../shared/models/product.models';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private productsCollection = collection(this.firestore, 'products');
  private inventoryCollection = collection(this.firestore, 'inventory_items');

  constructor() {}

  // PRODUCT CRUD OPERATIONS

  // Get all products
  getProducts(category?: ProductCategory): Observable<Product[]> {
    return from(this.getProductsAsync(category));
  }

  private async getProductsAsync(category?: ProductCategory): Promise<Product[]> {
    try {
      let q = query(this.productsCollection, orderBy('name'));
      
      if (category) {
        q = query(this.productsCollection, where('category', '==', category), orderBy('name'));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => this.convertFirestoreProduct(doc.id, doc.data()));
    } catch (error) {
      console.error('Error getting products:', error);
      throw error;
    }
  }

  // Get product by ID
  getProduct(id: string): Observable<Product | null> {
    return from(this.getProductAsync(id));
  }

  private async getProductAsync(id: string): Promise<Product | null> {
    try {
      const docRef = doc(this.productsCollection, id);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return this.convertFirestoreProduct(docSnap.id, docSnap.data());
      }
      return null;
    } catch (error) {
      console.error('Error getting product:', error);
      throw error;
    }
  }

  // Create new product
  createProduct(productData: CreateProductRequest): Observable<string> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.createProductAsync(productData, user.uid));
      })
    );
  }

  private async createProductAsync(productData: CreateProductRequest, userId: string): Promise<string> {
    try {
      const now = new Date();
      const product: Omit<Product, 'id'> = {
        ...productData,
        isActive: true,
        isArchived: false,
        ingredients: productData.ingredients || [],
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      };

      const docRef = await addDoc(this.productsCollection, this.convertToFirestore(product));
      return docRef.id;
    } catch (error) {
      console.error('Error creating product:', error);
      throw error;
    }
  }

  // Update product
  updateProduct(updateData: UpdateProductRequest): Observable<void> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.updateProductAsync(updateData));
      })
    );
  }

  private async updateProductAsync(updateData: UpdateProductRequest): Promise<void> {
    try {
      const { id, ...data } = updateData;
      const docRef = doc(this.productsCollection, id);
      
      const updatePayload = {
        ...data,
        updatedAt: new Date()
      };

      await updateDoc(docRef, this.convertToFirestore(updatePayload));
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  }

  // Delete product (soft delete by archiving)
  deleteProduct(id: string): Observable<void> {
    return from(this.deleteProductAsync(id));
  }

  private async deleteProductAsync(id: string): Promise<void> {
    try {
      const docRef = doc(this.productsCollection, id);
      await updateDoc(docRef, {
        isArchived: true,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  }

  // INVENTORY ITEM OPERATIONS

  // Get all inventory items
  getInventoryItems(): Observable<InventoryItem[]> {
    return from(this.getInventoryItemsAsync());
  }

  private async getInventoryItemsAsync(): Promise<InventoryItem[]> {
    try {
      const q = query(this.inventoryCollection, orderBy('name'));
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

  // Create inventory item
  createInventoryItem(itemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Observable<string> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.createInventoryItemAsync(itemData, user.uid));
      })
    );
  }

  private async createInventoryItemAsync(
    itemData: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>, 
    userId: string
  ): Promise<string> {
    try {
      const now = new Date();
      const item: Omit<InventoryItem, 'id'> = {
        ...itemData,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      };

      const docRef = await addDoc(this.inventoryCollection, this.convertToFirestore(item));
      return docRef.id;
    } catch (error) {
      console.error('Error creating inventory item:', error);
      throw error;
    }
  }

  // CSV IMPORT FUNCTIONALITY

  // Parse CSV and import products
  importProductsFromCsv(csvData: string): Observable<{ success: number; errors: string[] }> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.importProductsFromCsvAsync(csvData, user.uid));
      })
    );
  }

  private async importProductsFromCsvAsync(csvData: string, userId: string): Promise<{ success: number; errors: string[] }> {
    const results = { success: 0, errors: [] as string[] };
    
    try {
      const rows = this.parseCsv(csvData);
      
      for (const row of rows) {
        try {
          await this.createProductFromCsvRow(row, userId);
          results.success++;
        } catch (error: any) {
          results.errors.push(`Row ${results.success + results.errors.length + 1}: ${error.message}`);
        }
      }
    } catch (error: any) {
      results.errors.push(`CSV parsing error: ${error.message}`);
    }

    return results;
  }

  private parseCsv(csvData: string): CsvProductRow[] {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows: CsvProductRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCsvLine(line);
      if (values.length !== headers.length) continue;

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      rows.push(row as CsvProductRow);
    }

    return rows;
  }

  private parseCsvLine(line: string): string[] {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  private async createProductFromCsvRow(row: CsvProductRow, userId: string): Promise<void> {
    // Skip archived or invalid products
    if (row.Archived === 'Y' || !row['Item Name'] || !row.Price) {
      return;
    }

    const price = parseFloat(row.Price);
    if (isNaN(price)) {
      throw new Error(`Invalid price: ${row.Price}`);
    }

    const productData: CreateProductRequest = {
      name: row['Item Name'],
      variation: row['Variation Name'] || undefined,
      description: row.Description || undefined,
      category: this.mapCsvCategoryToProductCategory(row.Categories),
      price: price,
      ingredients: [] // Will be added manually later
    };

    await this.createProductAsync(productData, userId);
  }

  private mapCsvCategoryToProductCategory(csvCategory: string): ProductCategory {
    // Map CSV categories to our defined categories
    const mapping: { [key: string]: ProductCategory } = {
      'Drinks': 'Drinks',
      'Bakery': 'Bakery',
      'Breakfast': 'Breakfast',
      'Beer': 'Beer',
      'Wine': 'Wine',
      'Retail': 'Retail',
      'Seasonal (Spring/Summer)': 'Seasonal (Spring/Summer)',
      'Non Coffee Drinks': 'Non Coffee Drinks',
      'Signature Drinks': 'Signature Drinks'
    };

    return mapping[csvCategory] || 'Drinks';
  }

  // UTILITY METHODS

  // Get product categories
  getProductCategories(): ProductCategory[] {
    return [...PRODUCT_CATEGORIES];
  }

  // Search products
  searchProducts(searchTerm: string): Observable<Product[]> {
    return this.getProducts().pipe(
      map(products => 
        products.filter(product => 
          product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (product.variation && product.variation.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (product.description && product.description.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      )
    );
  }

  // DATA CONVERSION HELPERS

  private convertFirestoreProduct(id: string, data: any): Product {
    return {
      id,
      token: data.token,
      name: data.name,
      variation: data.variation,
      sku: data.sku,
      description: data.description,
      category: data.category,
      reportingCategory: data.reportingCategory,
      price: data.price,
      isActive: data.isActive ?? true,
      isArchived: data.isArchived ?? false,
      ingredients: data.ingredients || [],
      preparationTime: data.preparationTime,
      preparationInstructions: data.preparationInstructions,
      calories: data.calories,
      allergens: data.allergens || [],
      modifiers: data.modifiers || [],
      createdAt: this.convertTimestampToDate(data.createdAt),
      updatedAt: this.convertTimestampToDate(data.updatedAt),
      createdBy: data.createdBy
    };
  }

  private convertFirestoreInventoryItem(id: string, data: any): InventoryItem {
    return {
      id,
      name: data.name,
      description: data.description,
      unit: data.unit,
      category: data.category,
      currentStock: data.currentStock,
      minStockLevel: data.minStockLevel,
      maxStockLevel: data.maxStockLevel,
      costPerUnit: data.costPerUnit,
      supplier: data.supplier,
      lastRestocked: this.convertTimestampToDate(data.lastRestocked),
      createdAt: this.convertTimestampToDate(data.createdAt),
      updatedAt: this.convertTimestampToDate(data.updatedAt),
      createdBy: data.createdBy
    };
  }

  private convertToFirestore(data: any): any {
    const result = { ...data };
    
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