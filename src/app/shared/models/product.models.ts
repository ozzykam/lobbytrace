// Product and Inventory Models for LobbyTrace

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  unit: string; // 'g', 'ml', 'pieces', 'oz', etc.
  category: string; // 'coffee', 'cups', 'lids', 'sleeves', 'milk', etc.
  currentStock: number;
  minStockLevel: number;
  maxStockLevel?: number;
  costPerUnit: number;
  supplier?: string;
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
  token?: string; // From CSV - original Square token
  name: string;
  variation?: string; // '10oz (To Go)', '16oz (Here)', etc.
  sku?: string;
  description?: string;
  category: string; // 'Drinks', 'Bakery', 'Breakfast', etc.
  reportingCategory?: string;
  price: number;
  isActive: boolean;
  isArchived: boolean;
  
  // Ingredient specifications - this is what you want to customize
  ingredients: ProductIngredient[];
  
  // Preparation details
  preparationTime?: number; // minutes
  preparationInstructions?: string;
  
  // Nutritional info (optional)
  calories?: number;
  allergens?: string[];
  
  // Modifiers from CSV
  modifiers?: ProductModifier[];
  
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
  ingredients: ProductIngredient[];
  preparationTime?: number;
  preparationInstructions?: string;
  allergens?: string[];
}

export interface UpdateProductRequest extends Partial<CreateProductRequest> {
  id: string;
}

// For CSV import - Updated to match simplified CSV format
export interface CsvProductRow {
  Token: string;
  'Item Name': string;
  'Variation ': string; // Note: extra space in CSV header
  Categories: string;
  Price: string;
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