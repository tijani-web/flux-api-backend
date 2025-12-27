import prisma from '../config/database.js';
import crypto from 'crypto';

/**
 * WEBHOOK SERVICE
 * - Create and manage webhooks
 * - Trigger HTTP callbacks on events
 * - Retry failed webhooks
 * - Webhook signature verification
 */

class WebhookService {
  // Create a new webhook
  async createWebhook(projectId, userId, webhookData) {
    const { name, url, events, secret, isActive = true } = webhookData;

    // Verify project access
    await this.verifyProjectAccess(projectId, userId);

    // Generate webhook secret if not provided
    const webhookSecret = secret || crypto.randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: {
        projectId,
        name,
        url,
        events: Array.isArray(events) ? events : [events],
        secret: webhookSecret,
        isActive,
        createdBy: userId
      },
      include: {
        project: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return {
      ...webhook,
      secret: webhookSecret // Only return secret on creation
    };
  }

  // Get all webhooks for a project
  async getProjectWebhooks(projectId, userId) {
    await this.verifyProjectAccess(projectId, userId);

    const webhooks = await prisma.webhook.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        lastTriggeredAt: true,
        successCount: true,
        failureCount: true,
        _count: {
          select: {
            deliveries: true
          }
        }
      }
    });

    return webhooks;
  }

  // Trigger a webhook
  async triggerWebhook(webhookId, userId, payload) {
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      include: {
        project: {
          select: {
            id: true,
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!webhook) {
      throw new Error('WEBHOOK_NOT_FOUND');
    }

    // Verify access
    if (webhook.project.ownerId !== userId && 
        webhook.project.collaborators.length === 0) {
      throw new Error('WEBHOOK_ACCESS_DENIED');
    }

    if (!webhook.isActive) {
      throw new Error('WEBHOOK_INACTIVE');
    }

    const startTime = Date.now();
    let success = false;
    let statusCode = 0;
    let responseBody = '';
    let error = null;

    try {
      // Generate signature
      const timestamp = Date.now();
      const signature = this.generateSignature(
        JSON.stringify(payload),
        webhook.secret,
        timestamp
      );

      // Make HTTP request
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp.toString(),
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Event': 'manual_trigger'
        },
        body: JSON.stringify({
          event: 'manual_trigger',
          timestamp: new Date().toISOString(),
          data: payload,
          webhook: {
            id: webhook.id,
            name: webhook.name
          }
        }),
        timeout: 10000 // 10 second timeout
      });

      statusCode = response.status;
      responseBody = await response.text();
      success = response.ok;

      if (!response.ok) {
        error = `HTTP ${statusCode}: ${responseBody.substring(0, 200)}`;
      }

    } catch (err) {
      success = false;
      error = err.message;
    }

    const responseTime = Date.now() - startTime;

    // Log delivery
    await this.logDelivery({
      webhookId,
      url: webhook.url,
      payload: payload,
      success,
      statusCode,
      responseBody,
      error,
      responseTime,
      triggeredBy: userId
    });

    // Update webhook stats
    await prisma.webhook.update({
      where: { id: webhookId },
      data: {
        lastTriggeredAt: new Date(),
        ...(success ? 
          { successCount: { increment: 1 } } : 
          { failureCount: { increment: 1 } }
        )
      }
    });

    return {
      success,
      webhookId,
      url: webhook.url,
      statusCode,
      responseBody,
      error,
      responseTime,
      timestamp: new Date().toISOString()
    };
  }


// Get single webhook
async getWebhook(webhookId, userId) {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
    include: {
      project: {
        select: {
          ownerId: true,
          collaborators: {
            where: { userId: userId },
            select: { userId: true }
          }
        }
      }
    }
  });

  if (!webhook) {
    throw new Error('WEBHOOK_NOT_FOUND');
  }

  // Verify access
  if (webhook.project.ownerId !== userId && 
      webhook.project.collaborators.length === 0) {
    throw new Error('WEBHOOK_ACCESS_DENIED');
  }

  return {
    id: webhook.id,
    name: webhook.name,
    url: webhook.url,
    events: webhook.events,
    isActive: webhook.isActive,
    createdAt: webhook.createdAt,
    updatedAt: webhook.updatedAt,
    lastTriggeredAt: webhook.lastTriggeredAt,
    successCount: webhook.successCount,
    failureCount: webhook.failureCount,
    projectId: webhook.projectId,
    createdBy: webhook.createdBy
  };
}

// Update webhook
async updateWebhook(webhookId, userId, updateData) {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
    include: {
      project: {
        select: {
          ownerId: true,
          collaborators: {
            where: { userId: userId },
            select: { userId: true }
          }
        }
      }
    }
  });

  if (!webhook) {
    throw new Error('WEBHOOK_NOT_FOUND');
  }

  // Verify access
  if (webhook.project.ownerId !== userId && 
      webhook.project.collaborators.length === 0) {
    throw new Error('WEBHOOK_ACCESS_DENIED');
  }

  const updatedWebhook = await prisma.webhook.update({
    where: { id: webhookId },
    data: {
      name: updateData.name,
      url: updateData.url,
      events: updateData.events,
      isActive: updateData.isActive,
      ...(updateData.secret && { secret: updateData.secret })
    },
    select: {
      id: true,
      name: true,
      url: true,
      events: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      lastTriggeredAt: true,
      successCount: true,
      failureCount: true,
      projectId: true,
      createdBy: true
    }
  });

  return updatedWebhook;
}

  // Delete a webhook
  async deleteWebhook(webhookId, userId) {
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
      include: {
        project: {
          select: {
            ownerId: true,
            collaborators: {
              where: { userId: userId },
              select: { userId: true }
            }
          }
        }
      }
    });

    if (!webhook) {
      throw new Error('WEBHOOK_NOT_FOUND');
    }

    // Verify access
    if (webhook.project.ownerId !== userId && 
        webhook.project.collaborators.length === 0) {
      throw new Error('WEBHOOK_ACCESS_DENIED');
    }

    // Delete webhook and its deliveries
    await prisma.$transaction([
      prisma.webhookDelivery.deleteMany({
        where: { webhookId }
      }),
      prisma.webhook.delete({
        where: { id: webhookId }
      })
    ]);

    return { success: true };
  }

  // Verify project access
  async verifyProjectAccess(projectId, userId) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        OR: [
          { ownerId: userId },
          { collaborators: { some: { userId: userId } } }
        ]
      }
    });

    if (!project) {
      throw new Error('PROJECT_ACCESS_DENIED');
    }

    return true;
  }

  // Generate webhook signature
  generateSignature(payload, secret, timestamp) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}.${payload}`);
    return hmac.digest('hex');
  }

  // Verify webhook signature
  verifySignature(payload, signature, secret, timestamp) {
    const expectedSignature = this.generateSignature(payload, secret, timestamp);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // Log webhook delivery
  async logDelivery(deliveryData) {
    try {
      await prisma.webhookDelivery.create({
        data: {
          webhookId: deliveryData.webhookId,
          url: deliveryData.url,
          payload: deliveryData.payload,
          success: deliveryData.success,
          statusCode: deliveryData.statusCode,
          responseBody: deliveryData.responseBody,
          error: deliveryData.error,
          responseTime: deliveryData.responseTime,
          triggeredBy: deliveryData.triggeredBy
        }
      });
    } catch (error) {
      console.error('Failed to log webhook delivery:', error);
    }
  }

  // Get webhook delivery history
async getDeliveryHistory(webhookId, userId, limit = 20) {
  const webhook = await prisma.webhook.findUnique({
    where: { id: webhookId },
    include: {
      project: {
        select: {
          ownerId: true,
          collaborators: {
            where: { userId: userId },
            select: { userId: true }
          }
        }
      }
    }
  });

  if (!webhook) {
    throw new Error('WEBHOOK_NOT_FOUND');
  }

  // Verify access
  if (webhook.project.ownerId !== userId && 
      webhook.project.collaborators.length === 0) {
    throw new Error('WEBHOOK_ACCESS_DENIED');
  }

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      success: true,
      statusCode: true,
      responseTime: true,
      error: true,
      responseBody: true, 
      payload: true,      
      url: true,          
      event: true,        
      createdAt: true,
      triggeredBy: true
    }
  });

  return deliveries;
}

  // Retry failed webhook deliveries
  async retryFailedDelivery(deliveryId, userId) {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        webhook: {
          include: {
            project: {
              select: {
                ownerId: true,
                collaborators: {
                  where: { userId: userId },
                  select: { userId: true }
                }
              }
            }
          }
        }
      }
    });

    if (!delivery) {
      throw new Error('DELIVERY_NOT_FOUND');
    }

    // Verify access
    if (delivery.webhook.project.ownerId !== userId && 
        delivery.webhook.project.collaborators.length === 0) {
      throw new Error('ACCESS_DENIED');
    }

    if (delivery.success) {
      throw new Error('DELIVERY_ALREADY_SUCCESSFUL');
    }

    // Retry the webhook
    return await this.triggerWebhook(
      delivery.webhookId,
      userId,
      delivery.payload
    );
  }
}

export default new WebhookService();