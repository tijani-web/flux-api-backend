import analyticsService from '../services/analyticsService.js';

export const getProjectAnalytics = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { period = '7d' } = req.query;
    
    const analytics = await analyticsService.getProjectAnalytics(projectId, req.user.id, period);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    next(error);
  }
};

export const getUserAnalytics = async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    const analytics = await analyticsService.getUserAnalytics(req.user.id, period);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    next(error);
  }
};

export const getEndpointAnalytics = async (req, res, next) => {
  try {
    const { endpointId } = req.params;
    const { period = '7d' } = req.query;
    
    const analytics = await analyticsService.getEndpointAnalytics(endpointId, req.user.id, period);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    next(error);
  }
};