/**
 * Firebase Cloud Functions for LeeBoy's Wildlife Removal
 */

import {
  onCall,
  onRequest,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import * as logger from "firebase-functions/logger";
import {createHmac} from "crypto";
import cors from "cors";

// Initialize Firebase Admin
initializeApp();

const auth = getAuth();
const db = getFirestore();

/**
 * Set custom claims for admin users
 * Only callable by existing admin users
 */
export const setAdminClaim = onCall({
  cors: true,
}, async (request: CallableRequest) => {
  // Check if the calling user is authenticated
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  // Check if the calling user is already an admin
  const callerRecord = await auth.getUser(request.auth.uid);
  const isCallerAdmin = callerRecord.customClaims?.["admin"] === true;

  if (!isCallerAdmin) {
    const msg = "Only admin users can set admin claims";
    throw new HttpsError("permission-denied", msg);
  }

  const {uid, isAdmin} = request.data;

  if (!uid || typeof isAdmin !== "boolean") {
    const msg = "Invalid uid or isAdmin parameter";
    throw new HttpsError("invalid-argument", msg);
  }

  try {
    // Get target user's current claims to check if they're a super-admin
    const targetUser = await auth.getUser(uid);
    const targetClaims = targetUser.customClaims || {};

    // Protect super-admins from being demoted by regular admins
    if (targetClaims.superAdmin && !isAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Cannot demote super-admin. Super-admin privileges are protected."
      );
    }

    // Preserve existing superAdmin claim when updating admin status
    const newClaims = {
      admin: isAdmin,
      superAdmin: targetClaims.superAdmin || false,
    };

    // Set the custom claims
    await auth.setCustomUserClaims(uid, newClaims);

    // Update the user document in Firestore
    const role = targetClaims.superAdmin ?
      "superAdmin" : (isAdmin ? "admin" : "user");
    await db.collection("users").doc(uid).update({
      role: role,
      updatedAt: new Date(),
    });

    const action = isAdmin ? "granted" : "removed";
    logger.info(`Admin claim ${action} for user: ${uid}`);

    const message = `Admin privileges ${isAdmin ?
      "granted to" : "removed from"} user ${uid}`;
    return {
      success: true,
      message,
    };
  } catch (error) {
    logger.error("Error setting admin claim:", error);
    throw new HttpsError("internal", "Failed to update admin privileges");
  }
});

/**
 * Set super-admin status (super-admin only function)
 */
export const setSuperAdminClaim = onCall({
  cors: true,
}, async (request: CallableRequest) => {
  const {uid, isSuperAdmin} = request.data;
  const callerUid = request.auth?.uid;

  // Verify that the caller is authenticated
  if (!callerUid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  try {
    // Check if the caller is a super-admin
    const callerToken = await auth.getUser(callerUid);
    const callerClaims = callerToken.customClaims || {};

    if (!callerClaims.superAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Unauthorized: Super-admin access required"
      );
    }

    // Don't allow removing super-admin from self
    if (callerUid === uid && !isSuperAdmin) {
      throw new HttpsError(
        "permission-denied",
        "Cannot remove super-admin status from yourself"
      );
    }

    // Set the custom claims
    await auth.setCustomUserClaims(uid, {
      admin: true, // Super-admins are always admins
      superAdmin: isSuperAdmin,
    });

    // Update the user role in Firestore
    await db.collection("users").doc(uid).update({
      role: isSuperAdmin ? "superAdmin" : "admin",
      updatedAt: new Date(),
    });

    const action = isSuperAdmin ? "granted" : "revoked";
    logger.info(
      `Super-admin claim ${action} for user ${uid} by ${callerUid}`
    );

    const promoted = isSuperAdmin ? "promoted to" : "demoted from";
    return {
      success: true,
      message: `User ${promoted} super-admin successfully`,
      uid: uid,
      isSuperAdmin: isSuperAdmin,
    };
  } catch (error) {
    logger.error("Error setting super-admin claim:", error);
    throw new HttpsError(
      "internal",
      `Failed to update super-admin status: ${error}`
    );
  }
});

/**
 * Create the first superadmin user - one-time setup function
 */
export const createSuperAdmin = onCall({
  cors: true,
}, async (request: CallableRequest) => {
  const {email, password, firstName, lastName} = request.data;

  if (!email || !password || !firstName || !lastName) {
    throw new HttpsError(
      "invalid-argument",
      "Email, password, firstName, and lastName are required"
    );
  }

  try {
    // Check if any superadmin already exists
    const superadminQuery = await db.collection("users")
      .where("role", "==", "superAdmin")
      .limit(1)
      .get();

    if (!superadminQuery.empty) {
      throw new HttpsError(
        "failed-precondition",
        "A superadmin user already exists. Only one superadmin is allowed."
      );
    }

    // Create the user
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: firstName,
      firstName: firstName,
      lastName: lastName,
    });

    // Set superadmin claims
    await auth.setCustomUserClaims(userRecord.uid, {
      admin: true,
      superAdmin: true,
    });

    // Create user document in Firestore
    await db.collection("users").doc(userRecord.uid).set({
      email,
      firstName,
      lastName,
      role: "superAdmin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    logger.info(`Superadmin created: ${userRecord.uid}`);

    return {
      success: true,
      message: "Superadmin account created successfully",
      uid: userRecord.uid,
    };
  } catch (error) {
    logger.error("Error creating superadmin:", error);
    throw new HttpsError("internal", "Failed to create superadmin account");
  }
});

/**
 * Initialize first admin user with optional super-admin status
 * This is a one-time function to create the first admin
 * Should be called manually and then disabled/removed
 */
export const initializeFirstAdmin = onCall({
  cors: true,
}, async (
  request: CallableRequest
) => {
  const {email, asSuperAdmin} = request.data;

  if (!email) {
    throw new HttpsError("invalid-argument", "Email is required");
  }

  try {
    // Get user by email
    const userRecord = await auth.getUserByEmail(email);

    // Set admin/super-admin claims
    const claims = {
      admin: true,
      superAdmin: asSuperAdmin || false,
    };
    logger.info("Setting claims:", claims);
    await auth.setCustomUserClaims(userRecord.uid, claims);

    // Update Firestore document
    const role = asSuperAdmin ? "superAdmin" : "admin";
    logger.info(`Setting role in Firestore: ${role}`);
    await db.collection("users").doc(userRecord.uid).update({
      role: role,
      updatedAt: new Date(),
    });

    const adminType = asSuperAdmin ? "super-" : "";
    logger.info(
      `First ${adminType}admin initialized for user: ${userRecord.uid}`
    );

    const responseMessage = "UPDATED FUNCTION - " +
      `First ${adminType}admin successfully initialized for ${email}`;
    logger.info(`Returning message: ${responseMessage}`);

    return {
      success: true,
      message: responseMessage,
      uid: userRecord.uid,
      claims: claims,
      role: role,
    };
  } catch (error) {
    logger.error("Error initializing first admin:", error);
    throw new HttpsError("internal", "Failed to initialize admin");
  }
});

/**
 * Auto-create user profile when user signs up
 */
export const createUserProfile = onDocumentCreated(
  "users/{userId}",
  async (event) => {
    const userId = event.params.userId;
    const userData = event.data?.data();

    if (!userData) {
      logger.error("No user data found for user:", userId);
      return;
    }

    logger.info(`User profile created for: ${userId}`, userData);

    // We will add additional logic here like:
    // - Send welcome email
  }
);

// SQUARE WEBHOOK HANDLING

/**
 * Interface for Square webhook events
 */
interface SquareWebhookEvent {
  merchant_id: string;
  type: string;
  event_id: string;
  created_at: string;
  data: {
    type: string;
    id: string;
    object: {
      order: {
        id: string;
        location_id: string;
        state: string;
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

/**
 * Verify Square webhook signature.
 * @param {string} body - The raw request body as a string.
 * @param {string} signature - The signature from the Square webhook header.
 * @param {string} signatureKey - The secret key used to verify the signature.
 * @return {boolean} Returns true if the signature is valid, false otherwise.
 */
function verifySquareSignature(
  body: string,
  signature: string,
  signatureKey: string
): boolean {
  try {
    // Create HMAC SHA-256 hash
    const hmac = createHmac("sha256", signatureKey);
    hmac.update(body);
    const expectedSignature = hmac.digest("base64");

    // Compare signatures
    return signature === expectedSignature;
  } catch (error) {
    logger.error("Error verifying signature:", error);
    return false;
  }
}

/**
 * Process Square webhook events for inventory updates
 */
export const squareWebhook = onRequest({
  cors: true,
  timeoutSeconds: 60,
}, async (req, res) => {
  const corsHandler = cors({origin: true});

  corsHandler(req, res, async () => {
    // Only accept POST requests
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const body = JSON.stringify(req.body);
      const signature = req.headers["x-square-signature"] as string;

      logger.info("Received Square webhook", {
        signature: signature ? "present" : "missing",
        bodyLength: body.length,
        eventType: req.body.type,
        eventId: req.body.event_id,
      });

      // Get webhook signature key from Firestore
      let signatureKey: string | null = null;
      try {
        const configSnapshot = await db.collection("square_config")
          .limit(1).get();
        if (!configSnapshot.empty) {
          const configData = configSnapshot.docs[0].data();
          signatureKey = configData.webhookSignatureKey;
        }
      } catch (error) {
        logger.warn("Could not retrieve signature key:", error);
      }

      // Verify signature if we have a key
      if (signatureKey && signature) {
        const isValidSignature = verifySquareSignature(
          body,
          signature,
          signatureKey
        );
        if (!isValidSignature) {
          logger.error("Invalid webhook signature");
          await logWebhookEvent(req.body, false, "Invalid signature");
          res.status(401).send("Unauthorized - Invalid signature");
          return;
        }
        logger.info("Webhook signature verified successfully");
      } else if (signature) {
        logger.warn("Signature provided but no signature key configured");
      }

      const webhookEvent = req.body as SquareWebhookEvent;

      // Check for duplicate events
      const existingLogQuery = await db
        .collection("square_webhook_logs")
        .where("eventId", "==", webhookEvent.event_id)
        .limit(1)
        .get();

      if (!existingLogQuery.empty) {
        logger.info("Webhook event already processed:", webhookEvent.event_id);
        res.status(200).send("OK - Already processed");
        return;
      }

      // Process the webhook based on event type
      const success = await processWebhookEvent(webhookEvent);

      if (success) {
        await logWebhookEvent(webhookEvent, true);
        res.status(200).send("OK");
      } else {
        await logWebhookEvent(webhookEvent, false, "Processing failed");
        res.status(500).send("Processing failed");
      }
    } catch (error) {
      logger.error("Error processing Square webhook:", error);
      if (req.body) {
        await logWebhookEvent(req.body, false, `Error: ${error}`);
      }
      res.status(500).send("Internal Server Error");
    }
  });
});

/**
 * Process Square webhook events
 * @param {SquareWebhookEvent} event - The Square webhook event to process.
 */
async function processWebhookEvent(
  event: SquareWebhookEvent): Promise<boolean> {
  try {
    logger.info("Processing webhook event", {
      type: event.type,
      eventId: event.event_id,
      merchantId: event.merchant_id,
    });

    // Only process completed orders to avoid double-counting
    if (!["order.created", "order.updated", "order.fulfillment.updated"]
      .includes(event.type)) {
      logger.info("Ignoring event type:", event.type);
      return true; // Not an error, just not something we process
    }

    const order = event.data.object.order;

    // Only process completed orders
    if (order.state !== "COMPLETED") {
      logger.info("Ignoring non-completed order:", order.state);
      return true;
    }

    // Get product mappings
    const mappingsSnapshot = await db.collection("product_square_mappings")
      .get();
    interface ProductSquareMapping {
      id: string;
      squareItemVariationId: string;
      syncEnabled: boolean;
      productName?: string;
      productId?: string;
      [key: string]: any;
    }

    const mappings: ProductSquareMapping[] = mappingsSnapshot.docs.map((doc) =>{
      const data = doc.data();
      return {
        id: doc.id,
        squareItemVariationId: data.squareItemVariationId,
        syncEnabled: data.syncEnabled,
        productName: data.productName,
        productId: data.productId,
        ...data,
      };
    });

    if (mappings.length === 0) {
      logger.warn("No product mappings found");
      return false;
    }

    const errors: string[] = [];
    let itemsUpdated = 0;

    // Process each line item in the order
    for (const lineItem of order.line_items) {
      try {
        // Find the product mapping for this Square item
        const mapping = mappings.find((m) =>
          m.squareItemVariationId === lineItem.catalog_object_id &&
          m.syncEnabled
        );

        if (!mapping) {
          logger.info(`
            No mapping found for Square item: ${lineItem.catalog_object_id}
            `);
          continue; // Skip unmapped items
        }

        logger.info(`Processing mapped item: ${mapping.productName}`);

        // Get the product to access its recipe
        const productDoc = await db.collection("products")
          .doc(mapping.productId!)
          .get();
        if (!productDoc.exists) {
          errors.push(`Product not found: ${mapping.productName}`);
          continue;
        }

        const product = productDoc.data();
        if (!product?.ingredients || !Array.isArray(product.ingredients)) {
          logger.info(`
            No ingredients found for product: ${mapping.productName}
            `);
          continue;
        }

        const quantity = parseInt(lineItem.quantity) || 1;
        logger.info(`
          Processing ${quantity}x ${mapping.productName}
          with ${product.ingredients.length} ingredients
          `);

        // Process each ingredient in the product recipe
        for (const ingredient of product.ingredients) {
          if (!ingredient.inventoryItemId || !ingredient.quantity) {
            continue;
          }

          const consumedQuantity = ingredient.quantity * quantity;

          // Update inventory item stock
          const inventoryItemRef = db.collection("inventory_items")
            .doc(ingredient.inventoryItemId);
          const inventoryDoc = await inventoryItemRef.get();

          if (inventoryDoc.exists) {
            const inventoryData = inventoryDoc.data();
            const currentStock = inventoryData?.currentStock || 0;
            const newStock = Math.max(0, currentStock - consumedQuantity);

            await inventoryItemRef.update({
              currentStock: newStock,
              updatedAt: new Date(),
            });

            // Log the stock movement
            await db.collection("inventory_stock_movements").add({
              inventoryItemId: ingredient.inventoryItemId,
              type: "OUT",
              quantity: consumedQuantity,
              reason: "Square sale consumption",
              description: `
              Order ${order.id}: ${quantity}x ${mapping.productName}
              `,
              previousStock: currentStock,
              newStock: newStock,
              createdAt: new Date(),
              createdBy: "square-webhook",
            });

            logger.info(`
              Updated inventory: ${inventoryData?.name}, 
              consumed: ${consumedQuantity},
              new stock: ${newStock}
              `);
          }
        }

        itemsUpdated++;
      } catch (itemError) {
        const errorMessage = `
        Failed to process line item ${lineItem.uid}: ${itemError}
        `;
        logger.error(errorMessage);
        errors.push(errorMessage);
      }
    }

    // Update the product mapping's last sync time
    const relevantMappings = mappings.filter((mapping) =>
      order.line_items.some(
        (item) => item.catalog_object_id === mapping.squareItemVariationId
      )
    );

    for (const mapping of relevantMappings) {
      await db.collection("product_square_mappings").doc(mapping.id).update({
        lastSyncedAt: new Date(),
      });
    }

    logger.info(`
      Webhook processing complete. Items updated: ${itemsUpdated}, 
      Errors: ${errors.length}
      `);
    return errors.length === 0;
  } catch (error) {
    logger.error("Error processing webhook event:", error);
    return false;
  }
}

/**
 * Log webhook events for tracking and debugging
 * @param {SquareWebhookEvent} webhookEvent - The Square webhook event to log.
 * @param {boolean} success
 * Indicates if the webhook was processed successfully.
 * @param {string} [errorMessage] - Optional error message if processing failed.
 */
async function logWebhookEvent(
  webhookEvent: SquareWebhookEvent,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  try {
    await db.collection("square_webhook_logs").add({
      eventId: webhookEvent.event_id,
      eventType: webhookEvent.type,
      merchantId: webhookEvent.merchant_id,
      processed: true,
      processedAt: new Date(),
      success: success,
      errorMessage: errorMessage || null,
      receivedAt: new Date(),
      createdBy: "square-webhook",
    });
  } catch (error) {
    logger.error("Error logging webhook event:", error);
  }
}

/**
 * Square API Proxy Functions
 * These functions proxy Square API calls to avoid CORS issues
 */

// Test Square API connection
export const testSquareConnection = onCall({
  cors: true,
}, async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const {accessToken, environment} = request.data;

  if (!accessToken || !environment) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }

  try {
    const baseUrl = environment === "production"?
      "https://connect.squareup.com":
      "https://connect.squareupsandbox.com";

    const response = await fetch(`${baseUrl}/v2/locations`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Square-Version": "2023-10-18",
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      return {success: true};
    } else {
      const errorData = await response.text();
      logger.error("Square API error:", errorData);
      return {success: false, error: errorData};
    }
  } catch (error) {
    logger.error("Error testing Square connection:", error);
    return {success: false, error: String(error)};
  }
});

// Get Square locations
export const getSquareLocations = onCall({
  cors: true,
}, async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const {accessToken, environment} = request.data;

  if (!accessToken || !environment) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }

  try {
    const baseUrl = environment === "production"?
      "https://connect.squareup.com":
      "https://connect.squareupsandbox.com";

    const response = await fetch(`${baseUrl}/v2/locations`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Square-Version": "2023-10-18",
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {success: true, locations: data.locations || []};
    } else {
      const errorData = await response.text();
      logger.error("Square API error:", errorData);
      return {success: false, error: errorData};
    }
  } catch (error) {
    logger.error("Error fetching Square locations:", error);
    return {success: false, error: String(error)};
  }
});

// Get Square catalog items
export const getSquareCatalog = onCall({
  cors: true,
}, async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const {accessToken, environment} = request.data;

  if (!accessToken || !environment) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }

  try {
    const baseUrl = environment === "production"?
      "https://connect.squareup.com":
      "https://connect.squareupsandbox.com";

    const response = await fetch(`${baseUrl}/v2/catalog/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Square-Version": "2023-10-18",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        object_types: ["ITEM", "ITEM_VARIATION"],
        include_deleted_objects: false,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {success: true, objects: data.objects || []};
    } else {
      const errorData = await response.text();
      logger.error("Square API error:", errorData);
      return {success: false, error: errorData};
    }
  } catch (error) {
    logger.error("Error fetching Square catalog:", error);
    return {success: false, error: String(error)};
  }
});

// Get Square inventory counts
export const getSquareInventory = onCall({
  cors: true,
}, async (request: CallableRequest) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  const {
    accessToken,
    environment,
    locationId,
    catalogObjectIds,
  } = request.data;

  if (!accessToken || !environment || !locationId) {
    throw new HttpsError("invalid-argument", "Missing required parameters");
  }

  try {
    const baseUrl = environment === "production"?
      "https://connect.squareup.com":
      "https://connect.squareupsandbox.com";

    const body: any = {
      location_ids: [locationId],
      states: ["IN_STOCK"],
    };

    if (catalogObjectIds && catalogObjectIds.length > 0) {
      body.catalog_object_ids = catalogObjectIds;
    }

    const response = await fetch(
      `${baseUrl}/v2/inventory/counts/batch-retrieve`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Square-Version": "2023-10-18",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

    if (response.ok) {
      const data = await response.json();
      return {success: true, counts: data.counts || []};
    } else {
      const errorData = await response.text();
      logger.error("Square API error:", errorData);
      return {success: false, error: errorData};
    }
  } catch (error) {
    logger.error("Error fetching Square inventory:", error);
    return {success: false, error: String(error)};
  }
});
