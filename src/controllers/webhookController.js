import webhookService from '../services/webhookService.js';

export const createWebhook = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const webhook = await webhookService.createWebhook(projectId, req.user.id, req.body);
    
    res.status(201).json({
      success: true,
      message: 'Webhook created successfully',
      data: webhook
    });
    
  } catch (error) {
    next(error);
  }
};

export const getWebhooks = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const webhooks = await webhookService.getProjectWebhooks(projectId, req.user.id);
    
    res.json({
      success: true,
      data: webhooks
    });
    
  } catch (error) {
    next(error);
  }
};

export const getWebhookDeliveries = async (req, res, next) => {
  try {
    const { webhookId } = req.params;
    const { limit = 20 } = req.query;
    
    const deliveries = await webhookService.getDeliveryHistory(
      webhookId, 
      req.user.id, 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: deliveries
    });
    
  } catch (error) {
    next(error);
  }
};

export const triggerWebhook = async (req, res, next) => {
  try {
    const { webhookId } = req.params;
    const result = await webhookService.triggerWebhook(webhookId, req.user.id, req.body);
    
    res.json({
      success: true,
      message: 'Webhook triggered successfully',
      data: result
    });
    
  } catch (error) {
    next(error);
  }
};

export const getWebhook = async (req, res, next) => {
  try {
    const { webhookId } = req.params;
    
    const webhook = await webhookService.getWebhook(webhookId, req.user.id);
    
    res.json({
      success: true,
      data: webhook
    });
    
  } catch (error) {
    next(error);
  }
};

export const updateWebhook = async (req, res, next) => {
  try {
    const { webhookId } = req.params;
    
    const updated = await webhookService.updateWebhook(webhookId, req.user.id, req.body);
    
    res.json({
      success: true,
      message: 'Webhook updated successfully',
      data: updated
    });
    
  } catch (error) {
    next(error);
  }
};


export const deleteWebhook = async (req, res, next) => {
  try {
    const { webhookId } = req.params;
    await webhookService.deleteWebhook(webhookId, req.user.id);
    
    res.json({
      success: true,
      message: 'Webhook deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
};