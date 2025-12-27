// routes/webhookRoutes.js
import express from 'express';
import {
  createWebhook,
  getWebhooks,
  getWebhook,           
  updateWebhook,       
  triggerWebhook,
  deleteWebhook,
  getWebhookDeliveries  
} from '../controllers/webhookController.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateProjectAccess, requireEditPermission } from '../middleware/collaborationAuth.js';

const router = express.Router();

router.use(authMiddleware);

// Project-specific webhooks
router.post('/project/:projectId/webhooks', validateProjectAccess, requireEditPermission, createWebhook);
router.get('/project/:projectId/webhooks', validateProjectAccess, getWebhooks);

// Individual webhook operations
router.get('/webhooks/:webhookId', validateProjectAccess, getWebhook);            // GET single webhook
router.patch('/webhooks/:webhookId', validateProjectAccess, requireEditPermission, updateWebhook); // Update
router.delete('/webhooks/:webhookId', validateProjectAccess, requireEditPermission, deleteWebhook); // Delete
router.post('/webhooks/:webhookId/trigger', validateProjectAccess, requireEditPermission, triggerWebhook); // Trigger
router.get('/webhooks/:webhookId/deliveries', validateProjectAccess, getWebhookDeliveries); // Get deliveries

export default router;