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
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { ProductService } from './product.service';
import { InventoryItem, Product, ProductIngredient } from '../../shared/models/product.models';

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

export interface ProductMapping {
  id?: string;
  productId: string;
  squareCatalogObjectId: string;
  squareItemVariationId: string;
  productName: string;
  squareItemName: string;
  syncEnabled: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
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
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.saveSquareConfigAsync(config, user.uid));
      })
    );
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
        createdBy: userId
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
    const headers = this.getSquareHeaders(config.accessToken);
    const baseUrl = this.SQUARE_API_BASE[config.environment];
    
    return this.http.get(`${baseUrl}/v2/locations`, { headers }).pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  getSquareLocations(config: SquareConfig): Observable<any[]> {
    const headers = this.getSquareHeaders(config.accessToken);
    const baseUrl = this.SQUARE_API_BASE[config.environment];
    
    return this.http.get<any>(`${baseUrl}/v2/locations`, { headers }).pipe(
      map(response => response.locations || [])
    );
  }

  getSquareCatalog(config: SquareConfig): Observable<SquareCatalogObject[]> {
    const headers = this.getSquareHeaders(config.accessToken);
    const baseUrl = this.SQUARE_API_BASE[config.environment];
    
    return this.http.post<any>(`${baseUrl}/v2/catalog/search`, {
      object_types: ['ITEM', 'ITEM_VARIATION'],
      include_deleted_objects: false
    }, { headers }).pipe(
      map(response => response.objects || [])
    );
  }

  getSquareInventoryCounts(config: SquareConfig, catalogObjectIds?: string[]): Observable<SquareInventoryItem[]> {
    const headers = this.getSquareHeaders(config.accessToken);
    const baseUrl = this.SQUARE_API_BASE[config.environment];
    
    const body: any = {
      location_ids: [config.locationId],
      states: ['IN_STOCK']
    };
    
    if (catalogObjectIds) {
      body.catalog_object_ids = catalogObjectIds;
    }
    
    return this.http.post<any>(`${baseUrl}/v2/inventory/counts/batch-retrieve`, body, { headers }).pipe(
      map(response => response.counts || [])
    );
  }

  // PRODUCT MAPPING MANAGEMENT

  getProductMappings(): Observable<ProductMapping[]> {
    return from(this.getProductMappingsAsync());
  }

  private async getProductMappingsAsync(): Promise<ProductMapping[]> {
    try {
      const mappingsCollection = collection(this.firestore, 'product_square_mappings');
      const snapshot = await getDocs(mappingsCollection);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          productId: data['productId'],
          squareCatalogObjectId: data['squareCatalogObjectId'],
          squareItemVariationId: data['squareItemVariationId'],
          productName: data['productName'],
          squareItemName: data['squareItemName'],
          syncEnabled: data['syncEnabled'] || true,
          lastSyncedAt: this.convertTimestampToDate(data['lastSyncedAt']),
          createdAt: this.convertTimestampToDate(data['createdAt']),
          updatedAt: this.convertTimestampToDate(data['updatedAt']),
          createdBy: data['createdBy']
        };
      });
    } catch (error) {
      console.error('Error getting product mappings:', error);
      return [];
    }
  }

  saveProductMapping(mapping: Omit<ProductMapping, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Observable<string> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.saveProductMappingAsync(mapping, user.uid));
      })
    );
  }

  deleteProductMapping(mappingId: string): Observable<void> {
    return from(this.deleteProductMappingAsync(mappingId));
  }

  private async deleteProductMappingAsync(mappingId: string): Promise<void> {
    try {
      const mappingsCollection = collection(this.firestore, 'product_square_mappings');
      const docRef = doc(mappingsCollection, mappingId);
      await updateDoc(docRef, {
        syncEnabled: false,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error deleting product mapping:', error);
      throw error;
    }
  }

  toggleMappingSync(mappingId: string, enabled: boolean): Observable<void> {
    return from(this.toggleMappingSyncAsync(mappingId, enabled));
  }

  private async toggleMappingSyncAsync(mappingId: string, enabled: boolean): Promise<void> {
    try {
      const mappingsCollection = collection(this.firestore, 'product_square_mappings');
      const docRef = doc(mappingsCollection, mappingId);
      await updateDoc(docRef, {
        syncEnabled: enabled,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error toggling mapping sync:', error);
      throw error;
    }
  }

  private async saveProductMappingAsync(
    mapping: Omit<ProductMapping, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>, 
    userId: string
  ): Promise<string> {
    try {
      const mappingsCollection = collection(this.firestore, 'product_square_mappings');
      
      const now = new Date();
      const mappingData = {
        ...mapping,
        createdAt: now,
        updatedAt: now,
        createdBy: userId
      };
      
      const docRef = await addDoc(mappingsCollection, this.convertToFirestore(mappingData));
      return docRef.id;
    } catch (error) {
      console.error('Error saving product mapping:', error);
      throw error;
    }
  }

  // SYNCHRONIZATION

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
      // Get product mappings
      const mappings = await this.getProductMappingsAsync();
      if (mappings.length === 0) {
        result.errors.push('No product mappings configured');
        return result;
      }

      result.itemsProcessed = orderItems.length;

      // Process each order item
      for (const orderItem of orderItems) {
        try {
          // Find the product mapping for this Square item
          const mapping = mappings.find(m => 
            m.squareItemVariationId === orderItem.catalog_object_id && m.syncEnabled
          );

          if (!mapping) {
            continue; // Skip unmapped items
          }

          // Get the product to access its recipe
          const product = await this.getProductById(mapping.productId);
          
          if (!product) {
            result.errors.push(`Product not found for mapping: ${mapping.productName}`);
            continue;
          }

          const quantity = parseInt(orderItem.quantity || '1');

          // Process each ingredient in the product recipe
          for (const ingredient of product.ingredients) {
            const consumedQuantity = ingredient.quantity * quantity;
            
            await this.inventoryService.updatePhysicalStock(
              ingredient.inventoryItemId,
              consumedQuantity,
              'OUT',
              'Square sale consumption',
              `Order ${squareOrderId}: ${quantity}x ${product.name}`
            ).toPromise();
          }

          result.itemsUpdated++;
        } catch (error) {
          result.errors.push(`Failed to process order item: ${error}`);
        }
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      result.errors.push(`Sale processing failed: ${error}`);
      return result;
    }
  }

  private async getProductById(productId: string): Promise<Product | null> {
    try {
      const product = await this.productService.getProduct(productId).toPromise();
      return product || null;
    } catch (error) {
      console.error('Error getting product:', error);
      return null;
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

  // Auto-mapping suggestions based on name/SKU matching
  suggestProductMappings(
    lobbyTraceProducts: Product[], 
    squareItems: SquareCatalogObject[]
  ): Array<{
    lobbyTraceProduct: Product;
    squareItem: SquareCatalogObject;
    confidence: number;
    reason: string;
  }> {
    const suggestions: Array<{
      lobbyTraceProduct: Product;
      squareItem: SquareCatalogObject;
      confidence: number;
      reason: string;
    }> = [];

    for (const ltProduct of lobbyTraceProducts) {
      for (const sqItem of squareItems) {
        if (sqItem.type !== 'ITEM_VARIATION') continue;

        const ltName = ltProduct.name.toLowerCase().trim();
        const ltVariation = (ltProduct.variation || '').toLowerCase().trim();
        const ltSku = (ltProduct.sku || '').toLowerCase().trim();
        
        const sqName = (sqItem.item_variation_data?.name || '').toLowerCase().trim();
        const sqSku = (sqItem.item_variation_data?.sku || '').toLowerCase().trim();

        // Exact name + variation match
        const ltFullName = ltVariation ? `${ltName} ${ltVariation}` : ltName;
        if (ltFullName === sqName) {
          suggestions.push({
            lobbyTraceProduct: ltProduct,
            squareItem: sqItem,
            confidence: 0.95,
            reason: 'Exact name + variation match'
          });
          continue;
        }

        // Exact name match
        if (ltName === sqName) {
          suggestions.push({
            lobbyTraceProduct: ltProduct,
            squareItem: sqItem,
            confidence: 0.90,
            reason: 'Exact name match'
          });
          continue;
        }

        // SKU match
        if (ltSku && sqSku && ltSku === sqSku) {
          suggestions.push({
            lobbyTraceProduct: ltProduct,
            squareItem: sqItem,
            confidence: 0.90,
            reason: 'SKU match'
          });
          continue;
        }

        // Token match (if exists from CSV import)
        if (ltProduct.token && sqItem.id === ltProduct.token) {
          suggestions.push({
            lobbyTraceProduct: ltProduct,
            squareItem: sqItem,
            confidence: 0.95,
            reason: 'Token ID match'
          });
          continue;
        }

        // Partial name match (contains all words)
        const ltWords = ltFullName.split(/\s+/);
        const sqWords = sqName.split(/\s+/);
        const commonWords = ltWords.filter(word => 
          sqWords.some(sqWord => sqWord.includes(word) || word.includes(sqWord))
        );
        
        if (commonWords.length >= Math.min(ltWords.length, sqWords.length) * 0.7) {
          suggestions.push({
            lobbyTraceProduct: ltProduct,
            squareItem: sqItem,
            confidence: 0.75,
            reason: `Partial name match (${commonWords.length}/${ltWords.length} words)`
          });
        }
      }
    }

    // Sort by confidence and remove duplicates
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .filter((item, index, self) => 
        index === self.findIndex(t => 
          t.lobbyTraceProduct.id === item.lobbyTraceProduct.id && 
          t.squareItem.id === item.squareItem.id
        )
      );
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
}