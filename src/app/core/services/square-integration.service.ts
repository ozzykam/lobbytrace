import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap, map, catchError, of } from 'rxjs';
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
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Auth } from '@angular/fire/auth';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { ProductService } from './product.service';
import { 
  InventoryItem,
  Product,
  ProductIngredient,
  SquareProductImportRequest,
  SquareImportResult,
  CreateProductRequest,
  UpdateProductRequest,
} from '../../shared/models/product.models';

export interface SquareConfig {
  id?: string;
  applicationId: string;
  accessToken: string;
  locationId: string;
  webhookSignatureKey?: string;
  environment: 'sandbox' | 'production';
  autoSyncEnabled: boolean;
  syncFrequency: 'realtime' | 'hourly' | 'daily';
  lastSyncAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface SquareInventoryItem {
  type: 'INVENTORY_COUNT';
  id: string;
  location_id: string;
  catalog_object_id: string;
  catalog_object_type: 'ITEM_VARIATION';
  state: 'IN_STOCK' | 'SOLD' | 'RETURNED_BY_CUSTOMER' | 'RESERVED_FOR_SALE' | 'SOLD_ONLINE' | 'ORDERED_FROM_VENDOR' | 'RECEIVED_FROM_VENDOR';
  quantity?: string;
  calculated_at: string;
}

export interface SquareCatalogObject {
  type: 'ITEM' | 'ITEM_VARIATION' | 'CATEGORY';
  id: string;
  version: number;
  is_deleted?: boolean;
  custom_attribute_values?: any;
  catalog_v1_ids?: any;
  item_data?: SquareItem;
  item_variation_data?: SquareItemVariation;
}

export interface SquareItem {
  name: string;
  description?: string;
  abbreviation?: string;
  label_color?: string;
  available_online?: boolean;
  available_for_pickup?: boolean;
  available_electronically?: boolean;
  category_id?: string;
  tax_ids?: string[];
  modifier_list_info?: any[];
  variations?: SquareCatalogObject[];
  product_type?: 'REGULAR' | 'GIFT_CARD' | 'APPOINTMENTS_SERVICE';
  skip_modifier_screen?: boolean;
}

export interface SquareItemVariation {
  item_id: string;
  name?: string;
  sku?: string;
  upc?: string;
  ordinal?: number;
  pricing_type: 'FIXED_PRICING' | 'VARIABLE_PRICING';
  price_money?: {
    amount: number;
    currency: 'USD';
  };
  location_overrides?: any[];
  track_inventory?: boolean;
  inventory_alert_type?: 'NONE' | 'LOW_QUANTITY';
  inventory_alert_threshold?: number;
  user_data?: string;
  service_duration?: number;
  available_for_booking?: boolean;
  item_option_values?: any[];
  measurement_unit_id?: string;
  sellable?: boolean;
  stockable?: boolean;
}

export interface SquareWebhookEvent {
  merchant_id: string;
  type: 'order.created' | 'order.updated' | 'order.fulfillment.updated';
  event_id: string;
  created_at: string;
  data: {
    type: 'order';
    id: string;
    object: {
      order: {
        id: string;
        location_id: string;
        state: 'OPEN' | 'COMPLETED' | 'CANCELED';
        line_items: Array<{
          uid: string;
          catalog_object_id: string;
          quantity: string;
          name: string;
          variation_name?: string;
          base_price_money: {
            amount: number;
            currency: string;
          };
        }>;
        created_at: string;
        updated_at: string;
      };
    };
  };
}


export interface SyncResult {
  success: boolean;
  itemsProcessed: number;
  itemsUpdated: number;
  errors: string[];
  lastSyncAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class SquareIntegrationService {
  private http = inject(HttpClient);
  private functions = inject(Functions);
  private auth = inject(Auth);
  private authService = inject(AuthService);
  private inventoryService = inject(InventoryService);
  private productService = inject(ProductService);
  private firestore = inject(Firestore);

  private readonly SQUARE_API_BASE = {
    sandbox: 'https://connect.squareupsandbox.com',
    production: 'https://connect.squareup.com'
  };

  constructor() {}

  // CONFIGURATION MANAGEMENT

  getSquareConfig(): Observable<SquareConfig | null> {
    return from(this.getSquareConfigAsync());
  }

  private async getSquareConfigAsync(): Promise<SquareConfig | null> {
    try {
      const settingsCollection = collection(this.firestore, 'square_config');
      const q = query(settingsCollection);
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();
        return {
          id: doc.id,
          applicationId: data['applicationId'],
          accessToken: data['accessToken'],
          locationId: data['locationId'],
          webhookSignatureKey: data['webhookSignatureKey'],
          environment: data['environment'],
          autoSyncEnabled: data['autoSyncEnabled'] || false,
          syncFrequency: data['syncFrequency'] || 'realtime',
          lastSyncAt: this.convertTimestampToDate(data['lastSyncAt']),
          createdAt: this.convertTimestampToDate(data['createdAt']),
          updatedAt: this.convertTimestampToDate(data['updatedAt']),
          createdBy: data['createdBy']
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error getting Square config:', error);
      return null;
    }
  }

  saveSquareConfig(config: Omit<SquareConfig, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Observable<string> {
    const currentUser = this.auth.currentUser;
    if (!currentUser || !currentUser.uid) {
      throw new Error('User not authenticated or missing user ID');
    }
    return from(this.saveSquareConfigAsync(config, currentUser.uid));
  }

  private async saveSquareConfigAsync(
    config: Omit<SquareConfig, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>, 
    userId: string
  ): Promise<string> {
    try {
      const settingsCollection = collection(this.firestore, 'square_config');
      const q = query(settingsCollection);
      const snapshot = await getDocs(q);
      
      const now = new Date();
      const configData = {
        ...config,
        createdAt: now,
        updatedAt: now,
        createdBy: userId || 'system'
      };
      
      if (!snapshot.empty) {
        // Update existing config
        const docRef = doc(settingsCollection, snapshot.docs[0].id);
        await updateDoc(docRef, this.convertToFirestore(configData));
        return snapshot.docs[0].id;
      } else {
        // Create new config document
        const docRef = await addDoc(settingsCollection, this.convertToFirestore(configData));
        return docRef.id;
      }
    } catch (error) {
      console.error('Error saving Square config:', error);
      throw error;
    }
  }

  // SQUARE API INTEGRATION

  testConnection(config: SquareConfig): Observable<boolean> {
    const testSquareConnection = httpsCallable(this.functions, 'testSquareConnection');
    
    return from(testSquareConnection({
      accessToken: config.accessToken,
      environment: config.environment
    })).pipe(
      map((result: any) => result.data?.success === true),
      catchError((error) => {
        console.error('Error testing Square connection:', error);
        return of(false);
      })
    );
  }

  getSquareLocations(config: SquareConfig): Observable<any[]> {
    const getSquareLocations = httpsCallable(this.functions, 'getSquareLocations');
    
    return from(getSquareLocations({
      accessToken: config.accessToken,
      environment: config.environment
    })).pipe(
      map((result: any) => result.data?.locations || []),
      catchError((error) => {
        console.error('Error getting Square locations:', error);
        return of([]);
      })
    );
  }

  getSquareCatalog(config: SquareConfig): Observable<SquareCatalogObject[]> {
    const getSquareCatalog = httpsCallable(this.functions, 'getSquareCatalog');
    
    return from(getSquareCatalog({
      accessToken: config.accessToken,
      environment: config.environment
    })).pipe(
      map((result: any) => result.data?.objects || []),
      catchError((error) => {
        console.error('Error getting Square catalog:', error);
        return of([]);
      })
    );
  }

  getSquareInventoryCounts(config: SquareConfig, catalogObjectIds?: string[]): Observable<SquareInventoryItem[]> {
    const getSquareInventory = httpsCallable(this.functions, 'getSquareInventory');
    
    return from(getSquareInventory({
      accessToken: config.accessToken,
      environment: config.environment,
      locationId: config.locationId,
      catalogObjectIds: catalogObjectIds
    })).pipe(
      map((result: any) => result.data?.counts || []),
      catchError((error) => {
        console.error('Error getting Square inventory:', error);
        return of([]);
      })
    );
  }


  // SYNCHRONIZATION (Simplified - for direct Square import tracking only)

  processSquareSale(squareOrderId: string, orderItems: any[]): Observable<SyncResult> {
    return from(this.processSquareSaleAsync(squareOrderId, orderItems));
  }

  private async processSquareSaleAsync(squareOrderId: string, orderItems: any[]): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      itemsProcessed: 0,
      itemsUpdated: 0,
      errors: [],
      lastSyncAt: new Date()
    };

    try {
      // Simplified processing for direct Square imports
      // This would track consumption based on product recipes if configured
      result.itemsProcessed = orderItems.length;
      result.success = true;
      
      // TODO: Implement inventory consumption tracking for Square orders
      // when product recipes are available
      
      return result;
    } catch (error) {
      result.errors.push(`Sale processing failed: ${error}`);
      return result;
    }
  }


  // WEBHOOK HANDLING

  processWebhookEvent(event: SquareWebhookEvent): Observable<boolean> {
    return from(this.processWebhookEventAsync(event));
  }

  private async processWebhookEventAsync(event: SquareWebhookEvent): Promise<boolean> {
    try {
      // Only process completed orders
      if (!['order.created', 'order.updated', 'order.fulfillment.updated'].includes(event.type)) {
        return false;
      }

      const order = event.data.object.order;
      
      // Only process completed orders to avoid double-counting
      if (order.state !== 'COMPLETED') {
        
        return false;
      }

      // Process the sale through our standard method
      const result = await this.processSquareSaleAsync(order.id, order.line_items);
      
      return result.success;
    } catch (error) {
      console.error('Error processing Square webhook:', error);
      return false;
    }
  }

  // HELPER METHODS

  private getSquareHeaders(accessToken: string): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${accessToken}`,
      'Square-Version': '2023-10-18',
      'Content-Type': 'application/json'
    });
  }

  validateSquareConfig(config: Partial<SquareConfig>): string[] {
    const errors: string[] = [];

    if (!config.applicationId) {
      errors.push('Application ID is required');
    }

    if (!config.accessToken) {
      errors.push('Access Token is required');
    }

    if (!config.locationId) {
      errors.push('Location ID is required');
    }

    if (!config.environment || !['sandbox', 'production'].includes(config.environment)) {
      errors.push('Environment must be either sandbox or production');
    }

    return errors;
  }


  // DATA CONVERSION HELPERS (copied from CSV service)
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

  private convertToFirestore(data: any): any {
    const result = { ...data };
    
    // Convert Date objects to Firestore Timestamps
    if (result.createdAt instanceof Date) {
      result.createdAt = Timestamp.fromDate(result.createdAt);
    }
    if (result.updatedAt instanceof Date) {
      result.updatedAt = Timestamp.fromDate(result.updatedAt);
    }
    if (result.lastSyncAt instanceof Date) {
      result.lastSyncAt = Timestamp.fromDate(result.lastSyncAt);
    }

    return result;
  }

  // SQUARE PRODUCT IMPORT METHODS

  // Import products from Square catalog
  importProductsFromSquare(): Observable<SquareImportResult> {
    return from(this.importProductsFromSquareAsync());
  }

  private async importProductsFromSquareAsync(): Promise<SquareImportResult> {
    const result: SquareImportResult = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Get Square config
      const config = await this.getSquareConfigAsync();
      if (!config) {
        result.errors.push('Square integration not configured');
        return result;
      }

      // Get Square catalog
      const squareCatalog = await this.getSquareCatalog(config).toPromise();
      if (!squareCatalog) {
        result.errors.push('Failed to fetch Square catalog');
        return result;
      }

      // Get existing products to check for duplicates
      const existingProducts = await this.productService.getProducts().toPromise();
      const existingTokens = new Set(existingProducts?.map(p => p.token).filter(Boolean) || []);

      // Process Square items
      const itemVariations = squareCatalog.filter(item => item.type === 'ITEM_VARIATION');
      const parentItems = new Map(
        squareCatalog
          .filter(item => item.type === 'ITEM')
          .map(item => [item.id, item])
      );

      for (const variation of itemVariations) {
        try {
          const importData = this.mapSquareItemToProduct(variation, parentItems);
          
          if (!importData) {
            continue; // Skip if mapping failed
          }

          // Check if product already exists
          if (existingTokens.has(importData.token)) {
            // Update existing product's Square data
            await this.updateExistingProductFromSquare(importData, existingProducts!);
            result.updated++;
          } else {
            // Create new product
            await this.createProductFromSquareData(importData);
            result.imported++;
          }

        } catch (error) {
          result.errors.push(`Failed to process ${variation.id}: ${error}`);
        }
      }

    } catch (error) {
      result.errors.push(`Import failed: ${error}`);
    }

    return result;
  }

  private mapSquareItemToProduct(
    variation: SquareCatalogObject, 
    parentItems: Map<string, SquareCatalogObject>
  ): SquareProductImportRequest | null {
    if (!variation.item_variation_data) return null;

    const parentItemId = variation.item_variation_data.item_id;
    const parentItem = parentItems.get(parentItemId);
    
    if (!parentItem?.item_data) return null;

    const variationData = variation.item_variation_data;
    const itemData = parentItem.item_data;

    // Extract drink attributes from variation name
    const variationName = variationData.name || '';
    const { size, temperature, toGoStatus } = this.extractDrinkAttributes(variationName);

    return {
      token: variation.id, // Use variation ID as token
      squareItemId: parentItemId,
      squareVariationId: variation.id,
      name: itemData.name,
      variation: variationName,
      sku: variationData.sku,
      description: itemData.description,
      category: this.mapSquareCategory(itemData.category_id),
      reportingCategory: itemData.category_id,
      price: variationData.price_money?.amount || 0,
      isActive: !parentItem.is_deleted && !variation.is_deleted,
      isArchived: parentItem.is_deleted || variation.is_deleted || false,
      size,
      temperature,
      toGoStatus,
      modifiers: [] // Can be enhanced later
    };
  }

  private extractDrinkAttributes(variationName: string) {
    const size = this.extractSize(variationName);
    const temperature = this.extractTemperature(variationName);
    const toGoStatus = this.extractToGoStatus(variationName);

    return { size, temperature, toGoStatus };
  }

  private extractSize(text: string) {
    const sizeMatch = text.match(/(\d+oz|Small|Medium|Large|XL)/i);
    return sizeMatch ? sizeMatch[0] as any : undefined;
  }

  private extractTemperature(text: string) {
    if (/hot/i.test(text)) return 'Hot' as any;
    if (/iced|cold/i.test(text)) return 'Iced' as any;
    return undefined;
  }

  private extractToGoStatus(text: string) {
    if (/to.?go|takeout|takeaway/i.test(text)) return 'To-Go' as any;
    if (/here|dine.?in/i.test(text)) return 'Here' as any;
    return undefined;
  }

  private mapSquareCategory(squareCategoryId?: string): string {
    // Map Square category IDs to your standard categories
    const categoryMap: Record<string, string> = {
      'drinks': 'Drinks',
      'coffee': 'Drinks', 
      'bakery': 'Bakery',
      'food': 'Breakfast',
      // Add more mappings as needed
    };

    return categoryMap[squareCategoryId?.toLowerCase() || ''] || 'Drinks';
  }

  private async updateExistingProductFromSquare(
    importData: SquareProductImportRequest, 
    existingProducts: Product[]
  ): Promise<void> {
    const existingProduct = existingProducts.find(p => p.token === importData.token);
    if (!existingProduct) return;

    // Only update Square-managed fields, preserve LobbyTrace fields
    const updateRequest: UpdateProductRequest = {
      id: existingProduct.id,
      name: importData.name,
      variation: importData.variation,
      description: importData.description,
      category: importData.category,
      price: importData.price,
      size: importData.size,
      temperature: importData.temperature,
      toGoStatus: importData.toGoStatus,
      // Preserve existing LobbyTrace fields
      ingredients: existingProduct.ingredients,
      preparationTime: existingProduct.preparationTime,
      preparationInstructions: existingProduct.preparationInstructions,
      allergens: existingProduct.allergens
    };

    await this.productService.updateProduct(updateRequest).toPromise();
  }

  private async createProductFromSquareData(importData: SquareProductImportRequest): Promise<void> {
    // Create proper CreateProductRequest object
    const createRequest: CreateProductRequest = {
      name: importData.name,
      variation: importData.variation,
      description: importData.description,
      category: importData.category,
      price: importData.price,
      size: importData.size,
      temperature: importData.temperature,
      toGoStatus: importData.toGoStatus,
      ingredients: [], // Empty initially - users will add recipes later
      preparationTime: undefined,
      preparationInstructions: undefined,
      allergens: [],
      token: importData.token
    };

    await this.productService.createProduct(createRequest).toPromise();
  }

  private generateDataHash(data: SquareProductImportRequest): string {
    const hashData = `${data.name}-${data.variation}-${data.price}-${data.isActive}`;
    return btoa(hashData).substring(0, 16); // Simple hash for change detection
  }
}