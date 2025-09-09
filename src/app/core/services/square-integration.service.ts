import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap, map, catchError, of } from 'rxjs';
import { AuthService } from './auth.service';
import { InventoryService } from './inventory.service';
import { InventoryItem } from '../../shared/models/product.models';

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
  type: 'inventory.count.updated';
  event_id: string;
  created_at: string;
  data: {
    type: 'inventory';
    id: string;
    object: {
      inventory_counts: SquareInventoryItem[];
    };
  };
}

export interface InventoryMapping {
  id?: string;
  inventoryItemId: string;
  squareCatalogObjectId: string;
  squareItemVariationId: string;
  inventoryItemName: string;
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
    // TODO: Implement Firestore integration for Square config
    // This would store the configuration in a secure way
    return null;
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
    // TODO: Implement Firestore storage with proper encryption for access tokens
    throw new Error('Not implemented yet');
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

  // INVENTORY MAPPING MANAGEMENT

  getInventoryMappings(): Observable<InventoryMapping[]> {
    return from(this.getInventoryMappingsAsync());
  }

  private async getInventoryMappingsAsync(): Promise<InventoryMapping[]> {
    // TODO: Implement Firestore integration for inventory mappings
    return [];
  }

  saveInventoryMapping(mapping: Omit<InventoryMapping, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>): Observable<string> {
    return this.authService.userProfile$.pipe(
      switchMap(user => {
        if (!user) {
          throw new Error('User not authenticated');
        }
        return from(this.saveInventoryMappingAsync(mapping, user.uid));
      })
    );
  }

  private async saveInventoryMappingAsync(
    mapping: Omit<InventoryMapping, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>, 
    userId: string
  ): Promise<string> {
    // TODO: Implement Firestore storage
    throw new Error('Not implemented yet');
  }

  // SYNCHRONIZATION

  syncInventoryFromSquare(): Observable<SyncResult> {
    return from(this.syncInventoryFromSquareAsync());
  }

  private async syncInventoryFromSquareAsync(): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      itemsProcessed: 0,
      itemsUpdated: 0,
      errors: [],
      lastSyncAt: new Date()
    };

    try {
      // Get Square configuration
      const config = await this.getSquareConfigAsync();
      if (!config) {
        result.errors.push('Square configuration not found');
        return result;
      }

      // Get inventory mappings
      const mappings = await this.getInventoryMappingsAsync();
      if (mappings.length === 0) {
        result.errors.push('No inventory mappings configured');
        return result;
      }

      // Get Square inventory counts
      const catalogObjectIds = mappings.map(m => m.squareItemVariationId);
      const squareCounts = await this.getSquareInventoryCounts(config, catalogObjectIds).toPromise();
      
      result.itemsProcessed = mappings.length;

      // Process each mapping
      for (const mapping of mappings) {
        if (!mapping.syncEnabled) continue;

        try {
          const squareCount = squareCounts?.find(c => c.catalog_object_id === mapping.squareItemVariationId);
          if (squareCount) {
            const newQuantity = parseFloat(squareCount.quantity || '0');
            
            // Update inventory item using adjustment
            await this.inventoryService.updatePhysicalStock(
              mapping.inventoryItemId,
              newQuantity,
              'ADJUSTMENT',
              'Square sync adjustment',
              `Synced from Square at ${new Date().toISOString()}`
            ).toPromise();

            result.itemsUpdated++;
          }
        } catch (error) {
          result.errors.push(`Failed to sync ${mapping.inventoryItemName}: ${error}`);
        }
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      result.errors.push(`Sync failed: ${error}`);
      return result;
    }
  }

  // WEBHOOK HANDLING

  processWebhookEvent(event: SquareWebhookEvent): Observable<boolean> {
    return from(this.processWebhookEventAsync(event));
  }

  private async processWebhookEventAsync(event: SquareWebhookEvent): Promise<boolean> {
    try {
      if (event.type !== 'inventory.count.updated') {
        return false;
      }

      const inventoryCounts = event.data.object.inventory_counts;
      const mappings = await this.getInventoryMappingsAsync();

      for (const count of inventoryCounts) {
        const mapping = mappings.find(m => 
          m.squareItemVariationId === count.catalog_object_id && m.syncEnabled
        );

        if (mapping && count.state === 'IN_STOCK') {
          const newQuantity = parseFloat(count.quantity || '0');
          
          await this.inventoryService.updatePhysicalStock(
            mapping.inventoryItemId,
            newQuantity,
            'ADJUSTMENT',
            'Square webhook adjustment',
            `Updated via Square webhook event ${event.event_id}`
          ).toPromise();
        }
      }

      return true;
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
  suggestInventoryMappings(
    lobbyTraceItems: InventoryItem[], 
    squareItems: SquareCatalogObject[]
  ): Array<{
    lobbyTraceItem: InventoryItem;
    squareItem: SquareCatalogObject;
    confidence: number;
    reason: string;
  }> {
    const suggestions: Array<{
      lobbyTraceItem: InventoryItem;
      squareItem: SquareCatalogObject;
      confidence: number;
      reason: string;
    }> = [];

    for (const ltItem of lobbyTraceItems) {
      for (const sqItem of squareItems) {
        if (sqItem.type !== 'ITEM_VARIATION') continue;

        const ltName = ltItem.name.toLowerCase().trim();
        const sqName = (sqItem.item_variation_data?.name || '').toLowerCase().trim();
        const sqSku = (sqItem.item_variation_data?.sku || '').toLowerCase().trim();

        // Exact name match
        if (ltName === sqName) {
          suggestions.push({
            lobbyTraceItem: ltItem,
            squareItem: sqItem,
            confidence: 0.95,
            reason: 'Exact name match'
          });
          continue;
        }

        // SKU/Vendor Product ID match
        if (ltItem.vendorProductId && sqSku && ltItem.vendorProductId.toLowerCase() === sqSku) {
          suggestions.push({
            lobbyTraceItem: ltItem,
            squareItem: sqItem,
            confidence: 0.90,
            reason: 'SKU/Product ID match'
          });
          continue;
        }

        // Partial name match (contains all words)
        const ltWords = ltName.split(/\s+/);
        const sqWords = sqName.split(/\s+/);
        const commonWords = ltWords.filter(word => sqWords.some(sqWord => sqWord.includes(word) || word.includes(sqWord)));
        
        if (commonWords.length >= Math.min(ltWords.length, sqWords.length) * 0.8) {
          suggestions.push({
            lobbyTraceItem: ltItem,
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
          t.lobbyTraceItem.id === item.lobbyTraceItem.id && 
          t.squareItem.id === item.squareItem.id
        )
      );
  }
}