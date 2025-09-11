import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, from, switchMap, map, catchError, of } from 'rxjs';
import { 
  Firestore, 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query,
  where,
  orderBy,
  limit,
  Timestamp
} from '@angular/fire/firestore';
import { AuthService } from './auth.service';
import { SquareIntegrationService, SquareWebhookEvent, SyncResult } from './square-integration.service';
import { environment } from '../../../environments/environment';

export interface WebhookLog {
  id?: string;
  eventId: string;
  eventType: string;
  merchantId: string;
  processed: boolean;
  processedAt?: Date;
  success: boolean;
  errorMessage?: string;
  syncResult?: SyncResult;
  receivedAt: Date;
  createdBy: string;
}

export interface WebhookSubscription {
  id?: string;
  name: string;
  eventTypes: string[];
  notificationUrl: string;
  signatureKey?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

@Injectable({
  providedIn: 'root'
})
export class SquareWebhookService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private squareService = inject(SquareIntegrationService);
  private firestore = inject(Firestore);

  private readonly webhookLogsCollection = collection(this.firestore, 'square_webhook_logs');
  private readonly subscriptionsCollection = collection(this.firestore, 'square_webhook_subscriptions');

  // Firebase Functions webhook endpoint
  private readonly defaultWebhookUrl = 'https://us-central1-lobbytrace-desk.cloudfunctions.net/squareWebhook';

  constructor() {}

  // WEBHOOK SUBSCRIPTION MANAGEMENT

  async createWebhookSubscription(config: any): Promise<string> {
    try {
      const headers = this.getSquareHeaders(config.accessToken);
      const baseUrl = config.environment === 'production' 
        ? 'https://connect.squareup.com' 
        : 'https://connect.squareupsandbox.com';

      const subscriptionRequest = {
        subscription: {
          name: 'LobbyTrace Inventory Sync',
          event_types: [
            'order.created',
            'order.updated', 
            'order.fulfillment.updated',
            'inventory.count.updated'
          ],
          notification_url: this.defaultWebhookUrl,
          api_version: '2023-10-18'
        }
      };

      const response = await this.http.post<any>(
        `${baseUrl}/v2/webhooks/subscriptions`,
        subscriptionRequest,
        { headers }
      ).toPromise();

      // Save subscription to Firestore for tracking
      if (response?.subscription) {
        await this.saveWebhookSubscription({
          name: response.subscription.name,
          eventTypes: response.subscription.event_types,
          notificationUrl: response.subscription.notification_url,
          signatureKey: response.subscription.signature_key,
          isActive: true
        });
      }

      return response?.subscription?.id || '';
    } catch (error) {
      console.error('Error creating webhook subscription:', error);
      throw error;
    }
  }

  async deleteWebhookSubscription(subscriptionId: string, config: any): Promise<void> {
    try {
      const headers = this.getSquareHeaders(config.accessToken);
      const baseUrl = config.environment === 'production' 
        ? 'https://connect.squareup.com' 
        : 'https://connect.squareupsandbox.com';

      await this.http.delete(
        `${baseUrl}/v2/webhooks/subscriptions/${subscriptionId}`,
        { headers }
      ).toPromise();

      // Mark as inactive in Firestore
      // Note: In a real implementation, you'd find and update the specific subscription
    } catch (error) {
      console.error('Error deleting webhook subscription:', error);
      throw error;
    }
  }

  // WEBHOOK EVENT PROCESSING

  processIncomingWebhook(
    webhookEvent: SquareWebhookEvent, 
    signature?: string, 
    signatureKey?: string
  ): Observable<boolean> {
    return from(this.processIncomingWebhookAsync(webhookEvent, signature, signatureKey));
  }

  private async processIncomingWebhookAsync(
    webhookEvent: SquareWebhookEvent,
    signature?: string,
    signatureKey?: string
  ): Promise<boolean> {
    try {
      // Verify webhook signature if provided
      if (signature && signatureKey) {
        const isValid = await this.verifyWebhookSignature(webhookEvent, signature, signatureKey);
        if (!isValid) {
          console.error('Invalid webhook signature');
          await this.logWebhookEvent(webhookEvent, false, 'Invalid signature');
          return false;
        }
      }

      // Check for duplicate events
      const existingLogs = await getDocs(
        query(
          this.webhookLogsCollection,
          where('eventId', '==', webhookEvent.event_id),
          limit(1)
        )
      );

      if (!existingLogs.empty) {
        console.log('Webhook event already processed:', webhookEvent.event_id);
        return true; // Already processed, return success
      }

      // Process the webhook event
      const success = await this.squareService.processWebhookEvent(webhookEvent).toPromise();
      
      // Log the webhook processing result
      await this.logWebhookEvent(webhookEvent, success || false);

      return success || false;
    } catch (error) {
      console.error('Error processing webhook:', error);
      await this.logWebhookEvent(webhookEvent, false, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  // WEBHOOK VERIFICATION

  private async verifyWebhookSignature(
    webhookEvent: SquareWebhookEvent,
    signature: string,
    signatureKey: string
  ): Promise<boolean> {
    try {
      // In a real implementation, you would verify the HMAC signature
      // This is a placeholder - actual implementation would use crypto libraries
      // to verify that the webhook came from Square
      
      // Example signature verification (simplified):
      // const expectedSignature = crypto
      //   .createHmac('sha256', signatureKey)
      //   .update(JSON.stringify(webhookEvent))
      //   .digest('base64');
      
      // return expectedSignature === signature;
      
      // For now, return true if both signature and key are provided
      return !!(signature && signatureKey);
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      return false;
    }
  }

  // LOGGING AND TRACKING

  private async logWebhookEvent(
    webhookEvent: SquareWebhookEvent,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      const user = await this.authService.userProfile$.pipe(
        switchMap(u => of(u))
      ).toPromise();

      const logEntry: Omit<WebhookLog, 'id'> = {
        eventId: webhookEvent.event_id,
        eventType: webhookEvent.type,
        merchantId: webhookEvent.merchant_id,
        processed: true,
        processedAt: new Date(),
        success,
        errorMessage,
        receivedAt: new Date(),
        createdBy: user?.uid || 'system'
      };

      await addDoc(this.webhookLogsCollection, this.convertToFirestore(logEntry));
    } catch (error) {
      console.error('Error logging webhook event:', error);
    }
  }

  getWebhookLogs(): Observable<WebhookLog[]> {
    return from(this.getWebhookLogsAsync());
  }

  private async getWebhookLogsAsync(): Promise<WebhookLog[]> {
    try {
      const q = query(
        this.webhookLogsCollection,
        orderBy('receivedAt', 'desc'),
        limit(100)
      );
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          eventId: data['eventId'],
          eventType: data['eventType'],
          merchantId: data['merchantId'],
          processed: data['processed'] || false,
          processedAt: this.convertTimestampToDate(data['processedAt']),
          success: data['success'] || false,
          errorMessage: data['errorMessage'],
          receivedAt: this.convertTimestampToDate(data['receivedAt']),
          createdBy: data['createdBy']
        };
      });
    } catch (error) {
      console.error('Error getting webhook logs:', error);
      return [];
    }
  }

  // SUBSCRIPTION MANAGEMENT

  private async saveWebhookSubscription(
    subscription: Omit<WebhookSubscription, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>
  ): Promise<string> {
    try {
      const user = await this.authService.userProfile$.pipe(
        switchMap(u => of(u))
      ).toPromise();

      const now = new Date();
      const subscriptionData: Omit<WebhookSubscription, 'id'> = {
        ...subscription,
        createdAt: now,
        updatedAt: now,
        createdBy: user?.uid || 'system'
      };

      const docRef = await addDoc(this.subscriptionsCollection, this.convertToFirestore(subscriptionData));
      return docRef.id;
    } catch (error) {
      console.error('Error saving webhook subscription:', error);
      throw error;
    }
  }

  getWebhookSubscriptions(): Observable<WebhookSubscription[]> {
    return from(this.getWebhookSubscriptionsAsync());
  }

  private async getWebhookSubscriptionsAsync(): Promise<WebhookSubscription[]> {
    try {
      const q = query(this.subscriptionsCollection, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data['name'],
          eventTypes: data['eventTypes'] || [],
          notificationUrl: data['notificationUrl'],
          signatureKey: data['signatureKey'],
          isActive: data['isActive'] || false,
          createdAt: this.convertTimestampToDate(data['createdAt']),
          updatedAt: this.convertTimestampToDate(data['updatedAt']),
          createdBy: data['createdBy']
        };
      });
    } catch (error) {
      console.error('Error getting webhook subscriptions:', error);
      return [];
    }
  }

  // TESTING AND DEBUGGING

  // Simulate a webhook event for testing
  simulateWebhookEvent(orderData: any): Observable<boolean> {
    const mockWebhookEvent: SquareWebhookEvent = {
      merchant_id: 'test_merchant',
      type: 'order.created',
      event_id: `test_${Date.now()}`,
      created_at: new Date().toISOString(),
      data: {
        type: 'order',
        id: orderData.id || 'test_order_id',
        object: {
          order: {
            id: orderData.id || 'test_order_id',
            location_id: orderData.locationId || 'test_location',
            state: 'COMPLETED',
            line_items: orderData.lineItems || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
      }
    };

    return this.processIncomingWebhook(mockWebhookEvent);
  }

  // Get webhook processing statistics
  getWebhookStats(): Observable<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    recentEvents: WebhookLog[];
  }> {
    return from(this.getWebhookStatsAsync());
  }

  private async getWebhookStatsAsync(): Promise<{
    totalEvents: number;
    successfulEvents: number;
    failedEvents: number;
    recentEvents: WebhookLog[];
  }> {
    try {
      const logs = await this.getWebhookLogsAsync();
      
      return {
        totalEvents: logs.length,
        successfulEvents: logs.filter(log => log.success).length,
        failedEvents: logs.filter(log => !log.success).length,
        recentEvents: logs.slice(0, 10)
      };
    } catch (error) {
      console.error('Error getting webhook stats:', error);
      return {
        totalEvents: 0,
        successfulEvents: 0,
        failedEvents: 0,
        recentEvents: []
      };
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

  private convertToFirestore(data: any): any {
    const result = { ...data };
    
    // Convert Date objects to Firestore Timestamps
    if (result.createdAt instanceof Date) {
      result.createdAt = Timestamp.fromDate(result.createdAt);
    }
    if (result.updatedAt instanceof Date) {
      result.updatedAt = Timestamp.fromDate(result.updatedAt);
    }
    if (result.receivedAt instanceof Date) {
      result.receivedAt = Timestamp.fromDate(result.receivedAt);
    }
    if (result.processedAt instanceof Date) {
      result.processedAt = Timestamp.fromDate(result.processedAt);
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