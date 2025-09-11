// Product and Inventory Models for LobbyTrace

export interface InventoryItem {
  id: string;
  name: string; // CommonName from CSV - display name
  description?: string; // VendorProductDescriptionOrName from CSV
  category: InventoryCategory;
  supplier?: string; // Vendor from CSV
  
  // Physical unit tracking (what staff count during audits)
  physicalUnit: string; // 'carton', 'bag', 'bottle', 'case', etc.
  currentPhysicalStock: number; // 12.5 (cartons, supports partial units)
  minPhysicalStockLevel: number; // 6 (cartons)
  maxPhysicalStockLevel?: number; // 24 (cartons)
  
  // Recipe unit tracking (what recipes consume)
  recipeUnit: string; // 'fl oz', 'oz', 'g', 'ml', 'each'
  unitsPerPhysicalItem: number; // 32 (fl oz per carton)
  
  // Cost tracking
  costPerPhysicalUnit: number; // Cost per carton/bag/etc.
  costPerRecipeUnit: number; // Cost per fl oz/oz/etc.
  
  // Admin settings for stock levels
  useCustomStockLevel: boolean; // If true, use item-specific levels instead of global default
  customStockLevelPercentage?: number; // Override global default (e.g., 0.3 for 30%)
  
  // Reference data from CSV
  vendorProductId?: string; // InventoryID from CSV
  packaging?: string; // Packaging info from CSV  
  brand?: string; // Brand from CSV
  
  // Metadata
  lastRestocked?: Date;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ProductIngredient {
  inventoryItemId: string;
  inventoryItemName: string; // Denormalized for quick display
  quantity: number;
  unit: string;
  notes?: string;
}

export interface Product {
  id: string;
  
  // SQUARE-MANAGED FIELDS (Read-only in LobbyTrace)
  token?: string; // Square catalog object ID - our sync key
  squareItemId?: string; // Square parent item ID
  squareVariationId?: string; // Square variation ID
  name: string; // From Square
  variation?: string; // From Square: '10oz (To Go)', '16oz (Here)', etc.
  sku?: string; // From Square
  description?: string; // From Square
  category: string; // From Square: 'Drinks', 'Bakery', 'Breakfast', etc.
  reportingCategory?: string; // From Square
  price: number; // From Square (in cents)
  isActive: boolean; // From Square
  isArchived: boolean; // From Square
  
  // Drink-specific attributes (extracted from variation for Drinks category)
  size?: DrinkSize; // '10oz', '16oz', etc.
  temperature?: DrinkTemperature; // 'Hot', 'Iced'
  toGoStatus?: ToGoStatus; // 'Here', 'To-Go'
  
  // Square modifiers
  modifiers?: ProductModifier[];
  
  // LOBBYTRACE-MANAGED FIELDS (Editable)
  ingredients: ProductIngredient[]; // Recipe management
  preparationTime?: number; // minutes
  preparationInstructions?: string;
  calories?: number;
  allergens?: string[];
  
  // Sync metadata
  lastSyncedFromSquare?: Date;
  squareDataHash?: string; // To detect changes
  
  // Meta fields
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface ProductModifier {
  name: string;
  enabled: boolean;
  options?: string[];
}

// For product creation/editing
export interface CreateProductRequest {
  name: string;
  variation?: string;
  description?: string;
  category: string;
  price: number;
  size?: DrinkSize;
  temperature?: DrinkTemperature;
  toGoStatus?: ToGoStatus;
  ingredients: ProductIngredient[];
  preparationTime?: number;
  preparationInstructions?: string;
  allergens?: string[];
  token?: string; // From CSV
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {
  id: string;
}

// For Square product import/sync
export interface SquareProductImportRequest {
  token: string; // Square variation ID
  squareItemId: string; // Square parent item ID
  squareVariationId: string; // Square variation ID
  name: string;
  variation?: string;
  sku?: string;
  description?: string;
  category: string;
  reportingCategory?: string;
  price: number; // in cents
  isActive: boolean;
  isArchived: boolean;
  size?: DrinkSize;
  temperature?: DrinkTemperature;
  toGoStatus?: ToGoStatus;
  modifiers?: ProductModifier[];
}

export interface SquareImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}

// For CSV import - Updated to match CSV format
export interface CsvProductRow {
  Token: string;
  ItemName: string;
  Variation: string; // Contains size, temp, and to-go info
  Size?: string; // Optional empty columns in CSV
  Temp?: string; // Optional empty columns in CSV
  ToGo?: string; // Optional empty columns in CSV
  Categories: string;
  Price: string;
}

// For inventory CSV import
export interface CsvInventoryRow {
  InventoryID: string;
  Vendor: string;
  CommonName: string;
  VendorProductDescriptionOrName: string;
  Brand: string;
  Packaging: string;
  ManufacturerName: string;
  CostPerCase: string;
  ItemCategory: string;
  OuterPackCount: string;
  InnerPackCount: string;
  UnitSizeValue: string;
  UnitSizeUnit: string;
  BaseUnit: string;
  UnitsPerCase: string;
  TotalBaseQty: string;
  TotalBaseQtyWithMetric: string;
  CostPerSmallestUnit: string;
  CostPerBaseUnit: string;
}

// For creating inventory items from CSV
export interface CreateInventoryItemRequest {
  name: string;
  description?: string;
  category: InventoryCategory;
  supplier?: string;
  physicalUnit: string;
  currentPhysicalStock: number;
  minPhysicalStockLevel: number;
  maxPhysicalStockLevel?: number;
  recipeUnit: string;
  unitsPerPhysicalItem: number;
  costPerPhysicalUnit: number;
  costPerRecipeUnit: number;
  useCustomStockLevel: boolean;
  customStockLevelPercentage?: number;
  vendorProductId?: string;
  packaging?: string;
  brand?: string;
}

export interface UpdateInventoryItemRequest extends Partial<CreateInventoryItemRequest> {
  id: string;
}

// Global inventory settings interface
export interface InventorySettings {
  defaultStockLevelPercentage: number; // Default 0.5 for 50%
  updatedAt: Date;
  updatedBy: string;
}

// Product category definitions
export const PRODUCT_CATEGORIES = [
  'Drinks',
  'Bakery', 
  'Breakfast',
  'Seasonal (Spring/Summer)',
  'Seasonal (Fall/Winter)',
  'Non Coffee Drinks',
  'Signature Drinks',
  'Beer',
  'Wine',
  'Retail'
] as const;

export type ProductCategory = typeof PRODUCT_CATEGORIES[number];

// Inventory item categories
export const INVENTORY_CATEGORIES = [
  'Coffee Beans',
  'Ground Coffee',
  'Milk & Dairy',
  'Syrups & Flavors',
  'Cups & Containers',
  'Lids',
  'Sleeves & Wraps',
  'Stirrers & Utensils',
  'Food Ingredients',
  'Bakery Supplies',
  'Cleaning Supplies',
  'Other'
] as const;

export type InventoryCategory = typeof INVENTORY_CATEGORIES[number];

// Common units of measurement
export const MEASUREMENT_UNITS = [
  'g',        // grams
  'kg',       // kilograms
  'ml',       // milliliters
  'l',        // liters
  'oz',       // ounces
  'fl oz',    // fluid ounces
  'lb',       // pounds
  'pieces',   // individual items
  'cups',     // measuring cups
  'tbsp',     // tablespoons
  'tsp',      // teaspoons
  'shots'     // espresso shots
] as const;

export type MeasurementUnit = typeof MEASUREMENT_UNITS[number];

// Drink-specific attribute types
export const DRINK_SIZES = [
  '10oz',
  '16oz',
  '8oz',
  '12oz',
  '20oz',
  '2oz'  // for shots like macchiato
] as const;

export const DRINK_TEMPERATURES = [
  'Hot',
  'Iced'
] as const;

export const TO_GO_STATUSES = [
  'Here',
  'To-Go'
] as const;

export type DrinkSize = typeof DRINK_SIZES[number];
export type DrinkTemperature = typeof DRINK_TEMPERATURES[number];
export type ToGoStatus = typeof TO_GO_STATUSES[number];