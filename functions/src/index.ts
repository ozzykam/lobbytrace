/**
 * Firebase Cloud Functions for LeeBoy's Wildlife Removal
 */

import {onCall, CallableRequest, HttpsError} from "firebase-functions/v2/https";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import * as logger from "firebase-functions/logger";

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
